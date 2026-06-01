import { prisma } from '../database/conexao';
import type { Transaction, Prisma } from "@prisma/client";
import { ValidationError } from '../utils/AppError';

/**
 * Sanitiza string removendo tags HTML e limitando tamanho
 * Previne XSS e inputs maliciosos
 */
function sanitizeString(input: string | null | undefined, maxLength: number = 500): string {
  if (!input) return '';
  // Remove tags HTML básicas
  const cleaned = input
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
  return cleaned.substring(0, maxLength);
}

export type TransactionFilters = {
  startDate?: string;
  endDate?: string;
  dateFilterField?: 'date' | 'dueDate'; // Filtrar por data da transação ou data de vencimento
  entryType?: string;
  flowType?: string;
  category?: string;
  institution?: string;
  installmentStatus?: string;
  search?: string;
  minAmount?: string;
  ownership?: 'all' | 'client' | 'thirdParty';
  onlyInstallments?: boolean | string; // Novo filtro
};

export type TransactionCreateInput = Omit<Transaction, "id" | "createdAt" | "updatedAt">;
export type TransactionUpdateInput = Partial<TransactionCreateInput>;

export async function getAllTransactions(filters: TransactionFilters = {}, dashboardId: string, userId: string): Promise<Transaction[]> {
  const { checkPermission } = await import('./paineisServico');
  await checkPermission(userId, dashboardId);

  const where: any = { dashboardId, deletedAt: null };

  // Determinar qual campo de data usar para filtro (padrão: date)
  const dateField = filters.dateFilterField || 'date';

  if (filters.startDate || filters.endDate) {
    if (dateField === 'dueDate') {
      // Filtro inteligente por data de vencimento:
      // - Despesas com dueDate: filtrar pela dueDate (vencimento da fatura)
      // - Receitas: filtrar pela date (data de recebimento), pois receitas
      //   geralmente não têm dueDate (ex: salário CLT recebido no mês seguinte)
      // - Despesas sem dueDate (à vista): filtrar pela date
      const dateRange: any = {};
      if (filters.startDate) dateRange.gte = new Date(filters.startDate);
      if (filters.endDate) dateRange.lte = new Date(filters.endDate);

      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            // Despesas com dueDate no período selecionado
            { dueDate: dateRange, entryType: 'Despesa' },
            // Receitas com date (recebimento) no período
            { date: dateRange, entryType: 'Receita' },
            // Despesas sem dueDate (à vista) com date no período
            { dueDate: null, date: dateRange, entryType: 'Despesa' },
          ],
        },
      ];
    } else {
      where[dateField] = {};
      if (filters.startDate) {
        where[dateField].gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where[dateField].lte = new Date(filters.endDate);
      }
    }
  }
  if (filters.entryType) {
    where.entryType = filters.entryType;
  }
  if (filters.flowType) {
    where.flowType = filters.flowType;
  }
  if (filters.category) {
    where.category = filters.category;
  }
  if (filters.institution) {
    where.institution = { contains: filters.institution, mode: "insensitive" };
  }
  if (filters.installmentStatus) {
    where.installmentStatus = filters.installmentStatus;
  }
  if (filters.minAmount) {
    where.amount = { gte: parseFloat(filters.minAmount) };
  }
  if ((filters as any).accountId) {
    // Validar se a conta pertence ao dashboard para evitar vazamento de dados
    const account = await prisma.account.findFirst({
      where: {
        id: (filters as any).accountId,
        dashboardId,
        deletedAt: null
      }
    });
    if (account) {
      where.accountId = (filters as any).accountId;
    }
    // Se a conta não pertence ao dashboard, simplesmente não aplica o filtro
  }

  // Installments filter
  const onlyInstallments = filters.onlyInstallments === 'true' || filters.onlyInstallments === true;
  if (onlyInstallments) {
    where.installmentTotal = { gt: 1 };
  }

  // Ownership filter
  if (filters.ownership === 'client') {
    where.isThirdParty = false;
  } else if (filters.ownership === 'thirdParty') {
    where.isThirdParty = true;
  }

  if (filters.search) {
    // Remove espaços extras e normaliza a busca
    const searchText = filters.search.trim();

    // Busca em múltiplos campos ignorando case (usa AND para não conflitar com OR de dueDate)
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { description: { contains: searchText, mode: "insensitive" } },
          { category: { contains: searchText, mode: "insensitive" } },
          { subcategory: { contains: searchText, mode: "insensitive" } },
          { notes: { contains: searchText, mode: "insensitive" } },
          { thirdPartyName: { contains: searchText, mode: "insensitive" } },
          { institution: { contains: searchText, mode: "insensitive" } },
        ],
      },
    ];
  }

  return prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
    include: { items: true },
  });
}

