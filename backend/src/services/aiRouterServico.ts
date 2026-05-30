/**
 * AI Router Service
 * Distribui requisições entre Gemini (imagens) e Groq (texto)
 */

import { aiConfig } from '../config/ai';
import { groqConfig } from '../config/groq';
import { logger } from '../utils/logger';

export type AIProvider = 'gemini' | 'groq' | 'auto';

export type TaskType =
    | 'image_extraction'    // Gemini - extração de dados de imagens
    | 'pdf_extraction'      // Gemini - extração de dados de PDFs
    | 'text_summary'        // Groq - resumos de texto
    | 'financial_analysis'  // Groq - análise financeira
    | 'recommendations'     // Groq - recomendações personalizadas
    | 'general_chat';       // Groq - chat geral

/**
 * Mapeia tipo de tarefa para provider recomendado
 */
const TASK_PROVIDER_MAP: Record<TaskType, AIProvider> = {
    'image_extraction': 'gemini',
    'pdf_extraction': 'gemini',
    'text_summary': 'groq',
    'financial_analysis': 'groq',
    'recommendations': 'groq',
    'general_chat': 'groq',
};

/**
 * Serviço de roteamento de IA
 */
export class AIRouterService {
    private static instance: AIRouterService;

    private constructor() { }

    public static getInstance(): AIRouterService {
        if (!AIRouterService.instance) {
            AIRouterService.instance = new AIRouterService();
        }
        return AIRouterService.instance;
    }

    /**
     * Verifica disponibilidade dos providers
     */
    public getAvailability(): { gemini: boolean; groq: boolean } {
        return {
            gemini: aiConfig.isAvailable(),
            groq: groqConfig.isAvailable(),
        };
    }

    /**
     * Seleciona o provider ideal para uma tarefa
     */
    public selectProvider(taskType: TaskType): AIProvider {
        const availability = this.getAvailability();
        const preferred = TASK_PROVIDER_MAP[taskType];

        // Se preferido está disponível, usa ele
        if (preferred === 'gemini' && availability.gemini) return 'gemini';
        if (preferred === 'groq' && availability.groq) return 'groq';

        // Fallback: usa o que estiver disponível
        if (preferred === 'gemini' && availability.groq) {
            logger.warn(`Gemini indisponível para ${taskType}, usando Groq como fallback`, 'AIRouter');
            return 'groq';
        }
        if (preferred === 'groq' && availability.gemini) {
            logger.warn(`Groq indisponível para ${taskType}, usando Gemini como fallback`, 'AIRouter');
            return 'gemini';
        }

        throw new Error(`Nenhum provider de IA disponível para a tarefa: ${taskType}`);
    }

