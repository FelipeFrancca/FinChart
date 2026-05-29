import { Request, Response } from 'express';
import * as transacoesServico from '../services/transacoesServico';
import { generateCSV, generateXLSX } from '../services/exportService';
import { AuthRequest } from '../middleware/auth';
import { websocketService, WS_EVENTS } from '../services/websocketServico';
import { aiCache } from '../services/aiCacheServico';

export const criarTransacao = async (req: AuthRequest, res: Response) => {
    const { dashboardId } = req.body;
    if (!dashboardId) {
        return res.status(400).json({ success: false, error: 'dashboardId é obrigatório' });
    }
    const transacao = await transacoesServico.createTransaction(req.body, dashboardId, req.user!.userId);
    
    // Emitir evento WebSocket
    websocketService.emitToDashboard(dashboardId, WS_EVENTS.TRANSACTION_CREATED, {
        transaction: transacao,
        userId: req.user!.userId,
    });
    
    aiCache.invalidate(dashboardId); // Invalidar cache de IA
    res.status(201).json({ success: true, data: transacao });
};

export const criarTransacoesEmLote = async (req: AuthRequest, res: Response) => {
    const { dashboardId, transactions } = req.body;
    if (!dashboardId) {
        return res.status(400).json({ success: false, error: 'dashboardId é obrigatório' });
    }
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
        return res.status(400).json({ success: false, error: 'Array de transações é obrigatório e não pode estar vazio' });
    }
    if (transactions.length > 500) {
        return res.status(400).json({
            success: false,
            error: `Máximo de 500 transações por lote. Recebido: ${transactions.length}`
        });
    }
    const transacoes = await transacoesServico.createManyTransactions(transactions, dashboardId, req.user!.userId);
    
    // Emitir evento WebSocket para lote
    websocketService.emitToDashboard(dashboardId, WS_EVENTS.TRANSACTIONS_IMPORTED, {
        count: transacoes.length,
        userId: req.user!.userId,
    });
    
    aiCache.invalidate(dashboardId); // Invalidar cache de IA
    res.status(201).json({ success: true, data: { count: transacoes.length, transactions: transacoes } });
};

export const listarTransacoes = async (req: AuthRequest, res: Response) => {
    const { dashboardId } = req.query;
    if (!dashboardId || typeof dashboardId !== 'string') {
        return res.status(400).json({ success: false, error: 'dashboardId é obrigatório' });
    }
    const transacoes = await transacoesServico.getAllTransactions(req.query, dashboardId, req.user!.userId);
    res.json({ success: true, data: transacoes });
};

export const obterTransacao = async (req: AuthRequest, res: Response) => {
    const { dashboardId } = req.query;
    if (!dashboardId || typeof dashboardId !== 'string') {
        return res.status(400).json({ success: false, error: 'dashboardId é obrigatório' });
    }
    const transacao = await transacoesServico.getTransactionById(req.params.id, dashboardId, req.user!.userId);
    res.json({ success: true, data: transacao });
};

export const atualizarTransacao = async (req: AuthRequest, res: Response) => {
    const { dashboardId } = req.body;
    if (!dashboardId) {
        return res.status(400).json({ success: false, error: 'dashboardId é obrigatório' });
    }
    const transacao = await transacoesServico.updateTransaction(req.params.id, req.body, dashboardId, req.user!.userId);
    
    // Emitir evento WebSocket
    websocketService.emitToDashboard(dashboardId, WS_EVENTS.TRANSACTION_UPDATED, {
        transaction: transacao,
        userId: req.user!.userId,
    });
    
    aiCache.invalidate(dashboardId); // Invalidar cache de IA
    res.json({ success: true, data: transacao });
};

export const deletarTransacao = async (req: AuthRequest, res: Response) => {
    const { dashboardId } = req.query;
    if (!dashboardId || typeof dashboardId !== 'string') {
        return res.status(400).json({ success: false, error: 'dashboardId é obrigatório' });
    }
    await transacoesServico.deleteTransaction(req.params.id, dashboardId, req.user!.userId);
    
    // Emitir evento WebSocket
    websocketService.emitToDashboard(dashboardId, WS_EVENTS.TRANSACTION_DELETED, {
        transactionId: req.params.id,
        userId: req.user!.userId,
    });
    
    aiCache.invalidate(dashboardId); // Invalidar cache de IA
    res.status(204).send();
};

