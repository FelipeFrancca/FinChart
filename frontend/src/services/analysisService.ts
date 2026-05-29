import api from './api';

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

export const analysisService = {
    getSummary: async (dashboardId: string, startDate?: Date, endDate?: Date) => {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate.toISOString());
        if (endDate) params.append('endDate', endDate.toISOString());

        const response = await api.get<{ success: boolean; data: FinancialSummary }>(
            `/analysis/summary/${dashboardId}?${params.toString()}`
        );
        return response.data.data;
    },

    getInsights: async (dashboardId: string, startDate?: Date, endDate?: Date) => {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate.toISOString());
        if (endDate) params.append('endDate', endDate.toISOString());

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
        if (startDate) params.append('startDate', startDate.toISOString());
        if (endDate) params.append('endDate', endDate.toISOString());

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
};
