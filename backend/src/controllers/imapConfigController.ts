import { Request, Response } from 'express';
import { prisma } from '../database/conexao';
import { AuthRequest } from '../middleware/auth';
import { encryptSymmetric, decryptSymmetric } from '../utils/crypto';
import { startListenerForConfig, stopListenerForConfig } from '../services/imapListenerService';
import { ImapFlow } from 'imapflow';
import { logger } from '../utils/logger';

export const getUserConfigs = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    
    const configs = await prisma.imapConfiguration.findMany({
        where: { userId },
        include: {
            dashboards: { select: { id: true, title: true } }
        }
    });

    const maskedConfigs = configs.map(config => ({
        ...config,
        encryptedPassword: '***'
    }));

    res.json({ success: true, data: maskedConfigs });
};

export const createConfig = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { host, port, emailUser, emailPass } = req.body;

    const encryptedPassword = encryptSymmetric(emailPass);

    const config = await prisma.imapConfiguration.create({
        data: { userId, host, port, emailUser, encryptedPassword, isActive: true },
        include: {
            dashboards: { select: { id: true, title: true } }
        }
    });

    // We don't start the listener yet because it has no dashboards linked.
    
    res.json({ success: true, data: { ...config, encryptedPassword: '***' } });
};

export const updateConfig = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { host, port, emailUser, emailPass, isActive } = req.body;

    // Validate ownership
    const existingConfig = await prisma.imapConfiguration.findFirst({
        where: { id, userId }
    });

    if (!existingConfig) {
        return res.status(404).json({ success: false, error: 'Configuração não encontrada' });
    }

    const dataToUpdate: any = {};
    if (host !== undefined) dataToUpdate.host = host;
    if (port !== undefined) dataToUpdate.port = port;
    if (emailUser !== undefined) dataToUpdate.emailUser = emailUser;
    if (isActive !== undefined) dataToUpdate.isActive = isActive;
    
    if (emailPass && emailPass.trim() !== '') {
        dataToUpdate.encryptedPassword = encryptSymmetric(emailPass);
    }

    const config = await prisma.imapConfiguration.update({
        where: { id },
        data: dataToUpdate,
        include: {
            dashboards: { select: { id: true, title: true } }
        }
    });

    // Se estiver ativa, garante que o worker tente reconectar/iniciar
    if (config.isActive) {
        await startListenerForConfig(config.id);
    } else {
        await stopListenerForConfig(config.id);
    }

    res.json({ success: true, data: { ...config, encryptedPassword: '***' } });
};

export const deleteConfig = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { id } = req.params;

    const existingConfig = await prisma.imapConfiguration.findFirst({
        where: { id, userId }
    });

    if (!existingConfig) {
        return res.status(404).json({ success: false, error: 'Configuração não encontrada' });
    }

    // Para o worker antes de deletar
    await stopListenerForConfig(id);

    await prisma.imapConfiguration.delete({
        where: { id }
    });

    res.json({ success: true });
};

export const testConnection = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { host, port, emailUser, emailPass, configId } = req.body;

    let testHost = host;
    let testPort = port;
    let testUser = emailUser;
    let testPass = emailPass;

    // Se configId foi fornecido, buscar credenciais do banco
    if (configId) {
        const config = await prisma.imapConfiguration.findFirst({
            where: { id: configId, userId },
        });

        if (!config) {
            return res.status(404).json({ success: false, error: 'Configuração não encontrada.' });
        }

        testHost = config.host;
        testPort = config.port;
        testUser = config.emailUser;
        testPass = decryptSymmetric(config.encryptedPassword);
    }

    if (!testHost || !testUser || !testPass) {
        return res.status(400).json({ success: false, error: 'Credenciais incompletas para teste.' });
    }

    const client = new ImapFlow({
        host: testHost,
        port: testPort || 993,
        secure: true,
        auth: { user: testUser, pass: testPass },
        logger: false,
    });

    try {
        // Timeout de 10 segundos para a tentativa de conexão
        const connectPromise = client.connect();
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: conexão IMAP demorou mais de 10 segundos.')), 10_000)
        );

        await Promise.race([connectPromise, timeoutPromise]);

        // Se chegou aqui, a conexão foi bem-sucedida
        logger.info(`✅ Teste de conexão IMAP bem-sucedido para ${testUser}`, 'IMAPTest');

        await client.logout();

        res.json({
            success: true,
            message: `Conexão com ${testHost} para ${testUser} realizada com sucesso!`,
        });
    } catch (error: any) {
        logger.warn(`❌ Teste de conexão IMAP falhou para ${testUser}: ${error.message}`, 'IMAPTest');

        // Tentar fechar graciosamente
        try { client.close(); } catch (_) { /* ignore */ }

        const friendlyMessage =
            error.message?.includes('Invalid credentials')
                ? 'Credenciais inválidas. Verifique o email e a senha de app.'
                : error.message?.includes('Timeout')
                    ? 'Timeout: o servidor IMAP não respondeu a tempo. Verifique o host e a porta.'
                    : error.message?.includes('getaddrinfo')
                        ? `Host IMAP "${testHost}" não encontrado. Verifique se o endereço está correto.`
                        : `Falha na conexão: ${error.message}`;

        res.status(400).json({
            success: false,
            error: friendlyMessage,
        });
    }
};
