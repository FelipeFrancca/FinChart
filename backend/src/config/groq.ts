/**
 * Configuração do Groq AI
 * Client para inferência rápida com modelos LLaMA/Mixtral
 */

import Groq from 'groq-sdk';
import { logger } from '../utils/logger';

/**
 * Classe Singleton para gerenciar a conexão com o Groq
 */
export class GroqConfig {
    private static instance: GroqConfig;
    private client: Groq | null = null;
    private apiKey: string | null = null;

    // Modelos disponíveis no Groq (em ordem de preferência)
    private readonly models = [
        'llama-3.3-70b-versatile',  // Melhor qualidade (substituiu o 3.1)
        'llama-3.1-8b-instant',      // Mais rápido
        'mixtral-8x7b-32768',        // Bom para contexto longo
    ];
    private currentModelIndex: number = 0;

    private constructor() {
        this.loadApiKey();
        this.initializeClient();
    }

    private loadApiKey() {
        this.apiKey = process.env.GROQ_AI_API_KEY || null;

        if (!this.apiKey) {
            logger.warn('Chave GROQ_AI_API_KEY não encontrada', 'GroqConfig');
        } else {
            logger.info('Chave Groq API carregada com sucesso', 'GroqConfig');
        }
    }

    private initializeClient() {
        if (!this.apiKey) return;

        try {
            this.client = new Groq({
                apiKey: this.apiKey,
            });
            logger.info(`Groq inicializado com modelo ${this.getCurrentModel()}`, 'GroqConfig');
        } catch (error) {
            logger.error('Erro ao inicializar cliente Groq', error, 'GroqConfig');
        }
    }

    public static getInstance(): GroqConfig {
        if (!GroqConfig.instance) {
            GroqConfig.instance = new GroqConfig();
        }
        return GroqConfig.instance;
    }

    public getClient(): Groq {
        if (!this.client) {
            this.initializeClient();
            if (!this.client) {
                throw new Error('Cliente Groq não disponível. Verifique GROQ_AI_API_KEY.');
            }
        }
        return this.client;
    }

    public isAvailable(): boolean {
        return !!this.apiKey;
    }

    public getCurrentModel(): string {
        return this.models[this.currentModelIndex];
    }

    /**
     * Rota para próximo modelo em caso de erro
     */
    public rotateModel(): boolean {
        if (this.currentModelIndex < this.models.length - 1) {
            this.currentModelIndex++;
            logger.info(`Rotacionando para modelo Groq: ${this.getCurrentModel()}`, 'GroqConfig');
            return true;
        }
        this.currentModelIndex = 0; // Reset para o primeiro
        return false;
    }

    /**
     * Gera uma resposta de chat
     */
    public async chat(
        messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
        options?: {
            temperature?: number;
            maxTokens?: number;
        }
    ): Promise<string> {
        const client = this.getClient();
        const model = this.getCurrentModel();

        try {
            const response = await client.chat.completions.create({
                model,
                messages,
                temperature: options?.temperature ?? 0.3,
                max_tokens: options?.maxTokens ?? 2048,
            });

            return response.choices[0]?.message?.content || '';
        } catch (error: any) {
            logger.error(`Erro no Groq chat (modelo: ${model})`, error, 'GroqConfig');

            // Tentar rotacionar modelo se for erro de rate limit ou modelo desativado
            if (error.status === 429 || error.status === 503 || error?.error?.error?.code === 'model_decommissioned') {
                if (this.rotateModel()) {
                    return this.chat(messages, options); // Retry com novo modelo
                }
            }
            throw error;
        }
    }
}

// Exporta a instância singleton
export const groqConfig = GroqConfig.getInstance();
