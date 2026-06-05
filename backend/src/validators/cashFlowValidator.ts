/**
 * Validadores para rotas de fluxo de caixa e simulação
 */

import { z } from 'zod';

/**
 * Schema para uma transação simulada (mock)
 */
const mockTransactionSchema = z.object({
    date: z.coerce.date({
        required_error: 'Data é obrigatória',
        invalid_type_error: 'Data inválida',
    }),
    amount: z.number({
        required_error: 'Valor é obrigatório',
        invalid_type_error: 'Valor deve ser um número',
    }).positive('Valor deve ser positivo'),
    entryType: z.enum(['Receita', 'Despesa'], {
        required_error: 'Tipo de entrada é obrigatório',
        invalid_type_error: 'Tipo de entrada deve ser Receita ou Despesa',
    }),
    description: z.string({
        required_error: 'Descrição é obrigatória',
    }).min(1, 'Descrição não pode estar vazia').max(500, 'Descrição muito longa'),
});

export type MockTransactionInput = z.infer<typeof mockTransactionSchema>;

/**
 * Schema para o body do POST /api/analysis/simulate/:dashboardId
 */
export const simulateCashFlowSchema = z.object({
    mockTransactions: z.array(mockTransactionSchema, {
        required_error: 'Array de transações simuladas é obrigatório',
    })
        .min(1, 'Pelo menos uma transação simulada deve ser fornecida')
        .max(100, 'Máximo de 100 transações simuladas por vez'),
    startDate: z.coerce.date().optional(),
    daysToProject: z.number()
        .int('Dias deve ser um inteiro')
        .min(1, 'Mínimo de 1 dia')
        .max(365, 'Máximo de 365 dias')
        .default(30),
    yellowThreshold: z.number()
        .nonnegative('Margem deve ser zero ou positiva')
        .default(500),
});

export type SimulateCashFlowInput = z.infer<typeof simulateCashFlowSchema>;

/**
 * Schema para query params do GET /api/analysis/projection/:dashboardId
 */
export const projectionQuerySchema = z.object({
    startDate: z.coerce.date().optional(),
    daysToProject: z.coerce.number()
        .int('Dias deve ser um inteiro')
        .min(1, 'Mínimo de 1 dia')
        .max(365, 'Máximo de 365 dias')
        .default(30),
    yellowThreshold: z.coerce.number()
        .nonnegative('Margem deve ser zero ou positiva')
        .default(500),
});

export type ProjectionQueryInput = z.infer<typeof projectionQuerySchema>;
