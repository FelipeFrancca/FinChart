/**
 * Bank Email Parsers
 *
 * Funções de parsing para extrair dados de transações financeiras
 * a partir de emails de notificação bancária (Nubank, Itaú, etc.).
 *
 * Cada banco possui um formato diferente de HTML/Texto nos emails,
 * então cada parser implementa regex específicas para seu formato.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedTransaction {
  /** Valor da transação em reais (ex: 42.90) */
  valor: number;
  /** Nome do estabelecimento onde a transação ocorreu */
  estabelecimento: string;
  /** Data da transação (extraída do email) */
  data: Date;
  /** Banco de origem identificado */
  banco: 'nubank' | 'itau' | string;
}

type BankParser = (content: string, date: Date) => ParsedTransaction | null;

// ─── Parser: Nubank ──────────────────────────────────────────────────────────

/**
 * Parser para emails de notificação do Nubank.
 *
 * Formatos conhecidos de emails do Nubank:
 * - Compra no cartão: "Compra de R$ 42,90 em ESTABELECIMENTO aprovada"
 * - Compra no débito: "Compra no débito de R$ 15,00 em LOJA aprovada"
 * - Pagamento via Pix: "Você fez um Pix de R$ 100,00 para NOME"
 *
 * TODO: Ajustar regex conforme emails reais forem analisados.
 */
function parseNubankEmail(content: string, date: Date): ParsedTransaction | null {
  // Remove HTML tags para trabalhar com texto limpo
  const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  // Padrão 1: "Compra de R$ XX,XX em ESTABELECIMENTO aprovada"
  // Padrão 2: "Compra no débito de R$ XX,XX em ESTABELECIMENTO aprovada"
  const compraRegex = /compra(?:\s+no\s+d[eé]bito)?\s+de\s+R\$\s*([\d.,]+)\s+em\s+(.+?)\s+aprovada/i;
  const compraMatch = text.match(compraRegex);

  if (compraMatch) {
    return {
      valor: parseValorBRL(compraMatch[1]),
      estabelecimento: normalizeEstabelecimento(compraMatch[2]),
      data: date,
      banco: 'nubank',
    };
  }

  // Padrão 3: "Você fez um Pix de R$ XX,XX para NOME"
  const pixRegex = /pix\s+de\s+R\$\s*([\d.,]+)\s+para\s+(.+?)(?:\.|$)/i;
  const pixMatch = text.match(pixRegex);

  if (pixMatch) {
    return {
      valor: parseValorBRL(pixMatch[1]),
      estabelecimento: normalizeEstabelecimento(pixMatch[2]),
      data: date,
      banco: 'nubank',
    };
  }

  return null;
}

// ─── Parser: Itaú ────────────────────────────────────────────────────────────

/**
 * Parser para emails de notificação do Itaú.
 *
 * Formatos conhecidos de emails do Itaú:
 * - Compra no cartão: "Compra aprovada no cartão final XXXX - R$ 42,90 - ESTABELECIMENTO"
 * - Compra com Pix: "Pix enviado - R$ 100,00 - NOME DESTINATÁRIO"
 *
 * TODO: Ajustar regex conforme emails reais forem analisados.
 */
function parseItauEmail(content: string, date: Date): ParsedTransaction | null {
  // Remove HTML tags para trabalhar com texto limpo
  const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  // Padrão 1: "Compra aprovada no cartão final XXXX - R$ XX,XX - ESTABELECIMENTO"
  const compraRegex = /compra\s+aprovada.*?R\$\s*([\d.,]+)\s*[-–]\s*(.+?)(?:\s*[-–]|$)/i;
  const compraMatch = text.match(compraRegex);

  if (compraMatch) {
    return {
      valor: parseValorBRL(compraMatch[1]),
      estabelecimento: normalizeEstabelecimento(compraMatch[2]),
      data: date,
      banco: 'itau',
    };
  }

  // Padrão 2: "Pix enviado - R$ XX,XX - NOME DESTINATÁRIO"
  const pixRegex = /pix\s+enviado.*?R\$\s*([\d.,]+)\s*[-–]\s*(.+?)(?:\s*[-–]|$)/i;
  const pixMatch = text.match(pixRegex);

  if (pixMatch) {
    return {
      valor: parseValorBRL(pixMatch[1]),
      estabelecimento: normalizeEstabelecimento(pixMatch[2]),
      data: date,
      banco: 'itau',
    };
  }

  return null;
}

// ─── Parser: Banco Inter ─────────────────────────────────────────────────────

