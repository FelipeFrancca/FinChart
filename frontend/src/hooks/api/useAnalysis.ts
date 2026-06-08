import { useQuery, useMutation } from '@tanstack/react-query';
import { analysisService } from '../../services/analysisService';
import type { InjectedTransaction } from '../../services/analysisService';

// ============================================
// Query Keys Factory
// ============================================

export const analysisKeys = {
    all: ['analysis'] as const,
    dailyPacing: (dashboardId: string) =>
        [...analysisKeys.all, 'daily-pacing', dashboardId] as const,
    projection: (dashboardId: string, daysToProject?: number, yellowThreshold?: number) =>
        [...analysisKeys.all, 'projection', dashboardId, { daysToProject, yellowThreshold }] as const,
    allProjections: (dashboardId: string) =>
        [...analysisKeys.all, 'projection', dashboardId] as const,
};

// ============================================
// Hooks
// ============================================

/**
 * Hook para obter a cota diária de gastos livres (Daily Pacing).
 * GET /api/analysis/daily-pacing/:dashboardId
 */
export const useDailyPacing = (dashboardId: string) => {
    return useQuery({
        queryKey: analysisKeys.dailyPacing(dashboardId),
        queryFn: () => analysisService.getDailyPacing(dashboardId),
        enabled: !!dashboardId,
        staleTime: 1000 * 60 * 5, // 5 minutos
        gcTime: 1000 * 60 * 15,   // 15 minutos cache
        refetchOnWindowFocus: true,
    });
};

/**
 * Hook para obter a projeção de fluxo de caixa dia a dia (Traffic Light).
 * GET /api/analysis/projection/:dashboardId
 */
export const useCashFlowProjection = (
    dashboardId: string,
    daysToProject: number = 30,
    yellowThreshold: number = 500
) => {
    return useQuery({
        queryKey: analysisKeys.projection(dashboardId, daysToProject, yellowThreshold),
        queryFn: () => analysisService.getCashFlowProjection(dashboardId, daysToProject, yellowThreshold),
        enabled: !!dashboardId,
        staleTime: 1000 * 60 * 2, // 2 minutos
        gcTime: 1000 * 60 * 10,   // 10 minutos cache
        refetchOnWindowFocus: true,
    });
};

/**
 * Hook (mutation) para simular fluxo de caixa com transações injetadas.
 * POST /api/analysis/simulate/:dashboardId
 *
 * Uso:
 * ```ts
 * const simulate = useSimulateCashFlow(dashboardId);
 * simulate.mutate({
 *   mockTransactions: [{ date: '2025-07-15', amount: 3000, entryType: 'Receita', description: 'Freelance' }],
 *   daysToProject: 60,
 * });
 * ```
 */
export const useSimulateCashFlow = (dashboardId: string) => {
    return useMutation({
        mutationFn: ({
            mockTransactions,
            daysToProject = 30,
            yellowThreshold = 500,
            startDate,
        }: {
            mockTransactions: InjectedTransaction[];
            daysToProject?: number;
            yellowThreshold?: number;
            startDate?: Date;
        }) =>
            analysisService.simulateCashFlow(
                dashboardId,
                mockTransactions,
                daysToProject,
                yellowThreshold,
                startDate
            ),
    });
};
