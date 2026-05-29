/**
 * Analysis Controller - Endpoints de Análise Financeira
 */

import { Request, Response, NextFunction } from 'express';
import { financialAnalysisService } from '../services/analysisServico';
import { aiRouter } from '../services/aiRouterServico';
import { aiCache } from '../services/aiCacheServico';
import { cronService } from '../services/cronServico';
import { logger } from '../utils/logger';

/**
 * GET /api/analysis/summary/:dashboardId
 * Obtém resumo financeiro completo
 */
export async function getSummary(req: Request, res: Response, next: NextFunction) {
    try {
        const { dashboardId } = req.params;
        const userId = (req as any).user?.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Usuário não autenticado' });
        }

        // Parse de datas (default: último mês)
        const endDate = req.query.endDate
            ? new Date(req.query.endDate as string)
            : new Date();
        const startDate = req.query.startDate
            ? new Date(req.query.startDate as string)
            : new Date(endDate.getFullYear(), endDate.getMonth(), 1);

        const summary = await financialAnalysisService.getFinancialSummary(
            dashboardId,
            userId,
            startDate,
            endDate
        );

        res.json({
            success: true,
            data: summary,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/analysis/insights/:dashboardId
 * Obtém insights gerados por IA
 */
export async function getInsights(req: Request, res: Response, next: NextFunction) {
    try {
        const { dashboardId } = req.params;
        const userId = (req as any).user?.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Usuário não autenticado' });
        }

        const endDate = req.query.endDate
            ? new Date(req.query.endDate as string)
            : new Date();
        const startDate = req.query.startDate
            ? new Date(req.query.startDate as string)
            : new Date(endDate.getFullYear(), endDate.getMonth(), 1);

        // Verificar cache primeiro
        const cacheKey = `${startDate.toISOString()}_${endDate.toISOString()}`;
        const cached = aiCache.get(dashboardId, 'insights', cacheKey);
        if (cached) {
            return res.json({
                success: true,
                data: {
                    insights: cached,
                    generatedAt: new Date().toISOString(),
                    period: { start: startDate.toISOString(), end: endDate.toISOString() },
                    fromCache: true,
                },
            });
        }

        const insights = await financialAnalysisService.getAIInsights(
            dashboardId,
            userId,
            startDate,
            endDate
        );

        // Salvar no cache (30 min)
        aiCache.set(dashboardId, 'insights', insights, cacheKey);

        res.json({
            success: true,
            data: {
                insights,
                generatedAt: new Date().toISOString(),
                period: {
                    start: startDate.toISOString(),
                    end: endDate.toISOString(),
                },
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/analysis/categories/:dashboardId
 * Obtém breakdown por categorias
 */
export async function getCategories(req: Request, res: Response, next: NextFunction) {
    try {
        const { dashboardId } = req.params;
        const limit = parseInt(req.query.limit as string) || 10;

        const endDate = req.query.endDate
            ? new Date(req.query.endDate as string)
            : new Date();
        const startDate = req.query.startDate
            ? new Date(req.query.startDate as string)
            : new Date(endDate.getFullYear(), endDate.getMonth(), 1);

        const categories = await financialAnalysisService.getTopExpenseCategories(
            dashboardId,
            startDate,
            endDate,
            limit
        );

        res.json({
            success: true,
            data: categories,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/analysis/monthly/:dashboardId
 * Obtém balanço mensal histórico
 */
export async function getMonthlyBalance(req: Request, res: Response, next: NextFunction) {
    try {
        const { dashboardId } = req.params;
        const months = parseInt(req.query.months as string) || 6;

        const balance = await financialAnalysisService.getMonthlyBalance(
            dashboardId,
            months
        );

        res.json({
            success: true,
            data: balance,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/analysis/ai-status
 * Verifica disponibilidade dos providers de IA
 */
export async function getAIStatus(req: Request, res: Response, next: NextFunction) {
    try {
        const availability = aiRouter.getAvailability();

        res.json({
            success: true,
            data: {
                providers: availability,
                preferredForText: 'groq',
                preferredForImages: 'gemini',
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/analysis/trigger-job (Admin only)
 * Dispara um job manualmente
 */
export async function triggerJob(req: Request, res: Response, next: NextFunction) {
    try {
        const { jobName } = req.body;

        if (!jobName) {
            return res.status(400).json({
                success: false,
                error: 'jobName é obrigatório',
            });
        }

        await cronService.runJob(jobName);

        res.json({
            success: true,
            message: `Job ${jobName} executado com sucesso`,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/analysis/audit/:dashboardId
 * Gera auditoria financeira completa com IA
 */
export async function getAudit(req: Request, res: Response, next: NextFunction) {
    try {
        const { dashboardId } = req.params;
        const userId = (req as any).user?.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Usuário não autenticado' });
        }

        const endDate = req.query.endDate
            ? new Date(req.query.endDate as string)
            : new Date();
        const startDate = req.query.startDate
            ? new Date(req.query.startDate as string)
            : new Date(endDate.getFullYear(), endDate.getMonth(), 1);

        // Verificar cache primeiro (TTL 60 min)
        const cacheKey = `${startDate.toISOString()}_${endDate.toISOString()}`;
        const cached = aiCache.get(dashboardId, 'audit', cacheKey);
        if (cached) {
            return res.json({
                success: true,
                data: { auditText: cached, fromCache: true },
            });
        }

        const audit = await financialAnalysisService.generateFullAudit(
            dashboardId,
            userId,
            startDate,
            endDate
        );

        // Salvar no cache (60 min)
        if (audit.auditText) {
            aiCache.set(dashboardId, 'audit', audit.auditText, cacheKey);
        }

        res.json({ success: true, data: audit });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/analysis/missing-recurrences/:dashboardId
 * Detecta recorrências não lançadas no mês
 */
export async function getMissingRecurrences(req: Request, res: Response, next: NextFunction) {
    try {
        const { dashboardId } = req.params;
        const userId = (req as any).user?.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Usuário não autenticado' });
        }

        const missing = await financialAnalysisService.detectMissingRecurrences(dashboardId);

        res.json({ success: true, data: missing });
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/analysis/chat/:dashboardId
 * Chat interativo com IA (mantém histórico na sessão)
 */
export async function chatWithAI(req: Request, res: Response, next: NextFunction) {
    try {
        const { dashboardId } = req.params;
        const userId = (req as any).user?.userId;
        const { message, history } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Usuário não autenticado' });
        }

        if (!message || typeof message !== 'string') {
            return res.status(400).json({ success: false, error: 'Mensagem é obrigatória' });
        }

        const response = await financialAnalysisService.chatWithAI(
            dashboardId,
            userId,
            message,
            history || []
        );

        res.json({
            success: true,
            data: {
                response,
                generatedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        next(error);
    }
}