export const obterResumo = async (req: AuthRequest, res: Response) => {
    const { dashboardId } = req.query;
    if (!dashboardId || typeof dashboardId !== 'string') {
        return res.status(400).json({ success: false, error: 'dashboardId é obrigatório' });
    }
    const resumo = await transacoesServico.getStatsSummary(req.query, dashboardId, req.user!.userId);
    res.json({ success: true, data: resumo });
};

// ============ GRUPO DE PARCELAS ============

export const obterGrupoParcelas = async (req: AuthRequest, res: Response) => {
    const { dashboardId } = req.query;
    const { groupId } = req.params;

    if (!dashboardId || typeof dashboardId !== 'string') {
        return res.status(400).json({ success: false, error: 'dashboardId é obrigatório' });
    }
    if (!groupId) {
        return res.status(400).json({ success: false, error: 'groupId é obrigatório' });
    }

    const parcelas = await transacoesServico.getInstallmentGroup(groupId, dashboardId, req.user!.userId);
    res.json({ success: true, data: parcelas });
};

export const atualizarGrupoParcelas = async (req: AuthRequest, res: Response) => {
    const { dashboardId, scope, ...updateData } = req.body;
    const { groupId } = req.params;

    if (!dashboardId) {
        return res.status(400).json({ success: false, error: 'dashboardId é obrigatório' });
    }
    if (!groupId) {
        return res.status(400).json({ success: false, error: 'groupId é obrigatório' });
    }

    const validScopes = ['all', 'remaining', 'single'];
    const updateScope = validScopes.includes(scope) ? scope : 'all';

    const result = await transacoesServico.updateInstallmentGroup(
        groupId,
        updateData,
        dashboardId,
        req.user!.userId,
        updateScope as 'all' | 'remaining' | 'single'
    );

    aiCache.invalidate(dashboardId); // Invalidar cache de IA
    res.json({ success: true, data: result });
};

export const deletarTransacoesEmLote = async (req: AuthRequest, res: Response) => {
    const { dashboardId, ids, includeInstallments = true } = req.body;

    if (!dashboardId) {
        return res.status(400).json({ success: false, error: 'dashboardId é obrigatório' });
    }
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: 'ids é obrigatório e deve ser um array não vazio' });
    }

    const result = await transacoesServico.deleteManyTransactions(
        ids,
        dashboardId,
        req.user!.userId,
        includeInstallments
    );

    aiCache.invalidate(dashboardId); // Invalidar cache de IA
    res.json({ success: true, data: result });
};

// ============ EXPORTAÇÃO ============

export const exportarTransacoes = async (req: AuthRequest, res: Response) => {
    const { dashboardId, format = 'csv', ids } = req.query;

    if (!dashboardId || typeof dashboardId !== 'string') {
        return res.status(400).json({ success: false, error: 'dashboardId é obrigatório' });
    }

    const validFormats = ['csv', 'xlsx'];
    const exportFormat = validFormats.includes(format as string) ? format as string : 'csv';

    try {
        // Fetch transactions with optional filter by IDs
        let transactions = await transacoesServico.getAllTransactions(req.query, dashboardId, req.user!.userId);

        // If specific IDs are provided, filter to only those transactions
        if (ids && typeof ids === 'string') {
            const idList = ids.split(',').map(id => id.trim());
            transactions = transactions.filter(t => idList.includes(t.id));
        }

        if (transactions.length === 0) {
            return res.status(404).json({ success: false, error: 'Nenhuma transação encontrada para exportar' });
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `transacoes_${dateStr}`;

        if (exportFormat === 'xlsx') {
            const buffer = await generateXLSX(transactions, 'Transações');

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
            res.send(buffer);
        } else {
            const csvContent = generateCSV(transactions);

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            res.send(csvContent);
        }
    } catch (error) {
        console.error('[ExportController] Error exporting transactions:', error);
        res.status(500).json({ success: false, error: 'Erro ao exportar transações' });
    }
};
