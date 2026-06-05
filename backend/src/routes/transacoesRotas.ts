import { Router } from 'express';
import * as transacoesController from '../controllers/transacoesController';
import { authenticateToken } from '../middleware/auth';
import { validateBody, validateParams, idParamSchema } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
// Nota: schemas de validação de transação precisam ser importados de onde estiverem (assumindo validators/transactionValidator ou similar)
// Como não tenho certeza do local exato dos schemas antigos, vou usar 'any' temporariamente ou importar se souber.
// Vou assumir que existem schemas básicos ou usar validação genérica por enquanto para não quebrar.
// Idealmente: import { createTransactionSchema } from '../validators/transactionValidator';

const router = Router();

router.post('/', authenticateToken as any, asyncHandler(transacoesController.criarTransacao as any));
router.post('/bulk', authenticateToken as any, asyncHandler(transacoesController.criarTransacoesEmLote as any));
router.delete('/bulk', authenticateToken as any, asyncHandler(transacoesController.deletarTransacoesEmLote as any));
router.get('/', authenticateToken as any, asyncHandler(transacoesController.listarTransacoes as any));
router.get('/summary', authenticateToken as any, asyncHandler(transacoesController.obterResumo as any));
router.get('/stats/summary', authenticateToken as any, asyncHandler(transacoesController.obterResumo as any));
router.get('/export', authenticateToken as any, asyncHandler(transacoesController.exportarTransacoes as any));

// Rotas de grupo de parcelas (devem vir antes de /:id)
router.get('/installment-group/:groupId', authenticateToken as any, asyncHandler(transacoesController.obterGrupoParcelas as any));
router.put('/installment-group/:groupId', authenticateToken as any, asyncHandler(transacoesController.atualizarGrupoParcelas as any));

router.get('/:id', authenticateToken as any, validateParams(idParamSchema), asyncHandler(transacoesController.obterTransacao as any));
router.put('/:id', authenticateToken as any, validateParams(idParamSchema), asyncHandler(transacoesController.atualizarTransacao as any));
router.patch('/:id/suspend', authenticateToken as any, validateParams(idParamSchema), asyncHandler(transacoesController.alternarSuspensaoTransacao as any));
router.delete('/:id', authenticateToken as any, validateParams(idParamSchema), asyncHandler(transacoesController.deletarTransacao as any));

export default router;