export async function getTransactionById(id: string, dashboardId: string, userId: string): Promise<Transaction | null> {
  const { checkPermission } = await import('./paineisServico');
  await checkPermission(userId, dashboardId);

  return prisma.transaction.findFirst({
    where: { id, dashboardId, deletedAt: null },
    include: { items: true },
  });
}

export async function createTransaction(data: any, dashboardId: string, userId: string): Promise<Transaction> {
  const { checkPermission } = await import('./paineisServico');
  await checkPermission(userId, dashboardId, ['OWNER', 'EDITOR']);

  // Validação de campos obrigatórios
  if (!data.description || typeof data.description !== 'string') {
    throw new ValidationError('Descrição é obrigatória');
  }
  if (typeof data.amount !== 'number' || isNaN(data.amount)) {
    throw new ValidationError('Valor da transação é inválido');
  }
  if (!data.date) {
    throw new ValidationError('Data da transação é obrigatória');
  }
  if (!data.entryType || !['Receita', 'Despesa'].includes(data.entryType)) {
    throw new ValidationError('Tipo de entrada deve ser "Receita" ou "Despesa"');
  }

  // Extract items from data if present
  const { items, ...transactionData } = data;

  // Sanitizar campos de texto
  const sanitizedData = {
    ...transactionData,
    description: sanitizeString(transactionData.description, 500),
    notes: transactionData.notes ? sanitizeString(transactionData.notes, 1000) : undefined,
    thirdPartyName: transactionData.thirdPartyName ? sanitizeString(transactionData.thirdPartyName, 200) : undefined,
    thirdPartyDescription: transactionData.thirdPartyDescription ? sanitizeString(transactionData.thirdPartyDescription, 500) : undefined,
  };

  return prisma.transaction.create({
    data: {
      ...sanitizedData,
      date: new Date(sanitizedData.date),
      dashboardId,
      userId,
      // Create items if provided
      ...(items && items.length > 0 && {
        items: {
          create: items.map((item: any) => ({
            description: sanitizeString(item.description, 200),
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        },
      }),
    },
    include: { items: true },
  });
}

export async function createManyTransactions(dataArray: any[], dashboardId: string, userId: string): Promise<Transaction[]> {
  const { checkPermission } = await import('./paineisServico');
  await checkPermission(userId, dashboardId, ['OWNER', 'EDITOR']);

  const transactions = await Promise.all(
    dataArray.map((data) => {
      const { items, ...transactionData } = data;
      return prisma.transaction.create({
        data: {
          ...transactionData,
          date: new Date(transactionData.date),
          dashboardId,
          userId,
          // Create items if provided
          ...(items && items.length > 0 && {
            items: {
              create: items.map((item: any) => ({
                description: item.description,
                quantity: item.quantity || 1,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
              })),
            },
          }),
        },
        include: { items: true },
      });
    })
  );
  return transactions;
}

export async function updateTransaction(id: string, data: any, dashboardId: string, userId: string): Promise<Transaction | null> {
  const { checkPermission } = await import('./paineisServico');
  await checkPermission(userId, dashboardId, ['OWNER', 'EDITOR']);

  try {
    // Extract items and non-updatable fields from data
    const {
      items,
      dashboardId: _dashboardId, // Remove dashboardId from update data
      userId: _userId,           // Remove userId from update data
      id: _id,                   // Remove id from update data
      createdAt: _createdAt,     // Remove createdAt from update data
      updatedAt: _updatedAt,     // Remove updatedAt from update data
      ...updateData
    } = data;

    // Convert date string to Date object if provided
    if (updateData.date) {
      updateData.date = new Date(updateData.date);
    }

    // Update transaction and handle items in a transaction
    return await prisma.$transaction(async (tx) => {
      // Update the transaction itself
      const updateResult = await tx.transaction.updateMany({
        where: { id, dashboardId, deletedAt: null },
        data: updateData,
      });

      console.log(`[TransactionService] Updated ${updateResult.count} transaction(s) with id: ${id}`);

      // If items are provided, replace all existing items
      if (items !== undefined) {
        // Delete existing items
        await tx.transactionItem.deleteMany({
          where: { transactionId: id },
        });

        // Create new items if any
        if (items && items.length > 0) {
          await tx.transactionItem.createMany({
            data: items.map((item: any) => ({
              transactionId: id,
              description: item.description,
              quantity: item.quantity || 1,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
          });
        }
      }

      return await tx.transaction.findFirst({
        where: { id, dashboardId },
        include: { items: true },
      });
    });
  } catch (error: any) {
    console.error('[TransactionService] Error updating transaction:', error);
    throw new Error(`Erro ao atualizar transação no banco: ${error?.message || 'Erro desconhecido'}`);
  }
}

export async function deleteTransaction(id: string, dashboardId: string, userId: string): Promise<void> {
  const { checkPermission } = await import('./paineisServico');
  await checkPermission(userId, dashboardId, ['OWNER', 'EDITOR']);

  await prisma.transaction.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function getStatsSummary(filters: TransactionFilters = {}, dashboardId: string, userId: string) {
  const transactions = await getAllTransactions(filters, dashboardId, userId);

  const totalIncome = transactions
    .filter((t) => t.entryType === "Receita")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalExpense = transactions
    .filter((t) => t.entryType === "Despesa")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const netResult = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;

  return {
    totalIncome,
    totalExpense,
    netResult,
    savingsRate: Math.round(savingsRate * 100) / 100,
    transactionCount: transactions.length,
  };
}

/**
 * Busca todas as transações de um grupo de parcelamento
 */
export async function getInstallmentGroup(groupId: string, dashboardId: string, userId: string): Promise<Transaction[]> {
  const { checkPermission } = await import('./paineisServico');
  await checkPermission(userId, dashboardId);

  return prisma.transaction.findMany({
    where: {
      installmentGroupId: groupId,
      dashboardId,
      deletedAt: null
    },
    orderBy: { installmentNumber: 'asc' },
    include: { items: true },
  });
}

/**
 * Atualiza todas as transações de um grupo de parcelamento
 * @param groupId ID do grupo de parcelas
 * @param data Dados a serem atualizados em todas as parcelas
 * @param scope 'all' = todas, 'remaining' = apenas parcelas pendentes, 'single' = não propaga
 */
export async function updateInstallmentGroup(
  groupId: string,
  data: any,
  dashboardId: string,
  userId: string,
  scope: 'all' | 'remaining' | 'single' = 'all'
): Promise<{ count: number; transactions: Transaction[] }> {
  const { checkPermission } = await import('./paineisServico');
  await checkPermission(userId, dashboardId, ['OWNER', 'EDITOR']);

  // Build where clause based on scope
  const where: any = {
    installmentGroupId: groupId,
    dashboardId,
    deletedAt: null
  };

  if (scope === 'remaining') {
    where.installmentStatus = 'Pendente';
  }

  // Extract items and installment-specific fields that shouldn't be synced
  const { items, date, installmentNumber, installmentStatus, dashboardId: _dashboardId, userId: _userId, id: _id, ...syncData } = data;

  // Fields that should be synced across all installments
  const updateData: any = {};

  // Sync these fields if provided
  if (syncData.description !== undefined) updateData.description = syncData.description;
  if (syncData.amount !== undefined) updateData.amount = syncData.amount;
  if (syncData.entryType !== undefined) updateData.entryType = syncData.entryType;
  if (syncData.flowType !== undefined) updateData.flowType = syncData.flowType;
  if (syncData.category !== undefined) updateData.category = syncData.category;
  if (syncData.subcategory !== undefined) updateData.subcategory = syncData.subcategory;
  if (syncData.paymentMethod !== undefined) updateData.paymentMethod = syncData.paymentMethod;
  if (syncData.institution !== undefined) updateData.institution = syncData.institution;
  if (syncData.cardBrand !== undefined) updateData.cardBrand = syncData.cardBrand;
  if (syncData.notes !== undefined) updateData.notes = syncData.notes;
  if (syncData.isThirdParty !== undefined) updateData.isThirdParty = syncData.isThirdParty;
  if (syncData.thirdPartyName !== undefined) updateData.thirdPartyName = syncData.thirdPartyName;
  if (syncData.thirdPartyDescription !== undefined) updateData.thirdPartyDescription = syncData.thirdPartyDescription;
  if (syncData.installmentTotal !== undefined) updateData.installmentTotal = syncData.installmentTotal;
  if (syncData.accountId !== undefined) updateData.accountId = syncData.accountId;

  console.log(`[TransactionService] Updating installment group ${groupId} with scope ${scope}:`, updateData);

  // Update all matching transactions
  const result = await prisma.transaction.updateMany({
    where,
    data: updateData,
  });

  console.log(`[TransactionService] Updated ${result.count} installment(s) in group ${groupId}`);

  // Fetch updated transactions
  const transactions = await prisma.transaction.findMany({
    where: { installmentGroupId: groupId, dashboardId, deletedAt: null },
    orderBy: { installmentNumber: 'asc' },
    include: { items: true },
  });

  return { count: result.count, transactions };
}

/**
 * Deleta múltiplas transações em lote, incluindo parcelas relacionadas e itens
 * @param ids Array de IDs de transações a serem deletadas
 * @param dashboardId ID do dashboard
 * @param userId ID do usuário
 * @param includeInstallments Se true, deleta também outras parcelas do mesmo grupo
 */
export async function deleteManyTransactions(
  ids: string[],
  dashboardId: string,
  userId: string,
  includeInstallments: boolean = true
): Promise<{ count: number }> {
  const { checkPermission } = await import('./paineisServico');
  await checkPermission(userId, dashboardId, ['OWNER', 'EDITOR']);

  // Buscar todas as transações para pegar os installmentGroupIds
  const transactions = await prisma.transaction.findMany({
    where: {
      id: { in: ids },
      dashboardId,
      deletedAt: null,
    },
    select: {
      id: true,
      installmentGroupId: true,
    },
  });

  // Coletar todos os IDs a serem deletados
  let allIdsToDelete = new Set(ids);

  if (includeInstallments) {
    // Buscar IDs de grupos de parcelas únicos
    const groupIds = transactions
      .filter((t) => t.installmentGroupId)
      .map((t) => t.installmentGroupId as string);

    const uniqueGroupIds = [...new Set(groupIds)];

    if (uniqueGroupIds.length > 0) {
      // Buscar todas as parcelas dos grupos
      const installmentTransactions = await prisma.transaction.findMany({
        where: {
          installmentGroupId: { in: uniqueGroupIds },
          dashboardId,
          deletedAt: null,
        },
        select: { id: true },
      });

      installmentTransactions.forEach((t) => allIdsToDelete.add(t.id));
    }
  }

  const idsArray = Array.from(allIdsToDelete);

  // Usar transaction do Prisma para garantir atomicidade
  const result = await prisma.$transaction(async (tx) => {
    // Primeiro deletar os items das transações
    await tx.transactionItem.deleteMany({
      where: {
        transactionId: { in: idsArray },
      },
    });

    // Fazer soft delete das transações
    const updateResult = await tx.transaction.updateMany({
      where: {
        id: { in: idsArray },
        dashboardId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return updateResult;
  });

  return { count: result.count };
}

export { prisma };

