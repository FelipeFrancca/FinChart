/**
 * Cash Flow Projection Service
 * Motor de projeção de fluxo de caixa diário com classificação Traffic Light
 * (Verde, Amarelo, Vermelho) e suporte a simulação com transações injetadas.
 */

import { prisma } from '../database/conexao';
import { logger } from '../utils/logger';
import type { RecurrenceFrequency } from '@prisma/client';

// ============================================
// TIPOS
// ============================================

export type TrafficLightStatus = 'GREEN' | 'YELLOW' | 'RED';

/** Margem padrão para classificação GREEN (em R$). Usada quando yellowThreshold não é informado. */
const DEFAULT_YELLOW_THRESHOLD = 500;

export interface InjectedTransaction {
    date: Date | string;
    amount: number;
    entryType: 'Receita' | 'Despesa';
    description: string;
}

interface NormalizedTransaction {
    date: string; // YYYY-MM-DD
    amount: number;
    entryType: 'Receita' | 'Despesa';
    description: string;
    source: 'real' | 'recurring' | 'simulated';
}

export interface DailyProjection {
    date: string; // YYYY-MM-DD
    income: number;
    expenses: number;
    netFlow: number;
    runningBalance: number;
    status: TrafficLightStatus;
    transactions: {
        description: string;
        amount: number;
        entryType: string;
        source: string;
    }[];
}

export interface CashFlowProjectionResult {
    startingBalance: number;
    yellowThreshold: number;
    startDate: string;
    endDate: string;
    daysProjected: number;
    projections: DailyProjection[];
    summary: {
        totalIncome: number;
        totalExpenses: number;
        netChange: number;
        finalBalance: number;
        lowestBalance: number;
        lowestBalanceDate: string;
        highestBalance: number;
        highestBalanceDate: string;
        daysInGreen: number;
        daysInYellow: number;
        daysInRed: number;
        averageDailyBalance: number;
    };
}

// ============================================
// SERVICE
// ============================================

class CashFlowService {

    /**
     * Gera projeção de fluxo de caixa dia a dia.
     *
     * @param yellowThreshold Margem para classificação Traffic Light.
     *   Saldo > threshold → GREEN, 0 < saldo ≤ threshold → YELLOW, saldo ≤ 0 → RED.
     *   Recebido como parâmetro para que o frontend possa ajustar via slider.
     */
    async generateProjection(
        userId: string,
        dashboardId: string,
        startDate: Date,
        daysToProject: number = 30,
        injectedTransactions?: InjectedTransaction[],
        yellowThreshold: number = DEFAULT_YELLOW_THRESHOLD
    ): Promise<CashFlowProjectionResult> {
        // 1. Verificar permissão no dashboard
        const { checkPermission } = await import('./paineisServico');
        await checkPermission(userId, dashboardId);

        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + daysToProject - 1);
        endDate.setHours(23, 59, 59, 999);

        // 2. Buscar saldo consolidado (apenas liquidez imediata: CHECKING, SAVINGS, CASH, OTHER)
        const startingBalance = await this.getConsolidatedBalance(dashboardId);

        // 3. Buscar transações futuras reais (respeitando dueDate para despesas de cartão)
        const realTransactions = await this.getRealTransactions(dashboardId, startDate, endDate);

        // 4. Expandir recorrências ativas
        const recurringTransactions = await this.getExpandedRecurrences(dashboardId, startDate, endDate);

        // 5. Normalizar transações injetadas (se houver)
        const simulatedTransactions = injectedTransactions
            ? this.normalizeInjectedTransactions(injectedTransactions)
            : [];

        // 6. Merge de todas as transações
        const allTransactions = [
            ...realTransactions,
            ...recurringTransactions,
            ...simulatedTransactions,
        ];

        // 7. Agrupar por dia
        const transactionsByDay = this.groupByDay(allTransactions);

        // 8. Iterar dia a dia e calcular projeção
        const projections = this.calculateDailyProjections(
            startDate,
            daysToProject,
            startingBalance,
            transactionsByDay,
            yellowThreshold
        );