    /**
     * Executa uma tarefa de texto usando Groq (preferencial) ou Gemini
     */
    public async generateText(
        systemPrompt: string,
        userPrompt: string,
        taskType: TaskType = 'general_chat'
    ): Promise<string> {
        const provider = this.selectProvider(taskType);

        logger.info(`Executando tarefa '${taskType}' via ${provider}`, 'AIRouter');

        if (provider === 'groq') {
            const tokenLimits: Record<TaskType, number> = {
                image_extraction: 1024,
                pdf_extraction: 1024,
                text_summary: 512,
                financial_analysis: 1500,
                recommendations: 1024,
                general_chat: 1024
            };
            return groqConfig.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ], { maxTokens: tokenLimits[taskType] });
        }

        // Fallback para Gemini
        const model = aiConfig.getModel();
        const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
        const response = await result.response;
        return response.text();
    }

    /**
     * Gera análise financeira usando Groq
     */
    public async generateFinancialAnalysis(
        data: {
            period: string;
            totalIncome: number;
            totalExpenses: number;
            categories: { name: string; amount: number; percentage: number }[];
            trends?: { category: string; change: number }[];
        }
    ): Promise<string> {
        const systemPrompt = `Você é um consultor financeiro pessoal especializado em finanças brasileiras.
Seu papel é analisar os dados financeiros do usuário e fornecer insights acionáveis.
Seja direto, prático e use linguagem simples. Evite jargões financeiros complexos.
Responda sempre em português brasileiro.
Foque em: padrões de gastos, oportunidades de economia, e alertas importantes.`;

        const userPrompt = `Analise os seguintes dados financeiros do período ${data.period}:

**Resumo:**
- Receita Total: R$ ${data.totalIncome.toFixed(2)}
- Despesas Totais: R$ ${data.totalExpenses.toFixed(2)}
- Saldo: R$ ${(data.totalIncome - data.totalExpenses).toFixed(2)}

**Gastos por Categoria:**
${data.categories.map(c => `- ${c.name}: R$ ${c.amount.toFixed(2)} (${c.percentage.toFixed(1)}%)`).join('\n')}

${data.trends ? `**Tendências:**\n${data.trends.map(t => `- ${t.category}: ${t.change > 0 ? '+' : ''}${t.change.toFixed(1)}% vs mês anterior`).join('\n')}` : ''}

Forneça:
1. Resumo da situação financeira (2-3 frases)
2. Top 3 insights ou alertas importantes
3. 2 sugestões práticas para economizar`;

        return this.generateText(systemPrompt, userPrompt, 'financial_analysis');
    }

    /**
     * Gera resumo semanal usando Groq
     */
    public async generateWeeklySummary(
        data: {
            userName: string;
            weekNumber: number;
            totalSpent: number;
            topCategories: { name: string; amount: number }[];
            unusualTransactions?: { description: string; amount: number }[];
            budgetAlerts?: { category: string; percentage: number }[];
        }
    ): Promise<string> {
        const systemPrompt = `Você é um assistente financeiro amigável que envia resumos semanais.
Seja breve, positivo quando possível, mas honesto sobre problemas.
Use emojis moderadamente para tornar a leitura agradável.
Responda em português brasileiro.`;

        const userPrompt = `Crie um resumo semanal para ${data.userName} (Semana ${data.weekNumber}):

**Gastos da Semana:** R$ ${data.totalSpent.toFixed(2)}

**Principais Categorias:**
${data.topCategories.map(c => `- ${c.name}: R$ ${c.amount.toFixed(2)}`).join('\n')}

${data.unusualTransactions?.length ? `**Transações Incomuns:**\n${data.unusualTransactions.map(t => `- ${t.description}: R$ ${t.amount.toFixed(2)}`).join('\n')}` : ''}

${data.budgetAlerts?.length ? `**Alertas de Orçamento:**\n${data.budgetAlerts.map(a => `- ${a.category}: ${a.percentage}% do limite`).join('\n')}` : ''}

Crie um resumo curto (máximo 150 palavras) destacando os pontos principais e uma dica útil.`;

        return this.generateText(systemPrompt, userPrompt, 'text_summary');
    }

    /**
     * Gera análise de alocação de orçamento usando Groq
     */
    public async generateAllocationAnalysis(
        data: {
            monthlyIncome: number;
            allocations: {
                name: string;
                targetPercentage: number;
                actualPercentage: number;
                targetAmount: number;
                actualAmount: number;
                status: 'under' | 'on_track' | 'over';
            }[];
            unallocatedExpenses: { category: string; amount: number }[];
            overallStatus: 'healthy' | 'warning' | 'critical';
        }
    ): Promise<string> {
        const systemPrompt = `Você é um consultor financeiro especializado em orçamento pessoal.
Analise a distribuição de gastos do usuário em relação às metas de alocação definidas.
Seja direto, prático e construtivo. Foque em ações que o usuário pode tomar.
Responda em português brasileiro.`;

        const statusEmoji = {
            under: '✅',
            on_track: '✅',
            over: '⚠️',
        };

        const overallStatusText = {
            healthy: 'Saudável ✅',
            warning: 'Atenção ⚠️',
            critical: 'Crítico 🚨',
        };

        const userPrompt = `Analise a distribuição de orçamento deste mês:

**Receita Mensal:** R$ ${data.monthlyIncome.toFixed(2)}
**Status Geral:** ${overallStatusText[data.overallStatus]}

**Alocações vs Realizado:**
${data.allocations.map(a => `${statusEmoji[a.status]} ${a.name}: Meta ${a.targetPercentage}% (R$ ${a.targetAmount.toFixed(2)}) → Real ${a.actualPercentage.toFixed(1)}% (R$ ${a.actualAmount.toFixed(2)})`).join('\n')}

${data.unallocatedExpenses.length > 0 ? `**Gastos Não Classificados:**\n${data.unallocatedExpenses.slice(0, 5).map(e => `- ${e.category}: R$ ${e.amount.toFixed(2)}`).join('\n')}` : ''}

Por favor, forneça:
1. Avaliação geral da distribuição (2-3 frases)
2. As 2 áreas que mais precisam de atenção
3. 2 sugestões práticas para melhorar a distribuição
4. Uma meta realista para o próximo mês`;

        return this.generateText(systemPrompt, userPrompt, 'financial_analysis');
    }

    /**
     * Gera auditoria financeira completa com contexto total
     */
    public async generateFinancialAudit(context: any): Promise<string> {
        const systemPrompt = `Você é um auditor financeiro pessoal altamente qualificado, especialista em finanças brasileiras.
Sua função é realizar uma AUDITORIA COMPLETA e DETALHADA das finanças do usuário.
Seja extremamente criterioso, analítico e direto. Use dados reais fornecidos para embasar cada observação.
Responda sempre em português brasileiro com formatação markdown.
Use emojis estrategicamente para tornar a leitura mais clara (✅ ⚠️ 🚨 📊 💰 🎯 📈 📉).

## 🔴 CICLO FINANCEIRO CLT — REGRA OBRIGATÓRIA:
O usuário é trabalhador CLT. O ciclo financeiro CLT funciona assim:
- Mês X: o usuário TRABALHA e tem DESPESAS (compras, contas, parcelas)
- Mês X+1: RECEBE o salário pelo trabalho do mês X e usa esse salário para PAGAR as despesas do mês X
PORTANTO: Se a receita do período atual é R$0 ou baixa, isso é COMPLETAMENTE NORMAL para CLT.
Você DEVE verificar a seção "RECEITA QUE COBRIRÁ ESTAS DESPESAS" antes de concluir qualquer coisa sobre saúde financeira.
Se há receitas cadastradas no próximo mês, o usuário TEM renda — ela simplesmente ainda não entrou.
🚫 NÃO emita alerta de "falta de receita" se houver receita cadastrada no próximo mês.
🚫 NÃO diga que a situação é "desafiadora" ou "crítica" apenas porque o mês atual mostra R$0 de receita.
✅ O diagnóstico CORRETO compara: Despesas Próprias do mês atual vs Receita do próximo mês.

## OUTRAS REGRAS OBRIGATÓRIAS:
- Despesas marcadas como "de terceiro" (isThirdParty) NÃO são pagas pelo usuário. EXCLUA-as de todos os cálculos de comprometimento.
- O saldo REAL do usuário = Receita do próximo mês - Despesas próprias do mês atual.`;

        const periodStr = context.period
            ? `${new Date(context.period.start).toLocaleDateString('pt-BR')} a ${new Date(context.period.end).toLocaleDateString('pt-BR')}`
            : 'Mês atual';

        // Pré-calcular o saldo real CLT
        const ownExp = context.ownExpenses ?? context.totalExpenses;
        const nextIncome = context.nextMonth?.income ?? 0;
        const realBalanceCLT = nextIncome - ownExp;

        const userPrompt = `Realize uma auditoria financeira completa dos seguintes dados do período ${periodStr}:

## RESUMO FINANCEIRO DO PERÍODO
- Receita registrada no período: R$ ${context.totalIncome.toFixed(2)}
- Despesas Totais: R$ ${context.totalExpenses.toFixed(2)}
- Despesas Próprias (que o usuário paga): R$ ${ownExp.toFixed(2)}
- Despesas de Terceiros (NÃO paga): R$ ${(context.thirdPartyExpenses ?? 0).toFixed(2)}
- Nº de Transações: ${context.transactionCount}

## 💰 RECEITA QUE COBRIRÁ ESTAS DESPESAS (PRÓXIMO MÊS)
⚠️ ATENÇÃO: O salário CLT para pagar as despesas acima chega no PRÓXIMO MÊS. Verifique abaixo:
${context.nextMonth && context.nextMonth.income > 0 ? `✅ Receitas cadastradas para o próximo mês: R$ ${context.nextMonth.income.toFixed(2)}
- Despesas próprias previstas próximo mês: R$ ${context.nextMonth.expenses.toFixed(2)}
- 📊 SALDO REAL CLT = Receita próx. mês (R$ ${nextIncome.toFixed(2)}) - Despesas próprias atuais (R$ ${ownExp.toFixed(2)}) = R$ ${realBalanceCLT.toFixed(2)}
${realBalanceCLT >= 0 ? '✅ O usuário CONSEGUE cobrir suas despesas com a renda que virá.' : '⚠️ As despesas excedem a receita prevista.'}
${context.nextMonth.transactions?.length > 0 ? '\nDetalhes do próximo mês:\n' + context.nextMonth.transactions.slice(0, 10).map((t: any) => `- ${t.entryType}: ${t.description} R$ ${t.amount.toFixed(2)}${t.isThirdParty ? ' (TERCEIRO - não paga)' : ''}`).join('\n') : ''}` : '⚠️ NENHUMA receita cadastrada para o próximo mês. O usuário pode não ter registrado o salário ainda. Sugira que cadastre.'}

## DESPESAS DE TERCEIROS (o usuário NÃO paga estas)
${context.thirdPartyTransactions?.length > 0 ? context.thirdPartyTransactions.map((t: any) => `- ${t.description}: R$ ${t.amount.toFixed(2)} (pago por: ${t.thirdPartyName || 'terceiro'})`).join('\n') : 'Nenhuma despesa de terceiro'}

## GASTOS POR CATEGORIA
${context.categoryBreakdown.slice(0, 8).map((c: any) => `- ${c.category}: R$ ${c.amount.toFixed(2)} (${c.percentage.toFixed(1)}%)`).join('\n')}

## CONTAS BANCÁRIAS
${context.accounts.length > 0 ? context.accounts.map((a: any) => `- ${a.name}: R$ ${a.currentBalance.toFixed(2)}`).join('\n') : 'Nenhuma conta'}

## METAS FINANCEIRAS
${context.goals.length > 0 ? context.goals.map((g: any) => `- ${g.name}: R$ ${g.currentAmount.toFixed(2)}/${g.targetAmount.toFixed(2)} (${g.progress.toFixed(0)}%)`).join('\n') : 'Nenhuma meta'}

## ORÇAMENTOS
${context.budgets.length > 0 ? context.budgets.map((b: any) => `- ${b.name}: R$ ${b.spent.toFixed(2)}/${b.limit.toFixed(2)} [${b.status.toUpperCase()}]`).join('\n') : 'Nenhum orçamento'}

## RECORRÊNCIAS
${context.recurrences.length > 0 ? context.recurrences.slice(0, 8).map((r: any) => `- ${r.description}: R$ ${r.amount.toFixed(2)}`).join('\n') : 'Nenhuma recorrência'}

## ⚠️ RECORRÊNCIAS NÃO LANÇADAS NESTE MÊS
${context.missingRecurrences.length > 0 ? context.missingRecurrences.map((m: any) => `- ${m.description}: R$ ${m.amount.toFixed(2)} (${m.category}) — esperado dia ${m.expectedDay}${m.isPastDue ? ' 🚨 ATRASADO ' + m.daysOverdue + ' dias' : ''}`).join('\n') : 'Todas as recorrências foram lançadas ✅'}

## ALOCAÇÕES DE ORÇAMENTO (PLANEJAMENTO)
${context.allocations.length > 0 ? context.allocations.map((a: any) => `- ${a.name}: ${a.percentage}%${a.linkedCategories?.length > 0 ? ' → Categorias: ' + a.linkedCategories.join(', ') : ''}`).join('\n') : 'Sem perfil de alocação definido'}

---

Com base em TODOS esses dados, gere um relatório de auditoria estruturado com:

1. **📊 Diagnóstico Geral** (3-4 frases. OBRIGATÓRIO: compare despesas PRÓPRIAS contra receita do PRÓXIMO MÊS. Se o saldo real CLT é positivo, a situação é saudável. Exclua despesas de terceiros.)
2. **🚨 Alertas Críticos** (recorrências faltantes, orçamentos estourados, metas em risco. NÃO alerte sobre "falta de receita" se houver receita no próximo mês.)
3. **📉 Pontos de Atenção** (tendências preocupantes, categorias com gastos elevados)
4. **✅ Pontos Positivos** (o que está indo bem)
5. **💡 Recomendações Práticas** (5 sugestões concretas e acionáveis)
6. **🎯 Análise de Metas** (progresso e viabilidade de cada meta ativa)
7. **📅 Projeção Financeira CLT** (Receita próx. mês R$ ${nextIncome.toFixed(2)} vs Despesas próprias R$ ${ownExp.toFixed(2)} = Saldo R$ ${realBalanceCLT.toFixed(2)}. Analise a sustentabilidade.)
8. **📋 Sugestões de Cadastro** (lançamentos, categorias, contas ou metas que parecem estar faltando)`;

        return this.generateText(systemPrompt, userPrompt, 'financial_analysis');
    }

    /**
     * Chat interativo com contexto financeiro completo
     */
    public async generateFinancialChat(
        context: any,
        userMessage: string,
        history: { role: 'user' | 'assistant'; content: string }[]
    ): Promise<string> {
        const ownExpChat = (context.ownExpenses ?? context.totalExpenses);
        const nextIncomeChat = context.nextMonth?.income ?? 0;
        const realCLT = nextIncomeChat - ownExpChat;

        const systemPrompt = `Você é o assistente financeiro pessoal do FinChart, um consultor altamente especializado em finanças brasileiras.
Você tem acesso COMPLETO aos dados financeiros do usuário. Use-os para responder com precisão.
Seja direto, prático e acionável. Responda em português brasileiro.
Use dados reais (valores, datas, nomes) nas respostas quando relevante.

## 🔴 CICLO CLT — OBRIGATÓRIO:
O usuário é CLT. Trabalha mês X, recebe mês X+1. Se receita do período = R$0, é NORMAL.
SALDO REAL CLT = PróxMês Receita - Despesas Próprias atuais = R$${realCLT.toFixed(0)}
${realCLT >= 0 ? '✅ Saldo positivo — situação saudável.' : '⚠️ Despesas excedem receita prevista.'}
NÃO diga "sem receita" se PróxMês tem receita. Compare SEMPRE despesas próprias vs receita próx mês.

## CONTEXTO COMPACTO:
Período: ${new Date(context.period.start).toLocaleDateString('pt-BR')} a ${new Date(context.period.end).toLocaleDateString('pt-BR')}
Valores: Rec:R$${context.totalIncome.toFixed(0)}|Desp:R$${context.totalExpenses.toFixed(0)}|Saldo:R$${context.balance.toFixed(0)}
DespPróp:R$${ownExpChat.toFixed(0)}|DespTerc:R$${(context.thirdPartyExpenses ?? 0).toFixed(0)}
Poupança: ${context.savingsRate.toFixed(1)}%
GastosTop5: ${context.categoryBreakdown.slice(0, 5).map((c: any) => `${c.category}:R$${c.amount.toFixed(0)}`).join('|')}
Contas: ${context.accounts.map((a: any) => `${a.name}:R$${a.currentBalance.toFixed(0)}`).join('|') || 'Zero'}
Metas: ${context.goals.map((g: any) => `${g.name}:${g.progress.toFixed(0)}%`).join('|') || 'Nenhuma'}
Orçamentos: ${context.budgets.map((b: any) => `${b.name}:${b.percentage.toFixed(0)}%`).join('|') || 'Nenhum'}
Faltantes: ${context.missingRecurrences.length > 0 ? context.missingRecurrences.map((m: any) => `${m.description}:R$${m.amount.toFixed(0)}`).join(',') : 'Nenhuma'}
Alocações: ${context.allocations.map((a: any) => `${a.name}:${a.percentage}%`).join('|') || 'Zero'}
PróxMês: ${context.nextMonth ? `Rec:R$${context.nextMonth.income.toFixed(0)}|Desp:R$${context.nextMonth.expenses.toFixed(0)}|SaldoCLT:R$${realCLT.toFixed(0)}` : 'Sem dados'}
${context.thirdPartyTransactions?.length > 0 ? `Terceiros: ${context.thirdPartyTransactions.slice(0, 5).map((t: any) => `${t.description}:R$${t.amount.toFixed(0)}`).join('|')}` : ''}

REGRAS:
- Sempre cite valores e nomes reais dos dados do contexto
- Se não tiver informação suficiente, sugira ao usuário que cadastre os dados necessários
- Seja proativo em alertar sobre problemas ou oportunidades
- Formate com markdown e use emojis moderadamente
- Despesas de terceiro (DespTerc) NÃO são pagas pelo usuário. EXCLUA dos cálculos.
- SEMPRE compare despesas PRÓPRIAS vs receita do PRÓXIMO MÊS para avaliar saúde financeira.
- Se a receita do próximo mês cobre as despesas próprias, a situação é SAUDÁVEL.`;

        const provider = this.selectProvider('financial_analysis');
        const availability = this.getAvailability();

        // Montar mensagens com histórico
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
            { role: 'system', content: systemPrompt },
        ];

        // Adicionar histórico compacto (limitar a últimas 6 mensagens)
        const recentHistory = history.slice(-6);
        for (const msg of recentHistory) {
            // Truncar mensagens do assistente muito longas para economizar tokens
            let content = msg.content;
            if (msg.role === 'assistant' && content.length > 400) {
                content = content.substring(0, 400) + '... [truncado]';
            }
            messages.push({ role: msg.role, content });
        }

        // Mensagem atual
        messages.push({ role: 'user', content: userMessage });

        logger.info(`Chat financeiro via ${provider} (${messages.length} mensagens)`, 'AIRouter');

        if (provider === 'groq' && availability.groq) {
            return groqConfig.chat(messages, { maxTokens: 1024 });
        }

        // Fallback para Gemini (sem suporte nativo a roles, concat tudo)
        const fullPrompt = messages.map(m => {
            const prefix = m.role === 'system' ? '[Sistema]' : m.role === 'user' ? '[Usuário]' : '[Assistente]';
            return `${prefix}: ${m.content}`;
        }).join('\n\n');

        const model = aiConfig.getModel();
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        return response.text();
    }
}

// Exporta a instância singleton
export const aiRouter = AIRouterService.getInstance();
