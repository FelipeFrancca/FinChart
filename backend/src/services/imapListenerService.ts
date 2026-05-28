/**
 * IMAP Listener Service
 *
 * Serviço que conecta a contas de email via IMAP IDLE para escutar
 * notificações bancárias em tempo real e criar transações automaticamente.
 *
 * Características:
 * - Configurações IMAP armazenadas no banco (ImapConfiguration)
 * - Senhas encriptadas com AES-256-GCM
 * - Listeners indexados por configId
 * - Suporta start/stop dinâmico por config
 * - Reconexão automática com backoff exponencial
 * - Integração com Prisma para persistência de transações
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { logger } from '../utils/logger';
import { prisma } from '../database/conexao';
import { decryptSymmetric } from '../utils/crypto';
import { parseBankEmail } from '../utils/bankEmailParsers';
import type { ParsedTransaction } from '../utils/bankEmailParsers';

// ─── Constants ───────────────────────────────────────────────────────────────

const CONTEXT = 'IMAPListener';
const RECONNECT_BASE_DELAY_MS = 5_000; // 5 segundos
const RECONNECT_MAX_DELAY_MS = 300_000; // 5 minutos
const MAILBOX = 'INBOX';

// ─── Active Connections Tracking ─────────────────────────────────────────────

/** Mapa de configId → cliente ImapFlow ativo */
const activeConnections: Map<string, ImapFlow> = new Map();

/**
 * Flags para controlar se um listener deve continuar tentando reconectar.
 * Quando `stopListenerForConfig` é chamado, o flag é setado para `false`
 * para interromper o loop de reconexão.
 */
const shouldReconnect: Map<string, boolean> = new Map();

// ─── Transaction Persistence ─────────────────────────────────────────────────

/**
 * Persiste uma transação parseada no banco de dados via Prisma.
 * Recupera todos os dashboards vinculados a esta configuração IMAP e 
 * insere a transação neles.
 */
async function persistTransaction(
  parsed: ParsedTransaction,
  configId: string,
  emailSubject: string,
): Promise<void> {
  try {
    const config = await prisma.imapConfiguration.findUnique({
      where: { id: configId },
      include: {
        user: true,
        dashboards: true
      }
    });

    if (!config || config.dashboards.length === 0) {
      logger.warn(
        `Configuração ${configId} não encontrada ou sem dashboards vinculados. Transação ignorada.`,
        CONTEXT,
      );
      return;
    }

    // Insert transaction into all linked dashboards
    for (const dashboard of config.dashboards) {
      const transaction = await prisma.transaction.create({
        data: {
          date: parsed.data,
          entryType: 'Despesa',
          flowType: 'Variável',
          category: 'Outros', // Categoria padrão - pode ser ajustada depois
          description: parsed.estabelecimento,
          amount: parsed.valor,
          institution: parsed.banco.charAt(0).toUpperCase() + parsed.banco.slice(1),
          paymentMethod: 'Cartão de Crédito',
          notes: `[Auto] Importado via email - ${emailSubject}`,
          userId: dashboard.ownerId,
          dashboardId: dashboard.id,
        },
      });

      logger.info(
        `✅ Transação criada [dashboard=${dashboard.id}]: R$ ${parsed.valor.toFixed(2)} em "${parsed.estabelecimento}" (${parsed.banco})`,
        CONTEXT,
        { transactionId: transaction.id },
      );
    }
  } catch (error) {
    logger.error(
      `Erro ao persistir transação [configId=${configId}]`,
      error,
      CONTEXT,
      {
        valor: parsed.valor,
        estabelecimento: parsed.estabelecimento,
        banco: parsed.banco,
      },
    );
  }
}

// ─── Email Processing ────────────────────────────────────────────────────────

/**
 * Processa um email individual: faz parse com mailparser,
 * extrai dados com bankEmailParsers e persiste no banco.
 */
