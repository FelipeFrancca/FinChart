import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { transactionService } from '../../services/api';
import type { Transaction, TransactionFilters } from '../../types';
import { allocationKeys } from './useBudgetAllocation';
import { analysisKeys } from './useAnalysis';

// Query keys factory for better cache management
export const transactionKeys = {
    all: ['transactions'] as const,
    lists: () => [...transactionKeys.all, 'list'] as const,
    list: (filters: TransactionFilters, dashboardId?: string) => [...transactionKeys.lists(), { filters, dashboardId }] as const,
    stats: (filters: TransactionFilters, dashboardId?: string) => ['stats', { filters, dashboardId }] as const,
    allStats: () => ['stats'] as const,
};

export const useTransactions = (filters: TransactionFilters, dashboardId?: string) => {
    return useQuery({
        queryKey: transactionKeys.list(filters, dashboardId),
        queryFn: () => transactionService.getAll({ ...filters, dashboardId }),
        enabled: !!dashboardId,
        staleTime: 1000 * 30, // 30 seconds - more responsive
        gcTime: 1000 * 60 * 10, // 10 minutes cache
        refetchOnWindowFocus: true, // Refetch when tab becomes active
        refetchOnMount: 'always', // Always check for fresh data on mount
        placeholderData: keepPreviousData, // Keep old data visible while fetching new
    });
};

export const useTransactionStats = (filters: TransactionFilters, dashboardId?: string) => {
    return useQuery({
        queryKey: transactionKeys.stats(filters, dashboardId),
        queryFn: () => transactionService.getStats({ ...filters, dashboardId }),
        enabled: !!dashboardId,
        staleTime: 1000 * 30, // 30 seconds
        gcTime: 1000 * 60 * 10, // 10 minutes cache
        refetchOnWindowFocus: true,
        refetchOnMount: 'always',
        placeholderData: keepPreviousData, // Keep old data visible while fetching new
    });
};

export const useCreateTransaction = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: transactionService.create,
        onMutate: async (newTransaction) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: transactionKeys.all });
            return { newTransaction };
        },
        onSuccess: (createdTransaction) => {
            // Optimistic update - add to all matching queries
            queryClient.setQueriesData(
                { queryKey: transactionKeys.lists() },
                (oldData: Transaction[] | undefined) => {
                    if (!oldData) return [createdTransaction];
                    return [createdTransaction, ...oldData];
                }
            );
            // Invalidate stats to recalculate
            queryClient.invalidateQueries({ queryKey: transactionKeys.allStats() });
            // Invalidate allocation analysis to recalculate
            queryClient.invalidateQueries({ queryKey: allocationKeys.all });
        },
        onError: (_err, _newTransaction, _context) => {
            // Revert on error by refetching
            queryClient.invalidateQueries({ queryKey: transactionKeys.all });
        },
    });
};

export const useUpdateTransaction = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data, dashboardId }: { id: string; data: Partial<Transaction>; dashboardId?: string }) =>
            transactionService.update(id, { ...data, dashboardId }),
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: transactionKeys.all });

            // Optimistically update the transaction in all lists
            const previousData = queryClient.getQueriesData({ queryKey: transactionKeys.lists() });

            queryClient.setQueriesData(
                { queryKey: transactionKeys.lists() },
                (oldData: Transaction[] | undefined) => {
                    if (!oldData) return oldData;
                    return oldData.map((t) => (t.id === id ? { ...t, ...data } : t));
                }
            );

            return { previousData };
        },
        onSuccess: (updatedTransaction) => {
            // Ensure cache is properly updated with server response
            queryClient.setQueriesData(
                { queryKey: transactionKeys.lists() },
                (oldData: Transaction[] | undefined) => {
                    if (!oldData) return oldData;
                    return oldData.map((t) => (t.id === updatedTransaction.id ? updatedTransaction : t));
                }
            );
            queryClient.invalidateQueries({ queryKey: transactionKeys.allStats() });
            // Invalidate allocation analysis to recalculate
            queryClient.invalidateQueries({ queryKey: allocationKeys.all });
        },
        onError: (_err, _vars, context) => {
            // Revert to previous data on error
            if (context?.previousData) {
                context.previousData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
        },
    });
};

export const useDeleteTransaction = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, dashboardId }: { id: string; dashboardId: string }) =>
            transactionService.delete(id, dashboardId),
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: transactionKeys.all });

            // Optimistically remove the transaction
            const previousData = queryClient.getQueriesData({ queryKey: transactionKeys.lists() });

            queryClient.setQueriesData(
                { queryKey: transactionKeys.lists() },
                (oldData: Transaction[] | undefined) => {
                    if (!oldData) return oldData;
                    return oldData.filter((t) => t.id !== id);
                }
            );

            return { previousData };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: transactionKeys.allStats() });
            // Invalidate allocation analysis to recalculate
            queryClient.invalidateQueries({ queryKey: allocationKeys.all });
        },
        onError: (_err, _vars, context) => {
            if (context?.previousData) {
                context.previousData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
        },
    });
};

