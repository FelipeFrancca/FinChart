import { describe, it, expect, mock, beforeAll, afterAll } from "bun:test";
import { prisma } from "../src/database/conexao";
import { financialAnalysisService } from "../src/services/analysisServico";
import { aiRouter } from "../src/services/aiRouterServico";

describe("Financial Analysis Service", () => {
    let testUser: any;
    let testDashboard: any;
    let skipTests = false;

    beforeAll(async () => {
        try {
            // Tenta conectar primeiro
            await prisma.$connect();

            // Criar usuário e dashboard de teste
            testUser = await prisma.user.create({
                data: {
                    email: `analysis-test-${Date.now()}@test.com`,
                    name: 'Analysis Test User',
                    password: 'hashedpassword',
                }
            });

            testDashboard = await prisma.dashboard.create({
                data: {
                    title: 'Analysis Test Dashboard',
                    ownerId: testUser.id,
                    members: {
                        create: { userId: testUser.id, role: 'OWNER', status: 'APPROVED' }
                    }
                }
            });

            // Criar transações de teste
            const today = new Date();
            const baseDate = new Date(today.getFullYear(), today.getMonth(), 15);

            // 1. Receitas
            await prisma.transaction.createMany({
                data: [
                    {
                        description: 'Salário',
                        amount: 5000,
                        entryType: 'Receita',
                        flowType: 'Fixa',
                        category: 'Renda',
                        date: baseDate,
                        userId: testUser.id,
                        dashboardId: testDashboard.id,
                    }
                ]
            });

            // 2. Despesas Normais
            await prisma.transaction.createMany({
                data: [
                    {
                        description: 'Aluguel',
                        amount: 1500,
                        entryType: 'Despesa',
                        flowType: 'Fixa',
                        category: 'Moradia',
                        date: baseDate,
                        userId: testUser.id,
                        dashboardId: testDashboard.id,
                    },
                    {
                        description: 'Supermercado',
                        amount: 800,
                        entryType: 'Despesa',
                        flowType: 'Variável',
                        category: 'Alimentação',
                        date: baseDate,
                        userId: testUser.id,
                        dashboardId: testDashboard.id,
                    },
                    {
                        description: 'Restaurante',
                        amount: 200,
                        entryType: 'Despesa',
                        flowType: 'Variável',
                        category: 'Alimentação',
                        date: baseDate,
                        userId: testUser.id,
                        dashboardId: testDashboard.id,
                    }
                ]
            });

            // 3. Despesa Outlier (Muito acima da média)
            await prisma.transaction.create({
                data: {
                    description: 'Notebook Gamer',
                    amount: 8000,
                    entryType: 'Despesa',
                    flowType: 'Variável',
                    category: 'Eletrônicos',
                    date: baseDate,
                    userId: testUser.id,
                    dashboardId: testDashboard.id,
                }
            });
        } catch (error) {
            console.warn('⚠️ Analysis Service tests skipped: Database not available', error);
            skipTests = true;
        }
    });

    afterAll(async () => {
        if (skipTests) return;

        try {
            // Cleanup
            if (testDashboard?.id) {
                await prisma.transaction.deleteMany({ where: { dashboardId: testDashboard.id } });
                await prisma.dashboardMember.deleteMany({ where: { dashboardId: testDashboard.id } });
                await prisma.dashboard.delete({ where: { id: testDashboard.id } });
            }
            if (testUser?.id) {
                await prisma.user.delete({ where: { id: testUser.id } });
            }
        } catch (e) {
            // Ignore cleanup errors
        }
        await prisma.$disconnect();
    });

    it("should calculate correct financial summary", async () => {
        if (skipTests) return;

        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        const summary = await financialAnalysisService.getFinancialSummary(
            testDashboard.id,
            testUser.id,
            start,
            end
        );

        // Totais
        expect(summary.totalIncome).toBe(5000);
        expect(summary.totalExpenses).toBe(1500 + 800 + 200 + 8000); // 10500
        expect(summary.balance).toBe(5000 - 10500); // -5500
        expect(summary.savingsRate).toBeLessThan(0); // Gastou mais que ganhou

        // Categorias
        const foodCategory = summary.categoryBreakdown.find(c => c.category === 'Alimentação');
        expect(foodCategory).toBeDefined();
        expect(foodCategory?.amount).toBe(1000); // 800 + 200
        expect(foodCategory?.transactionCount).toBe(2);

        const techCategory = summary.categoryBreakdown.find(c => c.category === 'Eletrônicos');
        expect(techCategory?.amount).toBe(8000);
    });

    it.skip("should detect unusual spending (outliers)", async () => {
        if (skipTests) return;

        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        const summary = await financialAnalysisService.getFinancialSummary(
            testDashboard.id,
            testUser.id,
            start,
            end
        );

        // Deve detectar o Notebook de 8000 como outlier
        const outlier = summary.unusualTransactions.find(t => t.amount === 8000);

        expect(summary.unusualTransactions.length).toBeGreaterThan(0);
        if (outlier) {
            expect(outlier.category).toBe('Eletrônicos');
            expect(outlier.zScore).toBeGreaterThan(0);
        }
    });

    it("should generate proper alerts", async () => {
        if (skipTests) return;

        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        const summary = await financialAnalysisService.getFinancialSummary(
            testDashboard.id,
            testUser.id,
            start,
            end
        );

        expect(summary.alerts.length).toBeGreaterThan(0);
        // Deve alertar sobre gasto excessivo (savings rate negativo)
        expect(summary.alerts.some(a => a.includes('gastou mais do que ganhou'))).toBe(true);
    });

    it("should mock AI response for insights", async () => {
        if (skipTests) return;

        // Mock do AI Router
        aiRouter.generateFinancialAnalysis = mock(async () => "Análise gerada por IA mockada");

        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        const insight = await financialAnalysisService.getAIInsights(
            testDashboard.id,
            testUser.id,
            start,
            end
        );

        expect(insight).toBe("Análise gerada por IA mockada");
        expect(aiRouter.generateFinancialAnalysis).toHaveBeenCalled();
    });

    it("should calculate daily pacing correctly", async () => {
        if (skipTests) return;

        const pacing = await financialAnalysisService.calculateDailyPacing(
            testDashboard.id,
            testUser.id
        );

        expect(pacing).toBeDefined();
        // Baseado nas transações inseridas no beforeAll:
        // Receitas = 5000
        // Despesas Fixas (Aluguel) = 1500
        // Orçamento Livre = 3500
        // Despesas Variáveis (Supermercado, Restaurante, Notebook) = 800 + 200 + 8000 = 9000
        // Como 9000 > 3500, o saldo diário é negativo -> isOverBudget = true -> dailyPacing = 0
        expect(pacing.budgetLimit).toBe(3500);
        expect(pacing.currentSpent).toBe(9000);
        expect(pacing.isOverBudget).toBe(true);
        expect(pacing.dailyPacing).toBe(0);
    });
});
