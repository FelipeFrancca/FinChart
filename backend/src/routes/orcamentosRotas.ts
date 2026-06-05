import { Router } from 'express';
import * as orcamentosController from '../controllers/orcamentosController';
import { authenticateToken } from '../middleware/auth';
import { validateBody, validateParams, validateQuery, idParamSchema } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { createBudgetSchema, updateBudgetSchema, queryBudgetsSchema } from '../dtos/budget.dto';

const router = Router();

router.post('/', authenticateToken as any, validateBody(createBudgetSchema), asyncHandler(orcamentosController.criarOrcamento as any));
router.get('/', authenticateToken as any, validateQuery(queryBudgetsSchema), asyncHandler(orcamentosController.listarOrcamentos as any));
router.get('/summary', authenticateToken as any, asyncHandler(orcamentosController.obterResumo as any));
router.get('/:id', authenticateToken as any, validateParams(idParamSchema), asyncHandler(orcamentosController.obterOrcamento as any));
router.put('/:id', authenticateToken as any, validateParams(idParamSchema), validateBody(updateBudgetSchema), asyncHandler(orcamentosController.atualizarOrcamento as any));
router.delete('/:id', authenticateToken as any, validateParams(idParamSchema), asyncHandler(orcamentosController.deletarOrcamento as any));

export default router;
