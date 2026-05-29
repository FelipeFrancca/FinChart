/**
 * Analysis Routes - Rotas de Análise Financeira
 */

import { Router } from 'express';
import * as analysisController from '../controllers/analysisController';
import { authenticateToken } from '../middleware/auth';

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

export default router;
