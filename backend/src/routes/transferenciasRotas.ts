import { Router } from 'express';
import * as transferenciasController from '../controllers/transferenciasController';
import { authenticateToken } from '../middleware/auth';
import { validateBody, validateParams, validateQuery, idParamSchema } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { createTransferSchema, queryTransfersSchema } from '../dtos/transfer.dto';

const router = Router();

router.post('/', authenticateToken as any, validateBody(createTransferSchema), asyncHandler(transferenciasController.criarTransferencia as any));
router.get('/', authenticateToken as any, validateQuery(queryTransfersSchema), asyncHandler(transferenciasController.listarTransferencias as any));
router.get('/:id', authenticateToken as any, validateParams(idParamSchema), asyncHandler(transferenciasController.obterTransferencia as any));
router.delete('/:id', authenticateToken as any, validateParams(idParamSchema), asyncHandler(transferenciasController.deletarTransferencia as any));

export default router;
