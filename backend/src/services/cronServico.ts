/**
 * Cron Service - Tarefas Agendadas
 * Sistema de jobs automáticos para análise financeira
 */

import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../database/conexao';
import { logger } from '../utils/logger';
import { financialAnalysisService } from './analysisServico';
import { aiRouter } from './aiRouterServico';
import { createAlert } from './alertasServico';
import emailServico from './emailServico';
import { AlertSeverity, AlertType } from '@prisma/client';

// Tipo para jobs agendados
interface CronJob {
    name: string;
    schedule: string;
    handler: () => Promise<void>;
    task?: ScheduledTask;
}

/**
 * Serviço de tarefas agendadas
 */
class CronService {
    private jobs: CronJob[] = [];
    private isRunning = false;

    constructor() {
        this.registerJobs();
    }

    /**
     * Registra todos os jobs
     */
    private registerJobs() {
        // Job diário - verificação de orçamentos (8h, sem IA)
        this.jobs.push({
            name: 'dailyBudgetCheck',
            schedule: '0 8 * * *', // 8:00 todos os dias
            handler: this.dailyBudgetCheck.bind(this),
        });

        // Job a cada 6 horas - verificação leve
        this.jobs.push({
            name: 'periodicCheck',
            schedule: '0 */6 * * *', // A cada 6 horas
            handler: this.periodicCheck.bind(this),
        });

        // Job semanal - resumo (segundas 9h, com IA)
        this.jobs.push({
            name: 'weeklyReport',
            schedule: '0 9 * * 1', // 9:00 toda segunda-feira
            handler: this.generateWeeklyReports.bind(this),
        });

        // Job mensal - relatório completo (dia 1, 9h, com IA)
        this.jobs.push({
            name: 'monthlyReport',
            schedule: '0 9 1 * *', // 9:00 dia 1 de cada mês
            handler: this.generateMonthlyReports.bind(this),
        });
    }

    /**
     * Inicia todos os jobs
     */
    start() {
        if (this.isRunning) {
            logger.warn('CronService já está em execução', 'CronService');
            return;
        }

        this.jobs.forEach(job => {
            if (!cron.validate(job.schedule)) {
                logger.error(`Schedule inválido para job ${job.name}: ${job.schedule}`, 'CronService');
                return;
            }

            job.task = cron.schedule(job.schedule, async () => {
                logger.info(`Executando job: ${job.name}`, 'CronService');
                try {
                    await job.handler();
                    logger.info(`Job ${job.name} concluído com sucesso`, 'CronService');
                } catch (error) {
                    logger.error(`Erro no job ${job.name}`, error, 'CronService');
                }
            });

            logger.info(`Job registrado: ${job.name} (${job.schedule})`, 'CronService');
        });

        this.isRunning = true;
        logger.info('CronService iniciado com sucesso', 'CronService');
    }

    /**
     * Para todos os jobs
     */
    stop() {
        this.jobs.forEach(job => {
            if (job.task) {
                job.task.stop();
            }
        });
        this.isRunning = false;
        logger.info('CronService parado', 'CronService');
    }

    /**
     * Executa um job manualmente (para testes)
     */
    async runJob(jobName: string): Promise<void> {
        const job = this.jobs.find(j => j.name === jobName);
        if (!job) {
            throw new Error(`Job não encontrado: ${jobName}`);
        }
        await job.handler();
    }

    // ================================
    // HANDLERS DOS JOBS
    // ================================

