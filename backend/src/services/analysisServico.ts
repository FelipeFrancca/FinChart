/**
 * Financial Analysis Service
 * Análise financeira com algoritmos locais (sem IA) e integração opcional com Groq
 */

import { prisma } from '../database/conexao';
import { logger } from '../utils/logger';
import { aiRouter } from './aiRouterServico';
import { budgetAllocationService } from './budgetAllocationServico';

// Tipos para análise
interface CategorySpending {
    category: string;
    amount: number;
    percentage: number;
    transactionCount: number;
}

interface SpendingTrend {
    category: string;
    currentAmount: number;
    previousAmount: number;
    changePercent: number;
    trend: 'up' | 'down' | 'stable';
}

interface UnusualSpending {
    transactionId: string;
    description: string;
    amount: number;
    category: string;
    date: Date;
    reason: string;
    zScore: number;
}

interface AllocationAlert {
    type: 'warning' | 'critical';
    message: string;
    allocation?: string;
}

export interface FinancialSummary {
    period: { start: Date; end: Date };
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    savingsRate: number;
    categoryBreakdown: CategorySpending[];
    trends: SpendingTrend[];
    unusualTransactions: UnusualSpending[];
    alerts: string[];
    allocationAlerts?: AllocationAlert[];
}

/**
 * Financial Analysis Service - Análises sem IA (algoritmos locais)
 */
export class FinancialAnalysisService {

    /**
     * Obtém resumo financeiro completo para um período
     */
    async getFinancialSummary(
        dashboardId: string,
        userId: string,
        startDate: Date,
        endDate: Date
    ): Promise<FinancialSummary> {
        // Buscar transações do período
        const transactions = await prisma.transaction.findMany({
            where: {
                dashboardId,
                date: { gte: startDate, lte: endDate },
                deletedAt: null,
            },
            orderBy: { date: 'desc' },
        });

        // Calcular totais
        const income = transactions
            .filter(t => t.entryType === 'Receita')
            .reduce((sum, t) => sum + t.amount, 0);

        const expenses = transactions
            .filter(t => t.entryType === 'Despesa')
            .reduce((sum, t) => sum + t.amount, 0);

        const balance = income - expenses;
        const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;

        // Agregação por categoria
        const categoryBreakdown = this.calculateCategoryBreakdown(
            transactions.filter(t => t.entryType === 'Despesa')
        );

        // Calcular tendências (comparar com período anterior)
        const previousPeriodLength = endDate.getTime() - startDate.getTime();
        const previousStart = new Date(startDate.getTime() - previousPeriodLength);
        const previousEnd = new Date(startDate.getTime() - 1);

        const trends = await this.calculateTrends(
            dashboardId,
            categoryBreakdown,
            previousStart,
            previousEnd
        );

        // Detectar gastos incomuns
        const unusualTransactions = this.detectUnusualSpending(
            transactions.filter(t => t.entryType === 'Despesa')
        );

        // Gerar alertas automáticos
        const alerts = this.generateAlerts({
            savingsRate,
            categoryBreakdown,
            trends,
            unusualTransactions,
        });

        // Obter alertas de alocação de orçamento
        let allocationAlerts: AllocationAlert[] = [];
        if (userId) {
            try {
                allocationAlerts = await budgetAllocationService.getAllocationAlerts(userId, dashboardId);
            } catch (error) {
                logger.warn('Não foi possível obter alertas de alocação', 'FinancialAnalysis');
            }
        }

        return {
            period: { start: startDate, end: endDate },
            totalIncome: income,
            totalExpenses: expenses,
            balance,
            savingsRate,
            categoryBreakdown,
            trends,
            unusualTransactions,
            alerts,
            allocationAlerts,
        };
    }

    /**
     * Calcula breakdown por categoria
     */
    private calculateCategoryBreakdown(expenses: any[]): CategorySpending[] {
        const categoryMap = new Map<string, { amount: number; count: number }>();

        expenses.forEach(t => {
            const current = categoryMap.get(t.category) || { amount: 0, count: 0 };
            categoryMap.set(t.category, {
                amount: current.amount + t.amount,
                count: current.count + 1,
            });
        });

        const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);

        const result: CategorySpending[] = [];
        categoryMap.forEach((value, category) => {
            result.push({
                category,
                amount: value.amount,
                percentage: totalExpenses > 0 ? (value.amount / totalExpenses) * 100 : 0,
                transactionCount: value.count,
            });
        });

