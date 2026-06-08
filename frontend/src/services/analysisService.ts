import api from './api';
import { format } from 'date-fns';

/**
 * Formata uma Date em 'yyyy-MM-dd' (timezone local) para evitar
 * a armadilha de UTC do toISOString() em fusos negativos.
 */
const toLocalDate = (d: Date): string => format(d, 'yyyy-MM-dd');

export interface FinancialSummary {
    period: { start: string; end: string };
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    savingsRate: number;
    categoryBreakdown: {
        category: string;
        amount: number;
        percentage: number;
        transactionCount: number;
    }[];
    trends: {
        category: string;
        currentAmount: number;
        previousAmount: number;
        changePercent: number;
        trend: 'up' | 'down' | 'stable';
    }[];
    unusualTransactions: {
        transactionId: string;
        description: string;
        amount: number;
        category: string;
        date: string;
        reason: string;
        zScore: number;
    }[];
    alerts: string[];
}

export interface AIInsightsResponse {
    insights: string;
    generatedAt: string;
    period: { start: string; end: string };
}

export interface MonthlyBalance {
    month: string;
    income: number;
    expenses: number;
    balance: number;
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

export interface AuditResponse {
    auditText: string;
    context: {
        period: { start: string; end: string };
        totalIncome: number;
        totalExpenses: number;
        balance: number;
        savingsRate: number;
        transactionCount: number;
        categoryBreakdown: any[];
        accounts: any[];
        goals: any[];
        budgets: any[];
        recurrences: any[];
        missingRecurrences: MissingRecurrence[];
        allocations: any[];
    };
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

// ============================================
// Cash Flow Projection Types
// ============================================

export type TrafficLightStatus = 'GREEN' | 'YELLOW' | 'RED';

export interface DailyProjection {
    date: string;
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

export interface InjectedTransaction {
    date: string;
    amount: number;
    entryType: 'Receita' | 'Despesa';
    description: string;
}

export interface DailyPacingResult {
    budgetLimit: number;
    currentSpent: number;
    remainingDays: number;
    dailyPacing: number;
    isOverBudget: boolean;
}

export const analysisService = {
    getSummary: async (dashboardId: string, startDate?: Date, endDate?: Date) => {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', toLocalDate(startDate));
        if (endDate) params.append('endDate', toLocalDate(endDate));

        const response = await api.get<{ success: boolean; data: FinancialSummary }>(
            `/analysis/summary/${dashboardId}?${params.toString()}`
        );
        return response.data.data;
    },

    getInsights: async (dashboardId: string, startDate?: Date, endDate?: Date) => {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', toLocalDate(startDate));
        if (endDate) params.append('endDate', toLocalDate(endDate));

        const response = await api.get<{ success: boolean; data: AIInsightsResponse }>(
            `/analysis/insights/${dashboardId}?${params.toString()}`
        );
        return response.data.data;
    },

    getMonthlyBalance: async (dashboardId: string, months: number = 6) => {
        const response = await api.get<{ success: boolean; data: MonthlyBalance[] }>(
            `/analysis/monthly/${dashboardId}?months=${months}`
        );
        return response.data.data;
    },

    getAIStatus: async () => {
        const response = await api.get<{
            success: boolean;
            data: {
                providers: { gemini: boolean; groq: boolean };
                preferredForText: string;
                preferredForImages: string;
            };
        }>('/analysis/ai-status');
        return response.data.data;
    },

    getAudit: async (dashboardId: string, startDate?: Date, endDate?: Date) => {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', toLocalDate(startDate));
        if (endDate) params.append('endDate', toLocalDate(endDate));

        const response = await api.get<{ success: boolean; data: AuditResponse }>(
            `/analysis/audit/${dashboardId}?${params.toString()}`
        );
        return response.data.data;
    },

    getMissingRecurrences: async (dashboardId: string) => {
        const response = await api.get<{ success: boolean; data: MissingRecurrence[] }>(
            `/analysis/missing-recurrences/${dashboardId}`
        );
        return response.data.data;
    },

    chatWithAI: async (dashboardId: string, message: string, history: ChatMessage[] = []) => {
        const response = await api.post<{ success: boolean; data: { response: string; generatedAt: string } }>(
            `/analysis/chat/${dashboardId}`,
            { message, history }
        );
        return response.data.data;
    },

    // ============================================
    // Cash Flow Projection & Simulation
    // ============================================

    /**
     * GET /api/analysis/daily-pacing/:dashboardId
     * Obtém a cota diária de gastos livres (Daily Pacing)
     */
    getDailyPacing: async (dashboardId: string) => {
        const response = await api.get<{ success: boolean; data: DailyPacingResult }>(
            `/analysis/daily-pacing/${dashboardId}`
        );
        return response.data.data;
    },

    /**
     * GET /api/analysis/projection/:dashboardId
     * Projeção de fluxo de caixa dia a dia (Traffic Light)
     */
    getCashFlowProjection: async (
        dashboardId: string,
        daysToProject: number = 30,
        yellowThreshold: number = 500,
        startDate?: Date
    ) => {
        const params = new URLSearchParams();
        params.append('daysToProject', String(daysToProject));
        params.append('yellowThreshold', String(yellowThreshold));
        if (startDate) params.append('startDate', toLocalDate(startDate));

        const response = await api.get<{ success: boolean; data: CashFlowProjectionResult }>(
            `/analysis/projection/${dashboardId}?${params.toString()}`
        );
        return response.data.data;
    },

    /**
     * POST /api/analysis/simulate/:dashboardId
     * Simulação de fluxo de caixa com transações injetadas (sem alterar o banco)
     */
    simulateCashFlow: async (
        dashboardId: string,
        mockTransactions: InjectedTransaction[],
        daysToProject: number = 30,
        yellowThreshold: number = 500,
        startDate?: Date
    ) => {
        const response = await api.post<{ success: boolean; data: CashFlowProjectionResult }>(
            `/analysis/simulate/${dashboardId}`,
            {
                mockTransactions,
                daysToProject,
                yellowThreshold,
                ...(startDate ? { startDate: toLocalDate(startDate) } : {}),
            }
        );
        return response.data.data;
    },
};
