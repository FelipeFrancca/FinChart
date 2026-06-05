
import { Router } from 'express';
import * as recorrenciaController from '../controllers/recorrenciaController';
import { authenticateToken } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

// Schema simplificado (ideal mover para DTO)
const createRecurringSchema = z.object({
    dashboardId: z.string(),
    entryType: z.enum(['Receita', 'Despesa']),
    flowType: z.enum(['Fixa', 'Variável']),
    category: z.string(),
    subcategory: z.string().optional(),
    description: z.string(),
    amount: z.number().positive(),
    accountId: z.string().optional(),
    frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY']),
    interval: z.number().int().positive().default(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional().nullable(),
}).passthrough();

router.post('/', authenticateToken as any, validateBody(createRecurringSchema), asyncHandler(recorrenciaController.criarRecorrente as any));
router.get('/', authenticateToken as any, asyncHandler(recorrenciaController.listarRecorrentes as any));
router.post('/process', authenticateToken as any, asyncHandler(recorrenciaController.processarRecorrencias as any));

export default router;