function parseInterEmail(content: string, date: Date): ParsedTransaction | null {
  const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  let valor = 0;
  let estabelecimento = 'Desconhecido';

  const valorMatch = text.match(/R\$\s*([\d.,]+)/i);
  if (valorMatch) valor = parseValorBRL(valorMatch[1]);

  const estabMatch = text.match(/(?:estabelecimento|recebedor|para)\s*[:-]\s*([a-zA-Z0-9\s]+?)(?:(?:valor|data|cpf|cnpj|\.)|$)/i) 
                  || text.match(/compra\s+(?:de\s+)?R\$\s*[\d.,]+\s*(?:em|no|na)\s+(.+?)(?:\s+aprovada|\.|$)/i);

  if (estabMatch) estabelecimento = normalizeEstabelecimento(estabMatch[1]);

  if (valor > 0) {
    return { valor, estabelecimento, data: date, banco: 'inter' };
  }
  return null;
}

// ─── Parser: Mercado Pago ────────────────────────────────────────────────────

function parseMercadoPagoEmail(content: string, date: Date): ParsedTransaction | null {
  const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  const regex = /(?:pagamento|pagou|enviou|compra).*?R\$\s*([\d.,]+)\s*(?:no|na|em|para)\s+(.+?)(?:\.|$)/i;
  const match = text.match(regex);

  if (match) {
    return {
      valor: parseValorBRL(match[1]),
      estabelecimento: normalizeEstabelecimento(match[2]),
      data: date,
      banco: 'mercado pago',
    };
  }
  return null;
}

// ─── Parser: Bradesco ────────────────────────────────────────────────────────

function parseBradescoEmail(content: string, date: Date): ParsedTransaction | null {
  const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  let valor = 0;
  let estabelecimento = 'Desconhecido';

  const valorMatch = text.match(/R\$\s*([\d.,]+)/i);
  if (valorMatch) valor = parseValorBRL(valorMatch[1]);

  const estabMatch = text.match(/(?:estabelecimento|favorecido|nome do recebedor|para)\s*[:-]?\s*([a-zA-Z0-9\s]+?)(?:(?:valor|data|sujeito|atenciosamente|\.)|$)/i);
  if (estabMatch) estabelecimento = normalizeEstabelecimento(estabMatch[1]);

  if (valor > 0) {
    return { valor, estabelecimento, data: date, banco: 'bradesco' };
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converte uma string de valor em formato BRL (ex: "1.234,56") para number.
 *
 * Trata os seguintes formatos:
 * - "42,90"      → 42.90
 * - "1.234,56"   → 1234.56
 * - "1234.56"    → 1234.56 (fallback para formato com ponto decimal)
 */
function parseValorBRL(valorStr: string): number {
  // Remove espaços
  let cleaned = valorStr.trim();

  // Formato brasileiro: pontos como separador de milhar, vírgula como decimal
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }

  const valor = parseFloat(cleaned);
  return isNaN(valor) ? 0 : valor;
}

/**
 * Normaliza o nome do estabelecimento:
 * - Remove espaços extras
 * - Capitaliza as palavras
 */
function normalizeEstabelecimento(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => {
      // Mantém preposições em minúsculo
      const preposicoes = ['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na'];
      if (preposicoes.includes(word.toLowerCase())) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

// ─── Registry de Parsers ─────────────────────────────────────────────────────

/**
 * Mapeamento de domínios de remetente → parser correspondente.
 * Para adicionar suporte a um novo banco, basta incluir uma nova entrada aqui.
 */
const parserRegistry: Array<{ pattern: string; parser: BankParser }> = [
  { pattern: 'nubank', parser: parseNubankEmail },
  { pattern: 'itau', parser: parseItauEmail },
  { pattern: 'inter', parser: parseInterEmail },
  { pattern: 'mercadopago', parser: parseMercadoPagoEmail },
  { pattern: 'bradesco', parser: parseBradescoEmail },
];

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Factory function que roteia o conteúdo do email para o parser correto
 * baseado no endereço do remetente.
 *
 * @param from - Endereço de email do remetente (ex: "notificacoes@nubank.com.br")
 * @param content - Conteúdo do email (HTML ou texto)
 * @param date - Data do email
 * @returns ParsedTransaction se o parsing for bem-sucedido, null caso contrário
 *
 * @example
 * ```ts
 * const result = parseBankEmail(
 *   'notificacoes@nubank.com.br',
 *   'Compra de R$ 42,90 em PADARIA CENTRAL aprovada',
 *   new Date()
 * );
 * // result = { valor: 42.90, estabelecimento: 'Padaria Central', data: Date, banco: 'nubank' }
 * ```
 */
export function parseBankEmail(
  from: string,
  content: string,
  date: Date,
): ParsedTransaction | null {
  const fromLower = from.toLowerCase();

  for (const { pattern, parser } of parserRegistry) {
    if (fromLower.includes(pattern)) {
      return parser(content, date);
    }
  }

  // Remetente não reconhecido
  return null;
}
