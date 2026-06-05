import { Alert, AlertType, AlertSeverity, Prisma } from '@prisma/client';
import { prisma } from '../database/conexao';
import { logger } from '../utils/logger';
import emailServico from './emailServico';
import { getNotificationPreferences } from './notificationPreferencesServico';
import * as pushNotificationServico from './pushNotificationServico';

export async function createAlert(
    dashboardId: string,
    userId: string,
    data: {
        type: AlertType;
        severity: AlertSeverity;
        title: string;
        message: string;
        relatedType?: string;
        relatedId?: string;
        metadata?: any;
    }
) {
    const { checkPermission } = await import('./paineisServico');
    await checkPermission(userId, dashboardId, ['OWNER', 'EDITOR']);

    const alert = await prisma.alert.create({
        data: {
            ...data,
            dashboard: {
                connect: { id: dashboardId },
            },
            user: {
                connect: { id: userId },
            },
        },
    });

    // Enviar notificação por email se habilitado
    await sendEmailNotification(alert, userId);

    // Enviar push notification se habilitado
    await sendPushNotification(alert, userId);

    return alert;
}

async function sendEmailNotification(alert: Alert, userId: string) {
    try {
        const preferences = await getNotificationPreferences(userId);

        // Verificar se notificações por email estão habilitadas
        if (!preferences.emailEnabled) {
            return;
        }

        // Obter dados do usuário
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true },
        });

        if (!user?.email) {
            return;
        }

        // Verificar tipo de alerta e preferências específicas
        if (alert.type === 'BUDGET_ALERT' && preferences.emailBudgetAlerts) {
            const metadata = alert.metadata as any;
            await emailServico.enviarAlertaOrcamento({
                email: user.email,
                nome: user.name || 'Usuário',
                categoria: metadata?.categoria || 'Categoria',
                limite: metadata?.limite || 0,
                gasto: metadata?.gasto || 0,
                percentual: metadata?.percentual || 0,
            });
        } else if (alert.type === 'GOAL_MILESTONE' && preferences.emailGoalMilestones) {
            const metadata = alert.metadata as any;
            await emailServico.enviarAlertaMeta({
                email: user.email,
                nome: user.name || 'Usuário',
                meta: metadata?.meta || 'Meta',
                valorAlvo: metadata?.valorAlvo || 0,
                valorAtual: metadata?.valorAtual || 0,
                percentual: metadata?.percentual || 0,
            });
        }
    } catch (error) {
        logger.error('Erro ao enviar notificação por email:', error);
        // Não propagar o erro para não afetar a criação do alerta
    }
}

async function sendPushNotification(alert: Alert, userId: string) {
    try {
        const metadata = alert.metadata as any;

        if (alert.type === 'BUDGET_ALERT') {
            await pushNotificationServico.sendBudgetAlertPush(userId, {
                categoria: metadata?.categoria || 'Categoria',
                percentual: metadata?.percentual || 0,
                limite: metadata?.limite || 0,
                gasto: metadata?.gasto || 0,
            });
        } else if (alert.type === 'GOAL_MILESTONE') {
            await pushNotificationServico.sendGoalMilestonePush(userId, {
                meta: metadata?.meta || 'Meta',
                percentual: metadata?.percentual || 0,
                valorAtual: metadata?.valorAtual || 0,
                valorAlvo: metadata?.valorAlvo || 0,
            });
        }
    } catch (error) {
        logger.error('Erro ao enviar push notification:', error);
        // Não propagar o erro para não afetar a criação do alerta
    }
}

export async function getAlerts(dashboardId: string, userId: string, unreadOnly = false) {
    const { checkPermission } = await import('./paineisServico');
    await checkPermission(userId, dashboardId);

    return prisma.alert.findMany({
        where: {
            dashboardId,
            ...(unreadOnly ? { isRead: false } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
    });
}

export async function markAsRead(alertId: string, dashboardId: string, userId: string) {
    const { checkPermission } = await import('./paineisServico');
    await checkPermission(userId, dashboardId);

    return prisma.alert.updateMany({
        where: { id: alertId, dashboardId },
        data: { isRead: true, readAt: new Date() },
    });
}

export async function markAllAsRead(dashboardId: string, userId: string) {
    const { checkPermission } = await import('./paineisServico');
    await checkPermission(userId, dashboardId);

    return prisma.alert.updateMany({
        where: { dashboardId, isRead: false },
        data: { isRead: true, readAt: new Date() },
    });
}

export async function checkAutomaticAlerts(dashboardId: string, userId: string) {
    const { checkPermission } = await import('./paineisServico');
    await checkPermission(userId, dashboardId);

    // Verificar Orçamentos - Budget is linked to userId, not dashboardId
    const budgets = await prisma.budget.findMany({
        where: { userId, isActive: true, deletedAt: null },
    });

    // Lógica simplificada de verificação
    // Implementação real seria mais complexa
}

export async function deleteAlert(alertId: string, dashboardId: string, userId: string) {
    const { checkPermission } = await import('./paineisServico');
    await checkPermission(userId, dashboardId, ['OWNER', 'EDITOR']);

    return prisma.alert.deleteMany({
        where: { id: alertId, dashboardId },
    });
}