async function processEmail(
  client: ImapFlow,
  seq: string,
  configId: string,
): Promise<void> {
  try {
    // Buscar o email completo
    const message = await client.fetchOne(seq, {
      source: true,
      envelope: true,
    });

    if (!message || !message.source) {
      logger.debug(`Email seq=${seq} sem conteúdo source, ignorando`, CONTEXT);
      return;
    }

    // Parse do email com mailparser
    const parsed = await simpleParser(message.source);

    const from = parsed.from?.value?.[0]?.address || '';
    const subject = parsed.subject || '(sem assunto)';
    const emailDate = parsed.date || new Date();

    // Usar texto ou HTML como conteúdo
    const content = parsed.text || parsed.html || '';

    if (!from || !content) {
      logger.debug(
        `Email seq=${seq} sem remetente ou conteúdo, ignorando`,
        CONTEXT,
      );
      return;
    }

    logger.debug(
      `Processando email de "${from}" - "${subject}"`,
      CONTEXT,
    );

    // Tentar extrair transação do email
    const transaction = parseBankEmail(from, content, emailDate);

    if (transaction) {
      logger.info(
        `💰 Transação detectada [configId=${configId}]: R$ ${transaction.valor.toFixed(2)} - ${transaction.estabelecimento} (${transaction.banco})`,
        CONTEXT,
      );

      await persistTransaction(transaction, configId, subject);
    } else {
      logger.debug(
        `Email de "${from}" não é notificação bancária reconhecida`,
        CONTEXT,
      );
    }
  } catch (error) {
    logger.error(
      `Erro ao processar email seq=${seq} [configId=${configId}]`,
      error,
      CONTEXT,
    );
  }
}

// ─── IMAP Connection & Listener ──────────────────────────────────────────────

/**
 * Inicia uma conexão IMAP com IDLE para uma configuração específica.
 * Implementa reconexão automática com backoff exponencial.
 *
 * @param configId - ID da configuração
 * @param host - Host IMAP
 * @param port - Porta IMAP
 * @param user - Usuário/email da conta
 * @param pass - Senha decriptada
 */
async function runImapLoop(
  configId: string,
  host: string,
  port: number,
  user: string,
  pass: string,
): Promise<void> {
  let reconnectAttempt = 0;
  const accountLabel = `${user} [configId=${configId}]`;

  async function connect(): Promise<void> {
    // Verificar se devemos continuar reconectando
    if (!shouldReconnect.get(configId)) {
      logger.info(`Reconexão cancelada para ${accountLabel} (listener parado)`, CONTEXT);
      return;
    }

    const client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user, pass },
      logger: false,
    });

    try {
      logger.info(`Conectando IMAP para ${accountLabel}...`, CONTEXT);

      await client.connect();
      reconnectAttempt = 0; // Reset no sucesso

      // Registrar conexão ativa
      activeConnections.set(configId, client);

      logger.info(`✅ IMAP conectado para ${accountLabel}`, CONTEXT);

      // Abrir INBOX
      const lock = await client.getMailboxLock(MAILBOX);

      try {
        // Listener para novos emails (evento `exists`)
        client.on('exists', async (data: { path: string; count: number; prevCount: number }) => {
          logger.info(
            `📩 Novo(s) email(s) para ${accountLabel}: ${data.count - data.prevCount} novo(s)`,
            CONTEXT,
          );

          for (let seq = data.prevCount + 1; seq <= data.count; seq++) {
            await processEmail(client, String(seq), configId);
          }
        });

        logger.info(
          `📡 IDLE ativo para ${accountLabel} em ${MAILBOX}`,
          CONTEXT,
        );

        // Aguardar até que a conexão caia
        await new Promise<void>((resolve) => {
          client.on('close', () => {
            logger.warn(`Conexão IMAP fechada para ${accountLabel}`, CONTEXT);
            resolve();
          });

          client.on('error', (err) => {
            logger.error(`Erro na conexão IMAP para ${accountLabel}`, err, CONTEXT);
            client.close().catch(() => {});
            resolve();
          });
        });
      } finally {
        lock.release();
      }
    } catch (error: any) {
      logger.error(`Falha ao conectar/manter conexão para ${accountLabel}`, error, CONTEXT);
    } finally {
      activeConnections.delete(configId);
    }

    // Lógica de Reconexão (se a flag ainda estiver true)
    if (shouldReconnect.get(configId)) {
      // Backoff exponencial: delay dobra a cada tentativa, até o máximo.
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempt),
        RECONNECT_MAX_DELAY_MS,
      );

      reconnectAttempt++;

      logger.info(
        `🔄 Tentando reconectar ${accountLabel} em ${delay / 1000}s (tentativa ${reconnectAttempt})...`,
        CONTEXT,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      await connect();
    }
  }

  // Iniciar loop
  await connect();
}

// ─── Controller Interface ────────────────────────────────────────────────────

