import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  Container,
  useTheme,
  Typography,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
  alpha,
} from '@mui/material';
import { useParams, useSearchParams } from 'react-router-dom';
import type { Transaction, TransactionFilters, Account } from '../types';
import MetricsCards from '../components/MetricsCards';
import FiltersCard from '../components/FiltersCard';
import ChartsSection from '../components/ChartsSection';
import TransactionsTable from '../components/TransactionsTable';
import TransactionForm from '../components/TransactionForm';
import QuickEntryForm from '../components/QuickEntryForm';
import UnifiedImport from '../components/UnifiedImport';
import PageHeader from '../components/PageHeader';
import { InsightsPanel } from '../components/InsightsPanel';
import { DashboardSkeleton } from '../components/Skeletons';
import { showSuccess, showErrorWithRetry, showConfirm, showWarning, showToast } from '../utils/notifications';
import { Refresh } from '@mui/icons-material';
import {
  useTransactions,
  useTransactionStats,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useCreateManyTransactions,
  useUpdateInstallmentGroup,
  useDeleteManyTransactions,
  useRefreshTransactions,
} from '../hooks/api/useTransactions';
import { useCategories } from '../hooks/api/useCategories';
import { useAccounts } from '../hooks/api/useAccounts';
import { useDashboardPermissions } from '../hooks/api/useDashboardPermissions';
import { useDebouncedFilters } from '../hooks/useDebounce';