    /**
     * Verificação diária de orçamentos (sem IA)
     */
    private async dailyBudgetCheck(): Promise<void> {
        // Buscar todos os dashboards ativos com orçamentos
        const dashboards = await prisma.dashboard.findMany({
            include: {
                members: {
                    where: { role: 'OWNER' },
                    include: { user: true },
                },
            },
        });

        for (const dashboard of dashboards) {
            try {
                const owner = dashboard.members[0]?.user;
                if (!owner) continue;

                // Buscar orçamentos ativos
                const budgets = await prisma.budget.findMany({
                    where: {
                        userId: owner.id,
                        isActive: true,
                        deletedAt: null,
                    },
                });

                // Verificar cada orçamento
                const now = new Date();
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

                for (const budget of budgets) {
                    // Calcular gastos na categoria
                    const spent = await prisma.transaction.aggregate({
                        where: {
                            dashboardId: dashboard.id,
                            category: budget.category || undefined,
                            entryType: 'Despesa',
                            date: { gte: monthStart },
                            deletedAt: null,
                        },
                        _sum: { amount: true },
                    });

                    const totalSpent = spent._sum.amount || 0;
                    const percentage = (totalSpent / budget.amount) * 100;

                    // Verificar se ultrapassa alerta
                    if (budget.alertAt && percentage >= budget.alertAt) {
                        await createAlert(dashboard.id, owner.id, {
                            type: 'BUDGET_ALERT' as AlertType,
                            severity: percentage >= 100 ? 'WARNING' : 'INFO' as AlertSeverity,
                            title: percentage >= 100
                                ? `Orçamento "${budget.name}" ultrapassado!`
                                : `Orçamento "${budget.name}" em ${percentage.toFixed(0)}%`,
                            message: `Você gastou R$ ${totalSpent.toFixed(2)} de R$ ${budget.amount.toFixed(2)} (${percentage.toFixed(1)}%)`,
                            relatedType: 'Budget',
                            relatedId: budget.id,
                            metadata: {
                                categoria: budget.category,
                                limite: budget.amount,
                                gasto: totalSpent,
                                percentual: percentage,
                            },
                        });
                    }
                }
            } catch (error) {
                logger.error(`Erro ao verificar orçamentos do dashboard ${dashboard.id}`, error, 'CronService');
            }
        }
    }

    /**
     * Verificação periódica leve (a cada 6h)
     */
    private async periodicCheck(): Promise<void> {
        // Verificar transações recorrentes pendentes
        const now = new Date();
        const pendingRecurring = await prisma.recurringTransaction.findMany({
            where: {
                isActive: true,
                nextDate: { lte: now },
                deletedAt: null,
            },
            include: {
                user: true,
                dashboard: true,
            },
        });

        for (const recurring of pendingRecurring) {
            try {
                // Criar transação automática
                await prisma.transaction.create({
                    data: {
                        date: recurring.nextDate,
                        entryType: recurring.entryType,
                        flowType: recurring.flowType,
                        category: recurring.category,
                        subcategory: recurring.subcategory,
                        description: recurring.description,
                        amount: recurring.amount,
                        userId: recurring.userId,
                        dashboardId: recurring.dashboardId,
                        accountId: recurring.accountId,
                    },
                });

                // Atualizar próxima data
                const nextDate = this.calculateNextDate(recurring.nextDate, recurring.frequency, recurring.interval);

                await prisma.recurringTransaction.update({
                    where: { id: recurring.id },
                    data: {
                        lastDate: recurring.nextDate,
                        nextDate,
                    },
                });

                logger.info(`Transação recorrente criada: ${recurring.description}`, 'CronService');
            } catch (error) {
                logger.error(`Erro ao processar recorrência ${recurring.id}`, error, 'CronService');
            }
        }
    }

    /**
     * Geração de relatórios semanais (com IA)
     */
    private async generateWeeklyReports(): Promise<void> {
        // Buscar usuários com preferência de resumo semanal ativada
        const preferences = await prisma.notificationPreferences.findMany({
            where: { emailWeeklySummary: true },
            include: { user: true },
        });

        const weekEnd = new Date();
        const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weekNumber = Math.ceil((weekEnd.getDate()) / 7);

        for (const pref of preferences) {
            try {
                const user = pref.user;

                // Buscar dashboard principal do usuário
                const membership = await prisma.dashboardMember.findFirst({
                    where: { userId: user.id, role: 'OWNER' },
                });

                if (!membership) continue;

                // Obter dados da semana
                const summary = await financialAnalysisService.getFinancialSummary(
                    membership.dashboardId,
                    user.id,
                    weekStart,
                    weekEnd
                );

                // Pular IA se não houver atividade para economizar tokens
                let aiSummary = "Você não teve movimentações nesta semana. Mantenha o foco nas suas metas!";
                if (summary.totalExpenses > 0 || summary.totalIncome > 0) {
                    // Gerar texto com IA apenas se houve atividade
                    aiSummary = await aiRouter.generateWeeklySummary({
                        userName: user.name || 'Usuário',
                        weekNumber,
                        totalSpent: summary.totalExpenses,
                        topCategories: summary.categoryBreakdown.slice(0, 5).map(c => ({
                            name: c.category,
                            amount: c.amount,
                        })),
                        unusualTransactions: summary.unusualTransactions.slice(0, 3).map(t => ({
                            description: t.description,
                            amount: t.amount,
                        })),
                        budgetAlerts: [], // TODO: integrar com orçamentos
                    });
                }

                // Criar alerta no sistema
                await createAlert(membership.dashboardId, user.id, {
                    type: 'SYSTEM_UPDATE' as AlertType,
                    severity: 'INFO' as AlertSeverity,
                    title: `📊 Resumo Semanal - Semana ${weekNumber}`,
                    message: aiSummary,
                    metadata: {
                        weekNumber,
                        totalSpent: summary.totalExpenses,
                        totalIncome: summary.totalIncome,
                    },
                });

                // Enviar email
                if (user.email) {
                    await emailServico.enviarResumoSemanal?.({
                        email: user.email,
                        nome: user.name || 'Usuário',
                        semana: weekNumber,
                        totalGastos: summary.totalExpenses,
                        totalReceitas: summary.totalIncome,
                        saldo: summary.balance,
                        resumo: aiSummary,
                    });
                }

                logger.info(`Resumo semanal enviado para ${user.email}`, 'CronService');
            } catch (error) {
                logger.error(`Erro ao gerar resumo semanal para usuário ${pref.userId}`, error, 'CronService');
            }
        }
    }