/**
 * Inicia ou reinicia o listener para uma configuração IMAP específica.
 *
 * Busca os dados no banco, descriptografa a senha e dispara o loop de conexão.
 * Se já existir uma conexão para este config, ela é encerrada graciosamente primeiro.
 *
 * @param configId ID da configuração IMAP
 */
export async function startListenerForConfig(configId: string): Promise<void> {
  try {
    // Buscar configuração no banco
    const config = await prisma.imapConfiguration.findUnique({
      where: { id: configId },
    });

    if (!config) {
      logger.warn(`Configuração ${configId} não encontrada no banco.`, CONTEXT);
      return;
    }

    if (!config.isActive) {
      logger.info(`Configuração ${configId} está desativada. Listener não iniciado.`, CONTEXT);
      return;
    }

    // Se já existe, parar a anterior primeiro
    if (activeConnections.has(configId)) {
      logger.info(`Parando listener existente para [configId=${configId}]...`, CONTEXT);
      await stopListenerForConfig(configId);
    }

    logger.info(`🚀 Iniciando worker IMAP para [configId=${configId}] (${config.emailUser})`, CONTEXT);

    // Marcar intenção de reconexão contínua
    shouldReconnect.set(configId, true);

    const decryptedPassword = decryptSymmetric(config.encryptedPassword);

    // Rodar o loop de conexão assincronamente (sem bloquear a thread)
    runImapLoop(
      configId,
      config.host,
      config.port,
      config.emailUser,
      decryptedPassword,
    ).catch((err) => {
      logger.error(`Erro crítico no loop IMAP para ${configId}`, err, CONTEXT);
    });
  } catch (error) {
    logger.error(`Erro ao iniciar listener IMAP para ${configId}`, error, CONTEXT);
  }
}

/**
 * Para o listener IMAP para uma configuração específica.
 *
 * Interrompe a conexão atual (se houver) e previne reconexões automáticas.
 *
 * @param configId ID da configuração IMAP
 */
export async function stopListenerForConfig(configId: string): Promise<void> {
  // Desativar intenção de reconexão
  shouldReconnect.set(configId, false);

  const client = activeConnections.get(configId);
  if (client) {
    try {
      logger.info(`Encerrando conexão IMAP graciosa para [configId=${configId}]...`, CONTEXT);
      // Fazer logout envia comando IMAP de encerramento antes de fechar socket
      await client.logout();
    } catch (error) {
      logger.warn(`Erro ao fazer logout IMAP para [configId=${configId}], forçando fechamento`, CONTEXT);
      client.close();
    } finally {
      activeConnections.delete(configId);
    }
  } else {
    logger.debug(`Nenhuma conexão ativa encontrada para [configId=${configId}]`, CONTEXT);
  }
}

/**
 * Carrega e inicia os listeners para todas as configurações ativas no banco.
 * Ideal para ser chamado no bootstrap/startup da aplicação.
 */
export async function bootAllActiveListeners(): Promise<void> {
  try {
    const configs = await prisma.imapConfiguration.findMany({
      where: { isActive: true },
    });

    if (configs.length === 0) {
      logger.info('📬 Nenhuma configuração IMAP ativa encontrada no banco. Worker não iniciado.', CONTEXT);
      return;
    }

    logger.info(`🔄 Iniciando ${configs.length} workers IMAP...`, CONTEXT);

    for (const config of configs) {
      await startListenerForConfig(config.id);
    }
  } catch (error) {
    logger.error('Erro ao inicializar workers IMAP', error, CONTEXT);
  }
}

/**
 * Encerra todas as conexões ativas simultaneamente.
 * Ideal para Graceful Shutdown da aplicação (SIGINT, SIGTERM).
 */
export async function stopAllListeners(): Promise<void> {
  logger.info(`Encerrando todas as ${activeConnections.size} conexões IMAP ativas...`, CONTEXT);

  // Setar tudo para false primeiro
  for (const configId of shouldReconnect.keys()) {
    shouldReconnect.set(configId, false);
  }

  // Disparar logout para todos
  const promises = Array.from(activeConnections.entries()).map(async ([configId, client]) => {
    try {
      await client.logout();
    } catch (error) {
      client.close();
    }
  });

  await Promise.allSettled(promises);
  activeConnections.clear();
  logger.info('✅ Todas as conexões IMAP encerradas', CONTEXT);
}
