/**
 * Analysis Routes - Rotas de Análise Financeira
 */

import { Router } from 'express';
import * as analysisController from '../controllers/analysisController';
import { authenticateToken } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validation';
import { projectionQuerySchema, simulateCashFlowSchema } from '../validators/cashFlowValidator';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken as any);

/**
 * @swagger
 * /api/analysis/summary/{dashboardId}:
 *   get:
 *     summary: Obtém resumo financeiro completo
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dashboardId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 */
router.get('/summary/:dashboardId', analysisController.getSummary);

/**
 * @swagger
 * /api/analysis/insights/{dashboardId}:
 *   get:
 *     summary: Obtém insights gerados por IA
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 */
router.get('/insights/:dashboardId', analysisController.getInsights);

/**
 * @swagger
 * /api/analysis/categories/{dashboardId}:
 *   get:
 *     summary: Obtém breakdown por categorias
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 */
router.get('/categories/:dashboardId', analysisController.getCategories);

/**
 * @swagger
 * /api/analysis/monthly/{dashboardId}:
 *   get:
 *     summary: Obtém balanço mensal histórico
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 */
router.get('/monthly/:dashboardId', analysisController.getMonthlyBalance);

/**
 * @swagger
 * /api/analysis/ai-status:
 *   get:
 *     summary: Verifica disponibilidade dos providers de IA
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 */
router.get('/ai-status', analysisController.getAIStatus);

/**
 * @swagger
 * /api/analysis/trigger-job:
 *   post:
 *     summary: Dispara um job manualmente (Admin)
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 */
router.post('/trigger-job', analysisController.triggerJob);

/**
 * @swagger
 * /api/analysis/audit/{dashboardId}:
 *   get:
 *     summary: Gera auditoria financeira completa com IA
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 */
router.get('/audit/:dashboardId', analysisController.getAudit);

/**
 * @swagger
 * /api/analysis/missing-recurrences/{dashboardId}:
 *   get:
 *     summary: Detecta recorrências não lançadas no período
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 */
router.get('/missing-recurrences/:dashboardId', analysisController.getMissingRecurrences);

/**
 * @swagger
 * /api/analysis/chat/{dashboardId}:
 *   post:
 *     summary: Chat interativo com IA sobre finanças
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 */
router.post('/chat/:dashboardId', analysisController.chatWithAI);

/**
 * @swagger
 * /api/analysis/projection/{dashboardId}:
 *   get:
 *     summary: Projeção de fluxo de caixa dia a dia (Traffic Light)
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dashboardId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: daysToProject
 *         schema:
 *           type: integer
 *           default: 30
 *       - in: query
 *         name: yellowThreshold
 *         schema:
 *           type: number
 *           default: 500
 *         description: Margem em R$ para separar GREEN de YELLOW
 */
router.get('/projection/:dashboardId',
    validateQuery(projectionQuerySchema),
    analysisController.getCashFlowProjection
);

/**
 * @swagger
 * /api/analysis/simulate/{dashboardId}:
 *   post:
 *     summary: Simulação de fluxo de caixa com transações injetadas
 *     description: Simula injeções de capital ou novos gastos no fluxo de caixa projetado sem alterar o banco de dados.
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dashboardId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mockTransactions
 *             properties:
 *               mockTransactions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     date:
 *                       type: string
 *                       format: date
 *                     amount:
 *                       type: number
 *                     entryType:
 *                       type: string
 *                       enum: [Receita, Despesa]
 *                     description:
 *                       type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               daysToProject:
 *                 type: integer
 *                 default: 30
 *               yellowThreshold:
 *                 type: number
 *                 default: 500
 */
router.post('/simulate/:dashboardId',
    validateBody(simulateCashFlowSchema),
    analysisController.simulateCashFlow
);

/**
 * @swagger
 * /api/analysis/daily-pacing/{dashboardId}:
 *   get:
 *     summary: Obtém a cota diária de gastos livres (Daily Pacing)
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dashboardId
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/daily-pacing/:dashboardId', analysisController.getDailyPacing);

export default router;

