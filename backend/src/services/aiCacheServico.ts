/**
 * AI Cache Service
 * Cache em memória com TTL para respostas de IA
 * Evita chamadas repetidas e desperdiço de tokens
 */

import { logger } from '../utils/logger';
import crypto from 'crypto';

interface CacheEntry {
    data: string;
    expiry: number;
    createdAt: Date;
}

// TTL padrão por tipo de operação (em minutos)
const DEFAULT_TTL: Record<string, number> = {
    insights: 30,       // Insights da Visão Geral: 30 min
    audit: 60,          // Auditoria completa: 1h
    weekly_summary: 360, // Resumo semanal: 6h
    monthly_report: 720, // Relatório mensal: 12h
    allocation_analysis: 30, // Análise de alocação: 30 min
    recommendations: 60,    // Recomendações: 1h
};

class AICacheService {
    private cache: Map<string, CacheEntry> = new Map();
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        // Limpar entradas expiradas a cada 5 minutos
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Gera chave de cache baseada no dashboard + tipo + hash do contexto
     */
    private generateKey(dashboardId: string, operationType: string, contextHash?: string): string {
        const hash = contextHash || 'default';
        return `${dashboardId}:${operationType}:${hash}`;
    }

    /**
     * Gera hash compacto de um objeto de contexto
     */
    public hashContext(context: any): string {
        const str = JSON.stringify(context);
        return crypto.createHash('md5').update(str).digest('hex').substring(0, 12);
    }

    /**
     * Busca uma entrada no cache
     */
    get(dashboardId: string, operationType: string, contextHash?: string): string | null {
        const key = this.generateKey(dashboardId, operationType, contextHash);
        const entry = this.cache.get(key);

        if (!entry) return null;

        // Verificar se expirou
        if (Date.now() > entry.expiry) {
            this.cache.delete(key);
            logger.debug(`Cache expirado: ${operationType} (dashboard ${dashboardId})`, 'AICache');
            return null;
        }

        logger.info(`Cache HIT: ${operationType} (dashboard ${dashboardId}) — economia de tokens!`, 'AICache');
        return entry.data;
    }

    /**
     * Armazena uma entrada no cache
     */
    set(dashboardId: string, operationType: string, data: string, contextHash?: string, ttlMinutes?: number): void {
        const ttl = ttlMinutes ?? DEFAULT_TTL[operationType] ?? 30;
        const key = this.generateKey(dashboardId, operationType, contextHash);

        this.cache.set(key, {
            data,
            expiry: Date.now() + ttl * 60 * 1000,
            createdAt: new Date(),
        });

        logger.info(`Cache SET: ${operationType} (dashboard ${dashboardId}, TTL=${ttl}min)`, 'AICache');
    }

    /**
     * Invalida todo o cache de um dashboard (ex: ao criar/editar transação)
     */
    invalidate(dashboardId: string): void {
        let removed = 0;
        for (const [key] of this.cache) {
            if (key.startsWith(`${dashboardId}:`)) {
                this.cache.delete(key);
                removed++;
            }
        }
        if (removed > 0) {
            logger.info(`Cache invalidado: ${removed} entradas do dashboard ${dashboardId}`, 'AICache');
        }
    }

    /**
     * Invalida um tipo específico de cache de um dashboard
     */
    invalidateType(dashboardId: string, operationType: string): void {
        for (const [key] of this.cache) {
            if (key.startsWith(`${dashboardId}:${operationType}:`)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Retorna informações sobre o estado do cache
     */
    getStats(): { totalEntries: number; byType: Record<string, number> } {
        const byType: Record<string, number> = {};
        for (const [key] of this.cache) {
            const type = key.split(':')[1];
            byType[type] = (byType[type] || 0) + 1;
        }
        return { totalEntries: this.cache.size, byType };
    }

    /**
     * Limpa entradas expiradas
     */
    private cleanup(): void {
        const now = Date.now();
        let removed = 0;
        for (const [key, entry] of this.cache) {
            if (now > entry.expiry) {
                this.cache.delete(key);
                removed++;
            }
        }
        if (removed > 0) {
            logger.debug(`Cache cleanup: ${removed} entradas expiradas removidas`, 'AICache');
        }
    }

    /**
     * Limpa todo o cache
     */
    clear(): void {
        this.cache.clear();
        logger.info('Cache completamente limpo', 'AICache');
    }

    /**
     * Para o cleanup interval (para shutdown gracioso)
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.cache.clear();
    }
}

// Exportar instância singleton
export const aiCache = new AICacheService();