export const useCreateManyTransactions = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: transactionService.createMany,
        onSuccess: () => {
            // Full invalidation for bulk operations
            queryClient.invalidateQueries({ queryKey: transactionKeys.all });
            queryClient.invalidateQueries({ queryKey: transactionKeys.allStats() });
            // Invalidate allocation analysis to recalculate
            queryClient.invalidateQueries({ queryKey: allocationKeys.all });
        },
    });
};

export const useUpdateInstallmentGroup = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            groupId,
            data,
            dashboardId,
            scope
        }: {
            groupId: string;
            data: Partial<Transaction>;
            dashboardId: string;
            scope: 'single' | 'remaining' | 'all'
        }) => transactionService.updateInstallmentGroup(groupId, data, dashboardId, scope),
        onSuccess: () => {
            // Invalidate all transaction queries to refresh data
            queryClient.invalidateQueries({ queryKey: transactionKeys.all });
            queryClient.invalidateQueries({ queryKey: transactionKeys.allStats() });
        },
    });
};

export const useDeleteManyTransactions = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            ids,
            dashboardId,
            includeInstallments = true
        }: {
            ids: string[];
            dashboardId: string;
            includeInstallments?: boolean
        }) => transactionService.deleteMany(ids, dashboardId, includeInstallments),
        onMutate: async ({ ids }) => {
            await queryClient.cancelQueries({ queryKey: transactionKeys.all });

            const previousData = queryClient.getQueriesData({ queryKey: transactionKeys.lists() });

            queryClient.setQueriesData(
                { queryKey: transactionKeys.lists() },
                (oldData: Transaction[] | undefined) => {
                    if (!oldData) return oldData;
                    return oldData.filter((t) => !ids.includes(t.id));
                }
            );

            return { previousData };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: transactionKeys.allStats() });
        },
        onError: (_err, _vars, context) => {
            if (context?.previousData) {
                context.previousData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
        },
    });
};

/**
 * Hook to manually refresh all transaction data
 * Useful after imports or when data seems stale
 */
export const useRefreshTransactions = () => {
    const queryClient = useQueryClient();

    return {
        refresh: () => {
            queryClient.invalidateQueries({ queryKey: transactionKeys.all });
            queryClient.invalidateQueries({ queryKey: transactionKeys.allStats() });
        },
        refetchActive: () => {
            queryClient.refetchQueries({ queryKey: transactionKeys.all, type: 'active' });
            queryClient.refetchQueries({ queryKey: transactionKeys.allStats(), type: 'active' });
        },
    };
};

/**
 * Hook (mutation) para alternar o estado isSuspended de uma transação.
 * PATCH /api/transactions/:id/suspend
 *
 * Invalida as queries de transações e de projeção de fluxo de caixa.
 */
export const useToggleSuspendTransaction = (dashboardId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id }: { id: string }) =>
            transactionService.toggleSuspend(id, dashboardId),
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: transactionKeys.all });

            // Optimistically toggle isSuspended on the transaction in all lists
            const previousData = queryClient.getQueriesData({ queryKey: transactionKeys.lists() });

            queryClient.setQueriesData(
                { queryKey: transactionKeys.lists() },
                (oldData: Transaction[] | undefined) => {
                    if (!oldData) return oldData;
                    return oldData.map((t) =>
                        t.id === id ? { ...t, isSuspended: !t.isSuspended } : t
                    );
                }
            );

            return { previousData };
        },
        onSuccess: (updatedTransaction) => {
            // Ensure cache is updated with server response
            queryClient.setQueriesData(
                { queryKey: transactionKeys.lists() },
                (oldData: Transaction[] | undefined) => {
                    if (!oldData) return oldData;
                    return oldData.map((t) =>
                        t.id === updatedTransaction.id ? updatedTransaction : t
                    );
                }
            );
            // Invalidate stats
            queryClient.invalidateQueries({ queryKey: transactionKeys.allStats() });
            // Invalidate daily pacing (suspending a variable expense changes the daily quota)
            queryClient.invalidateQueries({
                queryKey: analysisKeys.dailyPacing(dashboardId),
            });
            // Invalidate cash flow projections (suspended state affects them)
            queryClient.invalidateQueries({
                queryKey: analysisKeys.allProjections(dashboardId),
            });
            // Invalidate allocation analysis
            queryClient.invalidateQueries({ queryKey: allocationKeys.all });
        },
        onError: (_err, _vars, context) => {
            // Revert on error
            if (context?.previousData) {
                context.previousData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
        },
    });
};