    /**
     * Geração de relatórios mensais (com IA)
     */
    private async generateMonthlyReports(): Promise<void> {
        // Similar ao semanal, mas com período mensal
        const preferences = await prisma.notificationPreferences.findMany({
            where: { emailMonthlySummary: true },
            include: { user: true },
        });

        const now = new Date();
        const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const monthName = monthStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

        for (const pref of preferences) {
            try {
                const user = pref.user;

                const membership = await prisma.dashboardMember.findFirst({
                    where: { userId: user.id, role: 'OWNER' },
                });

                if (!membership) continue;

                // Obter dados do mês
                const summary = await financialAnalysisService.getFinancialSummary(
                    membership.dashboardId,
                    user.id,
                    monthStart,
                    monthEnd
                );

                // Gerar análise com IA apenas se houver atividade
                let aiAnalysis = "Você não teve movimentações neste mês. Registre suas finanças para manter o controle!";
                if (summary.totalExpenses > 0 || summary.totalIncome > 0) {
                    aiAnalysis = await financialAnalysisService.getAIInsights(
                        membership.dashboardId,
                        user.id,
                        monthStart,
                        monthEnd
                    );
                }

                // Criar alerta
                await createAlert(membership.dashboardId, user.id, {
                    type: 'SYSTEM_UPDATE' as AlertType,
                    severity: 'INFO' as AlertSeverity,
                    title: `📈 Relatório Mensal - ${monthName}`,
                    message: aiAnalysis,
                    metadata: {
                        month: monthName,
                        totalSpent: summary.totalExpenses,
                        totalIncome: summary.totalIncome,
                        savingsRate: summary.savingsRate,
                    },
                });

                logger.info(`Relatório mensal enviado para ${user.email}`, 'CronService');
            } catch (error) {
                logger.error(`Erro ao gerar relatório mensal para usuário ${pref.userId}`, error, 'CronService');
            }
        }
    }

    /**
     * Calcula próxima data baseada na frequência
     */
    private calculateNextDate(current: Date, frequency: string, interval: number): Date {
        const next = new Date(current);

        switch (frequency) {
            case 'DAILY':
                next.setDate(next.getDate() + interval);
                break;
            case 'WEEKLY':
                next.setDate(next.getDate() + (7 * interval));
                break;
            case 'BIWEEKLY':
                next.setDate(next.getDate() + (14 * interval));
                break;
            case 'MONTHLY':
                next.setMonth(next.getMonth() + interval);
                break;
            case 'BIMONTHLY':
                next.setMonth(next.getMonth() + (2 * interval));
                break;
            case 'QUARTERLY':
                next.setMonth(next.getMonth() + (3 * interval));
                break;
            case 'SEMIANNUALLY':
                next.setMonth(next.getMonth() + (6 * interval));
                break;
            case 'YEARLY':
                next.setFullYear(next.getFullYear() + interval);
                break;
        }

        return next;
    }
}

// Exportar instância singleton
export const cronService = new CronService();