        // Ordenar por valor (maior primeiro)
        return result.sort((a, b) => b.amount - a.amount);
    }

    /**
     * Calcula tendências comparando com período anterior
     */
    private async calculateTrends(
        dashboardId: string,
        currentCategories: CategorySpending[],
        previousStart: Date,
        previousEnd: Date
    ): Promise<SpendingTrend[]> {
        // Buscar gastos do período anterior
        const previousTransactions = await prisma.transaction.findMany({
            where: {
                dashboardId,
                entryType: 'Despesa',
                date: { gte: previousStart, lte: previousEnd },
                deletedAt: null,
            },
        });

        const previousCategoryMap = new Map<string, number>();
        previousTransactions.forEach(t => {
            const current = previousCategoryMap.get(t.category) || 0;
            previousCategoryMap.set(t.category, current + t.amount);
        });

        return currentCategories.map(cat => {
            const previousAmount = previousCategoryMap.get(cat.category) || 0;
            const changePercent = previousAmount > 0
                ? ((cat.amount - previousAmount) / previousAmount) * 100
                : cat.amount > 0 ? 100 : 0;

            let trend: 'up' | 'down' | 'stable' = 'stable';
            if (changePercent > 5) trend = 'up';
            else if (changePercent < -5) trend = 'down';

            return {
                category: cat.category,
                currentAmount: cat.amount,
                previousAmount,
                changePercent,
                trend,
            };
        });
    }

    /**
     * Detecta gastos incomuns usando análise estatística (Z-Score)
     */
    private detectUnusualSpending(expenses: any[]): UnusualSpending[] {
        if (expenses.length < 5) return []; // Precisa de dados suficientes

        // Calcular média e desvio padrão
        const amounts = expenses.map(t => t.amount);
        const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const stdDev = Math.sqrt(
            amounts.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / amounts.length
        );

        if (stdDev === 0) return [];

        const unusual: UnusualSpending[] = [];
        const threshold = 2; // Z-score threshold

        expenses.forEach(t => {
            const zScore = (t.amount - mean) / stdDev;

            if (Math.abs(zScore) >= threshold) {
                unusual.push({
                    transactionId: t.id,
                    description: t.description,
                    amount: t.amount,
                    category: t.category,
                    date: t.date,
                    reason: zScore > 0
                        ? `Valor ${(zScore * 100 / threshold).toFixed(0)}% acima do normal`
                        : `Valor atípico para esta categoria`,
                    zScore,
                });
            }
        });

        // Ordenar por zScore (mais incomum primeiro)
        return unusual.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore)).slice(0, 5);
    }

    /**
     * Gera alertas baseados em regras
     */
    private generateAlerts(data: {
        savingsRate: number;
        categoryBreakdown: CategorySpending[];
        trends: SpendingTrend[];
        unusualTransactions: UnusualSpending[];
    }): string[] {
        const alerts: string[] = [];

        // Alerta de taxa de poupança baixa ou negativa
        if (data.savingsRate < 0) {
            alerts.push('⚠️ Você gastou mais do que ganhou neste período!');
        } else if (data.savingsRate < 10) {
            alerts.push('💡 Sua taxa de poupança está abaixo de 10%. Tente reduzir gastos não essenciais.');
        }

        // Alertas de categorias com grande aumento
        data.trends
            .filter(t => t.trend === 'up' && t.changePercent > 30)
            .slice(0, 2)
            .forEach(t => {
                alerts.push(`📈 Gastos com "${t.category}" aumentaram ${t.changePercent.toFixed(0)}% vs período anterior`);
            });

        // Alerta de categoria dominante (>40% do total)
        const dominantCategory = data.categoryBreakdown.find(c => c.percentage > 40);
        if (dominantCategory) {
            alerts.push(`🎯 "${dominantCategory.category}" representa ${dominantCategory.percentage.toFixed(0)}% dos seus gastos`);
        }

        // Alertas de transações incomuns
        if (data.unusualTransactions.length > 0) {
            alerts.push(`🔍 Detectados ${data.unusualTransactions.length} gasto(s) fora do padrão`);
        }

        return alerts;
    }

    /**
     * Obtém insights gerados por IA
     */
    async getAIInsights(
        dashboardId: string,
        userId: string,
        startDate: Date,
        endDate: Date
    ): Promise<string> {
        // Primeiro, obter dados financeiros
        const summary = await this.getFinancialSummary(dashboardId, userId, startDate, endDate);

        // Formatar período
        const periodStr = `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`;

        // Gerar análise via Groq
        return aiRouter.generateFinancialAnalysis({
            period: periodStr,
            totalIncome: summary.totalIncome,
            totalExpenses: summary.totalExpenses,
            categories: summary.categoryBreakdown.slice(0, 10).map(c => ({
                name: c.category,
                amount: c.amount,
                percentage: c.percentage,
            })),
            trends: summary.trends.slice(0, 5).map(t => ({
                category: t.category,
                change: t.changePercent,
            })),
        });
    }

    /**
     * Obtém top N categorias de gastos
     */
    async getTopExpenseCategories(
        dashboardId: string,
        startDate: Date,
        endDate: Date,
        limit: number = 5
    ): Promise<CategorySpending[]> {
        const expenses = await prisma.transaction.findMany({
            where: {
                dashboardId,
                entryType: 'Despesa',
                date: { gte: startDate, lte: endDate },
                deletedAt: null,
            },
        });

        return this.calculateCategoryBreakdown(expenses).slice(0, limit);
    }

    /**
     * Calcula relação receita/despesa por mês
     */
    async getMonthlyBalance(
        dashboardId: string,
        months: number = 6
    ): Promise<{ month: string; income: number; expenses: number; balance: number }[]> {
        const results: { month: string; income: number; expenses: number; balance: number }[] = [];
        const now = new Date();

        for (let i = 0; i < months; i++) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

            const transactions = await prisma.transaction.findMany({
                where: {
                    dashboardId,
                    date: { gte: monthStart, lte: monthEnd },
                    deletedAt: null,
                },
            });

            const income = transactions
                .filter(t => t.entryType === 'Receita')
                .reduce((sum, t) => sum + t.amount, 0);

            const expenses = transactions
                .filter(t => t.entryType === 'Despesa')
                .reduce((sum, t) => sum + t.amount, 0);

            results.push({
                month: monthStart.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
                income,
                expenses,
                balance: income - expenses,
            });
        }

        return results.reverse(); // Mais antigo primeiro
    }

    /**
     * Coleta contexto financeiro completo do dashboard para alimentar a IA
     */
    async getFullDashboardContext(
        dashboardId: string,
        userId: string,
        startDate: Date,
        endDate: Date
    ) {
        // Transações do período
        const transactions = await prisma.transaction.findMany({
            where: {
                dashboardId,
                date: { gte: startDate, lte: endDate },
                deletedAt: null,
            },
            orderBy: { date: 'desc' },
        });

        const income = transactions
            .filter(t => t.entryType === 'Receita')
            .reduce((sum, t) => sum + t.amount, 0);
        const expenses = transactions
            .filter(t => t.entryType === 'Despesa')
            .reduce((sum, t) => sum + t.amount, 0);

        // Separar despesas próprias vs de terceiros
        const ownExpenses = transactions
            .filter(t => t.entryType === 'Despesa' && !t.isThirdParty)
            .reduce((sum, t) => sum + t.amount, 0);
        const thirdPartyExpenses = transactions
            .filter(t => t.entryType === 'Despesa' && t.isThirdParty)
            .reduce((sum, t) => sum + t.amount, 0);
        const thirdPartyTransactions = transactions
            .filter(t => t.isThirdParty)
            .map(t => ({ description: t.description, amount: t.amount, thirdPartyName: t.thirdPartyName }));

        // Buscar transações do PRÓXIMO mês (receitas e despesas já cadastradas)
        // Importante para CLT: trabalha mês X, recebe mês X+1
        // Usa o mês seguinte ao endDate para garantir captura correta
        const nextMonthStart = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);
        const nextMonthEnd = new Date(endDate.getFullYear(), endDate.getMonth() + 2, 0, 23, 59, 59);
        const nextMonthTransactions = await prisma.transaction.findMany({
            where: {
                dashboardId,
                deletedAt: null,
                OR: [
                    // Receitas e despesas com date no próximo mês
                    { date: { gte: nextMonthStart, lte: nextMonthEnd } },
                    // Despesas com vencimento no próximo mês
                    { dueDate: { gte: nextMonthStart, lte: nextMonthEnd } },
                ],
            },
            orderBy: { date: 'asc' },
        });

        const nextMonthIncome = nextMonthTransactions
            .filter(t => t.entryType === 'Receita')
            .reduce((sum, t) => sum + t.amount, 0);
        const nextMonthOwnExpenses = nextMonthTransactions
            .filter(t => t.entryType === 'Despesa' && !t.isThirdParty)
            .reduce((sum, t) => sum + t.amount, 0);

        // Contas
        const accounts = await prisma.account.findMany({
            where: { dashboardId, deletedAt: null, status: 'ACTIVE' },
        });

        // Metas financeiras
        const goals = await prisma.financialGoal.findMany({
            where: { userId, deletedAt: null, status: 'ACTIVE' },
        });

        // Orçamentos ativos
        const budgets = await prisma.budget.findMany({
            where: { userId, isActive: true, deletedAt: null },
        });

        // Recorrências ativas
        const recurrences = await prisma.recurringTransaction.findMany({
            where: { dashboardId, isActive: true, deletedAt: null },
        });

        // Alocações de orçamento
        let allocations: any[] = [];
        try {
            const profile = await prisma.budgetAllocationProfile.findFirst({
                where: { userId, isDefault: true },
                include: { allocations: { orderBy: { order: 'asc' } } },
            });
            if (profile) allocations = profile.allocations;
        } catch { /* Ignora se não tiver perfil */ }

        // Detectar recorrências faltantes
        const missingRecurrences = await this.detectMissingRecurrences(dashboardId);

        // Calcular gastos por categoria (apenas despesas próprias)
        const categoryBreakdown = this.calculateCategoryBreakdown(
            transactions.filter(t => t.entryType === 'Despesa')
        );

        // Calcular uso dos orçamentos
        const budgetUsage = budgets.map(b => {
            const spent = transactions
                .filter(t => t.entryType === 'Despesa' && (!b.category || t.category === b.category))
                .reduce((sum, t) => sum + t.amount, 0);
            return {
                name: b.name,
                limit: b.amount,
                spent,
                percentage: b.amount > 0 ? (spent / b.amount) * 100 : 0,
                category: b.category,
                status: spent > b.amount ? 'estourado' : spent > b.amount * 0.8 ? 'atenção' : 'ok',
            };
        });

        return {
            period: { start: startDate, end: endDate },
            totalIncome: income,
            totalExpenses: expenses,
            ownExpenses,
            thirdPartyExpenses,
            thirdPartyTransactions,
            balance: income - expenses,
            savingsRate: income > 0 ? ((income - expenses) / income) * 100 : 0,
            transactionCount: transactions.length,
            categoryBreakdown,
            accounts: accounts.map(a => ({
                name: a.name,
                type: a.type,
                currentBalance: a.currentBalance,
                institution: a.institution,
            })),
            goals: goals.map(g => ({
                name: g.name,
                targetAmount: g.targetAmount,
                currentAmount: g.currentAmount,
                progress: g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0,
                deadline: g.deadline,
                status: g.status,
            })),
            budgets: budgetUsage,
            recurrences: recurrences.map(r => ({
                description: r.description,
                amount: r.amount,
                category: r.category,
                entryType: r.entryType,
                frequency: r.frequency,
                nextDate: r.nextDate,
                lastDate: r.lastDate,
            })),
            missingRecurrences,
            allocations: allocations.map(a => ({
                name: a.name,
                percentage: a.percentage,
                linkedCategories: a.linkedCategories,
            })),
            nextMonth: {
                income: nextMonthIncome,
                expenses: nextMonthOwnExpenses,
                transactions: nextMonthTransactions.slice(0, 15).map(t => ({
                    description: t.description,
                    amount: t.amount,
                    entryType: t.entryType,
                    date: t.date,
                    dueDate: (t as any).dueDate,
                    isThirdParty: t.isThirdParty,
                    thirdPartyName: t.thirdPartyName,
                })),
            },
        };
    }

    /**
     * Detecta recorrências que deveriam ter sido lançadas neste mês mas não foram
     */
    async detectMissingRecurrences(dashboardId: string): Promise<MissingRecurrence[]> {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Buscar recorrências ativas
        const recurrences = await prisma.recurringTransaction.findMany({
            where: {
                dashboardId,
                isActive: true,
                deletedAt: null,
                startDate: { lte: monthEnd },
            },
        });

        // Buscar transações do mês
        const transactions = await prisma.transaction.findMany({
            where: {
                dashboardId,
                date: { gte: monthStart, lte: monthEnd },
                deletedAt: null,
            },
        });

        const missing: MissingRecurrence[] = [];

        for (const rec of recurrences) {
            // Verifica se deveria ter sido executada neste mês
            const shouldExecuteThisMonth = this.shouldRecurrenceExecuteInMonth(rec, monthStart, monthEnd);
            if (!shouldExecuteThisMonth) continue;

            // Verifica se já existe uma transação correspondente
            const hasMatchingTransaction = transactions.some(t =>
                t.description.toLowerCase().includes(rec.description.toLowerCase()) &&
                t.entryType === rec.entryType &&
                Math.abs(t.amount - rec.amount) < rec.amount * 0.1 // Margem de 10%
            );

            if (!hasMatchingTransaction) {
                // Calcular data esperada
                const expectedDay = rec.nextDate.getDate();
                const isPastDue = now.getDate() > expectedDay;

                missing.push({
                    recurrenceId: rec.id,
                    description: rec.description,
                    amount: rec.amount,
                    category: rec.category,
                    entryType: rec.entryType,
                    flowType: rec.flowType,
                    expectedDay,
                    isPastDue,
                    daysOverdue: isPastDue ? now.getDate() - expectedDay : 0,
                    subcategory: rec.subcategory || undefined,
                    accountId: rec.accountId || undefined,
                });
            }
        }

        // Ordenar por urgência (past due primeiro, depois por dia)
        return missing.sort((a, b) => {
            if (a.isPastDue && !b.isPastDue) return -1;
            if (!a.isPastDue && b.isPastDue) return 1;
            return a.expectedDay - b.expectedDay;
        });
    }

    /**
     * Verifica se uma recorrência deveria ser executada em um dado mês
     */
    private shouldRecurrenceExecuteInMonth(
        rec: any,
        monthStart: Date,
        monthEnd: Date
    ): boolean {
        // Se a startDate é depois do fim do mês, não deveria
        if (rec.startDate > monthEnd) return false;
        // Se endDate definida e antes do início do mês, não deveria
        if (rec.endDate && rec.endDate < monthStart) return false;

        // Verificar com base na frequência
        switch (rec.frequency) {
            case 'DAILY':
                return true;
            case 'WEEKLY':
            case 'BIWEEKLY':
                return true; // Semanais sempre têm ocorrência no mês
            case 'MONTHLY':
                return true; // Mensais sempre executam todo mês
            case 'BIMONTHLY': {
                const startMonth = rec.startDate.getMonth();
                const currentMonth = monthStart.getMonth();
                const diff = (currentMonth - startMonth + 12) % 12;
                return diff % 2 === 0;
            }
            case 'QUARTERLY': {
                const startMonth = rec.startDate.getMonth();
                const currentMonth = monthStart.getMonth();
                const diff = (currentMonth - startMonth + 12) % 12;
                return diff % 3 === 0;
            }
            case 'SEMIANNUALLY': {
                const startMonth = rec.startDate.getMonth();
                const currentMonth = monthStart.getMonth();
                const diff = (currentMonth - startMonth + 12) % 12;
                return diff % 6 === 0;
            }
            case 'YEARLY': {
                return rec.startDate.getMonth() === monthStart.getMonth();
            }
            default:
                return true;
        }
    }

    /**
     * Gera auditoria financeira completa com IA
     */
    async generateFullAudit(
        dashboardId: string,
        userId: string,
        startDate: Date,
        endDate: Date
    ): Promise<{ auditText: string; context: any }> {
        const context = await this.getFullDashboardContext(dashboardId, userId, startDate, endDate);

        const auditText = await aiRouter.generateFinancialAudit(context);

        return { auditText, context };
    }

    /**
     * Chat interativo com IA usando contexto completo do dashboard
     */
    async chatWithAI(
        dashboardId: string,
        userId: string,
        message: string,
        history: { role: 'user' | 'assistant'; content: string }[]
    ): Promise<string> {
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        // Expandir até fim do próximo mês para capturar receitas futuras (CLT: trabalha mês X, recebe X+1)
        const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);

        const context = await this.getFullDashboardContext(dashboardId, userId, startDate, endDate);

        return aiRouter.generateFinancialChat(context, message, history);
    }
}

export interface MissingRecurrence {
    recurrenceId: string;
    description: string;
    amount: number;
    category: string;
    entryType: string;
    flowType: string;
    expectedDay: number;
    isPastDue: boolean;
    daysOverdue: number;
    subcategory?: string;
    accountId?: string;
}

// Exportar instância singleton
export const financialAnalysisService = new FinancialAnalysisService();