        // 9. Calcular summary
        const summary = this.calculateSummary(projections, startingBalance);

        logger.info(
            `Projeção de fluxo de caixa gerada: ${daysToProject} dias, saldo inicial R$ ${startingBalance.toFixed(2)}`,
            'CashFlowService',
            { dashboardId, daysInRed: summary.daysInRed, hasSimulation: !!injectedTransactions, yellowThreshold }
        );

        return {
            startingBalance,
            yellowThreshold,
            startDate: this.normalizeDate(startDate),
            endDate: this.normalizeDate(endDate),
            daysProjected: daysToProject,
            projections,
            summary,
        };
    }

    // ============================================
    // MÉTODOS PRIVADOS — BUSCA DE DADOS
    // ============================================

    /**
     * Saldo consolidado de todas as contas ativas do dashboard que
     * representam liquidez imediata.
     *
     * Excluídas:
     * - CREDIT_CARD — representa dívida, não caixa livre
     * - INVESTMENT  — sem liquidez imediata
     */
    private async getConsolidatedBalance(dashboardId: string): Promise<number> {
        const accounts = await prisma.account.findMany({
            where: {
                dashboardId,
                status: 'ACTIVE',
                deletedAt: null,
                type: { in: ['CHECKING', 'SAVINGS', 'CASH', 'OTHER'] },
            },
            select: { currentBalance: true },
        });

        return accounts.reduce((sum, acc) => sum + acc.currentBalance, 0);
    }

    /**
     * Busca transações reais futuras no intervalo.
     *
     * Para despesas de cartão de crédito que possuem `dueDate` (data de
     * vencimento da fatura), projeta a despesa no dia do vencimento em vez
     * do dia da compra — refletindo quando o impacto real no caixa acontece.
     */
    private async getRealTransactions(
        dashboardId: string,
        startDate: Date,
        endDate: Date
    ): Promise<NormalizedTransaction[]> {
        // Buscar transações que caiam no intervalo por `date` OU por `dueDate`
        const transactions = await prisma.transaction.findMany({
            where: {
                dashboardId,
                deletedAt: null,
                isSuspended: false,
                OR: [
                    // Transações normais cuja data está no intervalo
                    { date: { gte: startDate, lte: endDate } },
                    // Despesas de cartão cuja data de vencimento (fatura) está no intervalo
                    { dueDate: { gte: startDate, lte: endDate } },
                ],
            },
            select: {
                date: true,
                dueDate: true,
                amount: true,
                entryType: true,
                description: true,
                paymentMethod: true,
            },
        });

        return transactions.map(t => {
            // Se a transação tem dueDate e é despesa, usar dueDate como a data efetiva.
            // Isso reflete o impacto da fatura no caixa na data de vencimento.
            const effectiveDate = (t.dueDate && t.entryType === 'Despesa')
                ? t.dueDate
                : t.date;

            return {
                date: this.normalizeDate(effectiveDate),
                amount: t.amount,
                entryType: t.entryType as 'Receita' | 'Despesa',
                description: t.description,
                source: 'real' as const,
            };
        }).filter(t => {
            // Filtrar apenas transações cuja data efetiva cai dentro do intervalo
            return t.date >= this.normalizeDate(startDate) && t.date <= this.normalizeDate(endDate);
        });
    }

    /**
     * Busca recorrências ativas e expande as datas de ocorrência no intervalo
     */
    private async getExpandedRecurrences(
        dashboardId: string,
        startDate: Date,
        endDate: Date
    ): Promise<NormalizedTransaction[]> {
        const recurrences = await prisma.recurringTransaction.findMany({
            where: {
                dashboardId,
                isActive: true,
                isSuspended: false,
                deletedAt: null,
                startDate: { lte: endDate },
                OR: [
                    { endDate: null },
                    { endDate: { gte: startDate } },
                ],
            },
        });

        const expanded: NormalizedTransaction[] = [];

        for (const rec of recurrences) {
            const dates = this.expandRecurringDates(rec, startDate, endDate);
            for (const date of dates) {
                expanded.push({
                    date,
                    amount: rec.amount,
                    entryType: rec.entryType as 'Receita' | 'Despesa',
                    description: `[Recorrente] ${rec.description}`,
                    source: 'recurring',
                });
            }
        }

        return expanded;
    }

    // ============================================
    // MÉTODOS PRIVADOS — EXPANSÃO DE RECORRÊNCIAS
    // ============================================

    /**
     * Expande as datas de ocorrência de uma recorrência dentro de um intervalo.
     * Respeita frequência, intervalo e datas de início/fim da recorrência.
     */
    private expandRecurringDates(
        rec: {
            frequency: RecurrenceFrequency;
            interval: number;
            startDate: Date;
            endDate: Date | null;
            nextDate: Date;
        },
        rangeStart: Date,
        rangeEnd: Date
    ): string[] {
        const dates: string[] = [];

        // Começar a partir de nextDate ou startDate, o que for mais cedo no range
        let cursor = new Date(rec.nextDate);
        if (cursor < rec.startDate) cursor = new Date(rec.startDate);

        // Limite de iterações para evitar loop infinito
        const maxIterations = 1000;
        let iterations = 0;

        while (cursor <= rangeEnd && iterations < maxIterations) {
            iterations++;

            // Respeitar endDate da recorrência
            if (rec.endDate && cursor > rec.endDate) break;

            // Se a data está dentro do range, incluir
            if (cursor >= rangeStart) {
                dates.push(this.normalizeDate(cursor));
            }

            // Avançar cursor conforme a frequência
            cursor = this.advanceDateByFrequency(cursor, rec.frequency, rec.interval);
        }

        return dates;
    }

    /**
     * Avança uma data conforme a frequência e o intervalo
     */
    private advanceDateByFrequency(
        date: Date,
        frequency: RecurrenceFrequency,
        interval: number
    ): Date {
        const next = new Date(date);

        switch (frequency) {
            case 'DAILY':
                next.setDate(next.getDate() + interval);
                break;
            case 'WEEKLY':
                next.setDate(next.getDate() + 7 * interval);
                break;
            case 'BIWEEKLY':
                next.setDate(next.getDate() + 14 * interval);
                break;
            case 'MONTHLY':
                next.setMonth(next.getMonth() + interval);
                break;
            case 'BIMONTHLY':
                next.setMonth(next.getMonth() + 2 * interval);
                break;
            case 'QUARTERLY':
                next.setMonth(next.getMonth() + 3 * interval);
                break;
            case 'SEMIANNUALLY':
                next.setMonth(next.getMonth() + 6 * interval);
                break;
            case 'YEARLY':
                next.setFullYear(next.getFullYear() + interval);
                break;
            default:
                // Fallback: avança 1 mês
                next.setMonth(next.getMonth() + interval);
                break;
        }

        return next;
    }

    // ============================================
    // MÉTODOS PRIVADOS — NORMALIZAÇÃO E AGRUPAMENTO
    // ============================================

    /**
     * Normaliza transações injetadas para o shape interno
     */
    private normalizeInjectedTransactions(
        injected: InjectedTransaction[]
    ): NormalizedTransaction[] {
        return injected.map(t => ({
            date: this.normalizeDate(new Date(t.date)),
            amount: t.amount,
            entryType: t.entryType,
            description: `[Simulado] ${t.description}`,
            source: 'simulated' as const,
        }));
    }

    /**
     * Agrupa transações por dia (chave YYYY-MM-DD)
     */
    private groupByDay(
        transactions: NormalizedTransaction[]
    ): Map<string, NormalizedTransaction[]> {
        const map = new Map<string, NormalizedTransaction[]>();

        for (const t of transactions) {
            const existing = map.get(t.date) || [];
            existing.push(t);
            map.set(t.date, existing);
        }

        return map;
    }

    // ============================================
    // MÉTODOS PRIVADOS — CÁLCULO DE PROJEÇÃO
    // ============================================

    /**
     * Itera dia a dia calculando saldo corrente e classificação Traffic Light
     */
    private calculateDailyProjections(
        startDate: Date,
        daysToProject: number,
        startingBalance: number,
        transactionsByDay: Map<string, NormalizedTransaction[]>,
        yellowThreshold: number
    ): DailyProjection[] {
        const projections: DailyProjection[] = [];
        let runningBalance = startingBalance;

        for (let i = 0; i < daysToProject; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(currentDate.getDate() + i);
            const dateKey = this.normalizeDate(currentDate);

            const dayTransactions = transactionsByDay.get(dateKey) || [];

            const income = dayTransactions
                .filter(t => t.entryType === 'Receita')
                .reduce((sum, t) => sum + t.amount, 0);

            const expenses = dayTransactions
                .filter(t => t.entryType === 'Despesa')
                .reduce((sum, t) => sum + t.amount, 0);

            const netFlow = income - expenses;
            runningBalance += netFlow;

            projections.push({
                date: dateKey,
                income,
                expenses,
                netFlow,
                runningBalance,
                status: this.classifyBalance(runningBalance, yellowThreshold),
                transactions: dayTransactions.map(t => ({
                    description: t.description,
                    amount: t.amount,
                    entryType: t.entryType,
                    source: t.source,
                })),
            });
        }

        return projections;
    }

    /**
     * Calcula métricas de resumo da projeção
     */
    private calculateSummary(
        projections: DailyProjection[],
        startingBalance: number
    ): CashFlowProjectionResult['summary'] {
        if (projections.length === 0) {
            return {
                totalIncome: 0,
                totalExpenses: 0,
                netChange: 0,
                finalBalance: startingBalance,
                lowestBalance: startingBalance,
                lowestBalanceDate: '',
                highestBalance: startingBalance,
                highestBalanceDate: '',
                daysInGreen: 0,
                daysInYellow: 0,
                daysInRed: 0,
                averageDailyBalance: startingBalance,
            };
        }

        let totalIncome = 0;
        let totalExpenses = 0;
        let lowestBalance = Infinity;
        let lowestBalanceDate = '';
        let highestBalance = -Infinity;
        let highestBalanceDate = '';
        let daysInGreen = 0;
        let daysInYellow = 0;
        let daysInRed = 0;
        let balanceSum = 0;

        for (const day of projections) {
            totalIncome += day.income;
            totalExpenses += day.expenses;
            balanceSum += day.runningBalance;

            if (day.runningBalance < lowestBalance) {
                lowestBalance = day.runningBalance;
                lowestBalanceDate = day.date;
            }
            if (day.runningBalance > highestBalance) {
                highestBalance = day.runningBalance;
                highestBalanceDate = day.date;
            }

            switch (day.status) {
                case 'GREEN': daysInGreen++; break;
                case 'YELLOW': daysInYellow++; break;
                case 'RED': daysInRed++; break;
            }
        }

        const finalBalance = projections[projections.length - 1].runningBalance;

        return {
            totalIncome,
            totalExpenses,
            netChange: totalIncome - totalExpenses,
            finalBalance,
            lowestBalance,
            lowestBalanceDate,
            highestBalance,
            highestBalanceDate,
            daysInGreen,
            daysInYellow,
            daysInRed,
            averageDailyBalance: balanceSum / projections.length,
        };
    }

    // ============================================
    // MÉTODOS PRIVADOS — UTILITÁRIOS
    // ============================================

    /**
     * Classifica o saldo usando a metodologia Traffic Light.
     *
     * - RED:    saldo ≤ 0
     * - YELLOW: 0 < saldo ≤ yellowThreshold
     * - GREEN:  saldo > yellowThreshold
     */
    private classifyBalance(balance: number, yellowThreshold: number): TrafficLightStatus {
        if (balance <= 0) return 'RED';
        if (balance <= yellowThreshold) return 'YELLOW';
        return 'GREEN';
    }

    /**
     * Normaliza uma data para o formato YYYY-MM-DD
     */
    private normalizeDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

// Exportar instância singleton
export const cashFlowService = new CashFlowService();
