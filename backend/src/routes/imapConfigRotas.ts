import { Router } from 'express';
import * as imapConfigController from '../controllers/imapConfigController';
import { authenticateToken } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

const createConfigSchema = z.object({
    host: z.string().min(1, 'host é obrigatório').default('imap.gmail.com'),
    port: z.coerce.number().int().positive().default(993),
    emailUser: z.string().email('emailUser deve ser um email válido'),
    emailPass: z.string().min(1, 'emailPass é obrigatória'),
});

const updateConfigSchema = z.object({
    host: z.string().min(1).optional(),
    port: z.coerce.number().int().positive().optional(),
    emailUser: z.string().email().optional(),
    emailPass: z.string().optional(),
    isActive: z.boolean().optional()
});

const idParamSchema = z.object({
    id: z.string().min(1, 'ID não pode estar vazio'),
});

const testConnectionSchema = z.object({
    host: z.string().optional(),
    port: z.coerce.number().int().positive().optional(),
    emailUser: z.string().optional(),
    emailPass: z.string().optional(),
    configId: z.string().optional(),
});

router.get('/', authenticateToken as any, asyncHandler(imapConfigController.getUserConfigs as any));
router.post('/', authenticateToken as any, validateBody(createConfigSchema), asyncHandler(imapConfigController.createConfig as any));
router.post('/test', authenticateToken as any, validateBody(testConnectionSchema), asyncHandler(imapConfigController.testConnection as any));
router.put('/:id', authenticateToken as any, validateParams(idParamSchema), validateBody(updateConfigSchema), asyncHandler(imapConfigController.updateConfig as any));
router.delete('/:id', authenticateToken as any, validateParams(idParamSchema), asyncHandler(imapConfigController.deleteConfig as any));

export default router;