export default function DashboardFinancial() {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const [searchParams] = useSearchParams();
  const theme = useTheme();

  // Inicializar filtros com o mês atual
  const getInitialFilters = (): TransactionFilters => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  };

  const [filters, setFilters] = useState<TransactionFilters>(getInitialFilters);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());

  // Debounce filters for API calls (300ms delay)
  const [debouncedFilters, isFiltersPending] = useDebouncedFilters(filters, 300);

  // Custom Hooks - use debounced filters for API calls
  const { data: transactions = [], refetch, isLoading, isFetching, error } = useTransactions(debouncedFilters, dashboardId);
  const { data: stats, isFetching: statsFetching } = useTransactionStats(debouncedFilters, dashboardId);
  const { data: categories = [] } = useCategories(dashboardId || '');
  const { data: accounts = [] } = useAccounts(dashboardId || '');
  const { canEdit } = useDashboardPermissions();
  const { refresh: refreshAll } = useRefreshTransactions();

  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const deleteTransaction = useDeleteTransaction();
  const createManyTransactions = useCreateManyTransactions();
  const updateInstallmentGroup = useUpdateInstallmentGroup();
  const deleteManyTransactions = useDeleteManyTransactions();

  // Client-side filtering for instant search
  const filteredTransactions = useMemo(() => {
    if (!filters.search?.trim()) return transactions;

    const query = filters.search.toLowerCase().trim();
    return transactions.filter((t) =>
      t.description?.toLowerCase().includes(query) ||
      t.category?.toLowerCase().includes(query) ||
      t.notes?.toLowerCase().includes(query) ||
      t.institution?.toLowerCase().includes(query) ||
      t.thirdPartyName?.toLowerCase().includes(query)
    );
  }, [transactions, filters.search]);

  // Check if data is being updated
  const isUpdating = isFetching || statsFetching || isFiltersPending;

  // Handle prefill from query params (e.g. from AnalysisPage missing recurrences)
  useEffect(() => {
    if (searchParams.get('prefill') === 'true') {
      const prefillData: Partial<Transaction> = {};
      const description = searchParams.get('description');
      const amount = searchParams.get('amount');
      const category = searchParams.get('category');
      const entryType = searchParams.get('entryType');
      const flowType = searchParams.get('flowType');
      const subcategory = searchParams.get('subcategory');

      if (description) prefillData.description = description;
      if (amount) prefillData.amount = parseFloat(amount);
      if (category) prefillData.category = category;
      if (entryType) prefillData.entryType = entryType as any;
      if (flowType) prefillData.flowType = flowType as any;
      if (subcategory) prefillData.subcategory = subcategory;

      setSelectedTransaction(prefillData as Transaction);
      setShowTransactionForm(true);
    }
  }, [searchParams]);

  // Handle manual refresh
  const handleRefresh = useCallback(() => {
    refreshAll();
    showToast('Dados atualizados!', 'success');
  }, [refreshAll]);

  const handleNewTransaction = () => {
    setSelectedTransaction(null);
    setShowTransactionForm(true);
  };

  const handleEditTransaction = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setShowTransactionForm(true);
  };

  const handleDeleteTransaction = async (id: string) => {
    const result = await showConfirm(
      'Esta ação não poderá ser desfeita.',
      {
        title: 'Confirmar exclusão?',
        icon: 'warning',
        confirmButtonText: 'Sim, excluir',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: theme.palette.error.main,
        cancelButtonColor: theme.palette.grey[500],
      }
    );

    if (result.isConfirmed) {
      try {
        if (dashboardId) {
          await deleteTransaction.mutateAsync({ id, dashboardId });
        }
        showSuccess('Transação removida com sucesso.', { title: 'Excluído!' });
      } catch (error) {
        showErrorWithRetry(error, () => handleDeleteTransaction(id));
      }
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedTransactionIds.size === 0) return;

    const result = await showConfirm(
      `Deseja excluir ${selectedTransactionIds.size} transações selecionadas? Esta ação também excluirá parcelas relacionadas e itens das transações.`,
      {
        title: 'Confirmar exclusão em lote?',
        icon: 'warning',
        confirmButtonText: 'Sim, excluir todas',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: theme.palette.error.main,
        cancelButtonColor: theme.palette.grey[500],
      }
    );

    if (result.isConfirmed && dashboardId) {
      try {
        const idsArray = Array.from(selectedTransactionIds);
        await deleteManyTransactions.mutateAsync({
          ids: idsArray,
          dashboardId,
          includeInstallments: true,
        });
        setSelectedTransactionIds(new Set());
        showSuccess(`${selectedTransactionIds.size} transações excluídas com sucesso.`, { title: 'Excluído!' });
      } catch (error) {
        showErrorWithRetry(error, handleDeleteSelected);
      }
    }
  };

  const handleSaveTransaction = async (data: Partial<Transaction>, scope?: 'single' | 'remaining' | 'all') => {
    try {
      // Ensure dashboardId is included
      const transactionData = { ...data, dashboardId };

      if (selectedTransaction?.id) {
        // Check if this is an installment transaction with group and scope is not 'single'
        const groupId = selectedTransaction.installmentGroupId;
        if (groupId && scope && scope !== 'single' && dashboardId) {
          await updateInstallmentGroup.mutateAsync({
            groupId,
            data: transactionData,
            dashboardId,
            scope
          });
          const count = scope === 'all' ? selectedTransaction.installmentTotal : 'pendentes';
          showSuccess(`${count} parcelas atualizadas com sucesso.`, { title: 'Atualizado!' });
        } else {
          await updateTransaction.mutateAsync({ id: selectedTransaction.id, data: transactionData, dashboardId });
          showSuccess('Transação atualizada com sucesso.', { title: 'Atualizado!' });
        }
      } else {
        await createTransaction.mutateAsync(transactionData as any);
        showSuccess('Transação criada com sucesso.', { title: 'Criado!' });
      }
      setShowTransactionForm(false);
    } catch (error) {
      showErrorWithRetry(error, () => handleSaveTransaction(data, scope));
    }
  };

  const handleThirdPartyUpdate = async (id: string, data: { isThirdParty: boolean; thirdPartyName?: string; thirdPartyDescription?: string }) => {
    try {
      // Find the transaction to check if it belongs to an installment group
      const transaction = transactions.find(t => t.id === id);
      const groupId = transaction?.installmentGroupId;

      if (groupId && dashboardId) {
        // Propagate third-party status to ALL installments in the group
        await updateInstallmentGroup.mutateAsync({
          groupId,
          data: data as Partial<Transaction>,
          dashboardId,
          scope: 'all',
        });
        const count = transaction?.installmentTotal || 0;
        showSuccess(
          data.isThirdParty
            ? `Terceiro adicionado em ${count} parcelas.`
            : `Terceiro removido de ${count} parcelas.`,
          { title: 'Atualizado!' }
        );
      } else {
        await updateTransaction.mutateAsync({ id, data, dashboardId });
        showSuccess(data.isThirdParty ? 'Terceiro adicionado.' : 'Terceiro removido.', { title: 'Atualizado!' });
      }

      // If ownership filter is 'client' (Minhas), force re-fetch so the newly
      // marked third-party transaction disappears from the filtered view automatically
      if (filters.ownership === 'client' || filters.ownership === 'thirdParty') {
        refetch();
      }
    } catch (error) {
      showErrorWithRetry(error, () => handleThirdPartyUpdate(id, data));
    }
  };

  const handleImport = async (importedTransactions: Partial<Transaction>[]) => {
    try {
      const result = await createManyTransactions.mutateAsync(importedTransactions as any);
      showSuccess(`${result.count} transações importadas com sucesso.`, { title: 'Importado!', timer: 3000 });
    } catch (error) {
      showErrorWithRetry(error, () => handleImport(importedTransactions));
    }
  };

  const handleExport = useCallback((selectedIds?: string[]) => {
    // Require selection - if no transactions selected, show warning
    if (!selectedIds || selectedIds.length === 0) {
      showWarning('Selecione as transações que deseja exportar usando os checkboxes.', { title: 'Nenhuma seleção' });
      return;
    }

    const transactionsToExport = filteredTransactions.filter(t => selectedIds.includes(t.id));

    if (!transactionsToExport.length) {
      showWarning('Não há transações para exportar.', { title: 'Sem dados' });
      return;
    }

    const header = 'Data;Tipo;Fluxo;Categoria;Subcategoria;Descricao;Valor;MetodoPag;ParcelasTotal;ParcelaAtual;StatusParcela;Fonte;Observacao\n';
    const rows = transactionsToExport.map(t => {
      const date = new Date(t.date).toLocaleDateString('pt-BR');
      return [
        date,
        t.entryType,
        t.flowType,
        t.category,
        t.subcategory || '',
        t.description,
        t.amount.toString().replace('.', ','),
        t.paymentMethod || '',
        t.installmentTotal,
        t.installmentNumber,
        t.installmentStatus,
        t.institution || '',
        t.notes || '',
      ].join(';');
    }).join('\n');

    const csv = header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financas_${selectedIds.length}_selecionadas_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showSuccess(`${selectedIds.length} transações exportadas com sucesso.`, { title: 'Exportado!' });
  }, [filteredTransactions]);

  // Export using backend API - CSV
  const handleExportCSV = useCallback(async (selectedIds?: string[]) => {
    if (!dashboardId) return;

    // Require selection
    if (!selectedIds || selectedIds.length === 0) {
      showWarning('Selecione as transações que deseja exportar usando os checkboxes.', { title: 'Nenhuma seleção' });
      return;
    }

    try {
      const { transactionService } = await import('../services/api');
      await transactionService.exportCSV(dashboardId, filters, selectedIds);
      showSuccess(`${selectedIds.length} transações exportadas para CSV.`, { title: 'Exportado!' });
    } catch (error) {
      showErrorWithRetry(error, () => handleExportCSV(selectedIds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId, filters]);

  // Export using backend API - XLSX
  const handleExportXLSX = useCallback(async (selectedIds?: string[]) => {
    if (!dashboardId) return;

    // Require selection
    if (!selectedIds || selectedIds.length === 0) {
      showWarning('Selecione as transações que deseja exportar usando os checkboxes.', { title: 'Nenhuma seleção' });
      return;
    }

    try {
      const { transactionService } = await import('../services/api');
      await transactionService.exportXLSX(dashboardId, filters, selectedIds);
      showSuccess(`${selectedIds.length} transações exportadas para Excel.`, { title: 'Exportado!' });
    } catch (error) {
      showErrorWithRetry(error, () => handleExportXLSX(selectedIds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId, filters]);

  // Loading state
  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <PageHeader
          title="Visão Geral"
          breadcrumbs={[
            { label: 'Dashboards', to: '/dashboards' },
            { label: 'Financeiro' }
          ]}
        />
        <DashboardSkeleton />
      </Container>
    );
  }

  // Pending Approval State
  const errorMessage = (error as any)?.response?.data?.error || (error as any)?.message;
  // Check strict error message or if status is pending (needs backend to send specific code ideally, but string match works for now)
  if (errorMessage?.includes('pendente de aprovação')) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <PageHeader
          title="Visão Geral"
          breadcrumbs={[
            { label: 'Dashboards', to: '/dashboards' },
            { label: 'Financeiro' }
          ]}
        />
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 8,
            textAlign: 'center',
            gap: 2
          }}
        >
          <Box sx={{ p: 3, borderRadius: '50%', bgcolor: 'warning.light', mb: 2, display: 'inline-flex' }}>
            <Box component="span" sx={{ fontSize: 60, lineHeight: 1 }}>⏳</Box>
          </Box>

          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Aguardando Aprovação
          </Typography>
          <Typography variant="body1" color="text.secondary" maxWidth="sm">
            Sua solicitação para acessar este dashboard foi enviada e está aguardando aprovação do proprietário.
            Você receberá uma notificação assim que o acesso for liberado.
          </Typography>
          <Button
            variant="outlined"
            onClick={() => window.location.href = '/dashboards'}
            sx={{ mt: 2 }}
          >
            Voltar para Meus Dashboards
          </Button>
        </Box>
      </Container>
    );
  }

  // Always show full UI - no early return for empty state
  // The individual components (charts, table) will handle their own empty states
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Update indicator */}
      {isUpdating && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            zIndex: 9999,
          }}
        >
          <Box
            sx={{
              height: '100%',
              bgcolor: 'primary.main',
              animation: 'loading 1s ease-in-out infinite',
              '@keyframes loading': {
                '0%': { width: '0%', marginLeft: '0%' },
                '50%': { width: '50%', marginLeft: '25%' },
                '100%': { width: '0%', marginLeft: '100%' },
              },
            }}
          />
        </Box>
      )}

      <PageHeader
        title="Visão Geral"
        breadcrumbs={[
          { label: 'Dashboards', to: '/dashboards' },
          { label: 'Financeiro' }
        ]}
        actionLabel={canEdit ? "Nova Transação" : undefined}
        onAction={canEdit ? handleNewTransaction : undefined}
        extra={
          <Tooltip title="Atualizar dados" arrow>
            <IconButton
              onClick={handleRefresh}
              disabled={isUpdating}
              sx={{
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.2),
                },
              }}
            >
              {isUpdating ? (
                <CircularProgress size={20} color="primary" />
              ) : (
                <Refresh />
              )}
            </IconButton>
          </Tooltip>
        }
      />

      {/* Import e Entrada Rápida */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3, mb: 4 }}>
        <UnifiedImport onImportCSV={handleImport} />
        <QuickEntryForm onSave={handleSaveTransaction} onRefetch={refetch} />
      </Box>

      {/* Métricas */}
      <MetricsCards stats={stats} transactions={transactions} isLoading={isLoading} />

      {/* Filtros */}
      <Box id="filters-section" sx={{ mb: 4, scrollMarginTop: 80 }}>
        <FiltersCard
          filters={filters}
          onFiltersChange={setFilters}
          transactions={transactions}
          categories={categories}
          accounts={accounts as Account[]}
        />
      </Box>

      {/* Insights e Gráficos */}
      {dashboardId && (
        <Box sx={{ mb: 4 }}>
          <InsightsPanel dashboardId={dashboardId} />
        </Box>
      )}

      <ChartsSection transactions={transactions} />

      {/* Tabela */}
      <TransactionsTable
        transactions={filteredTransactions}
        isLoading={isLoading}
        accounts={accounts as Account[]}
        onEdit={handleEditTransaction}
        onDelete={handleDeleteTransaction}
        onNew={handleNewTransaction}
        onExport={handleExport}
        onExportCSV={handleExportCSV}
        onExportXLSX={handleExportXLSX}
        canEdit={canEdit}
        onThirdPartyUpdate={handleThirdPartyUpdate}
        selectedIds={selectedTransactionIds}
        onSelectionChange={setSelectedTransactionIds}
        onDeleteSelected={handleDeleteSelected}
        searchQuery={filters.search}
        onSearchChange={(query) => setFilters((prev) => ({ ...prev, search: query }))}
      />

      {/* Modais */}
      <TransactionForm
        open={showTransactionForm}
        transaction={selectedTransaction}
        onClose={() => {
          setShowTransactionForm(false);
          setSelectedTransaction(null);
        }}
        onSave={handleSaveTransaction}
      />
    </Container>
  );
}
