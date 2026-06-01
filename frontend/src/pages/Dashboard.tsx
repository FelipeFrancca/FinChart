import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Chip,
  useTheme,
  useMediaQuery,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
} from '@mui/material';
import Brightness4 from '@mui/icons-material/Brightness4';
import Brightness7 from '@mui/icons-material/Brightness7';
import KeyboardAlt from '@mui/icons-material/KeyboardAlt';
import Logout from '@mui/icons-material/Logout';
import DashboardIcon from '@mui/icons-material/Dashboard';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { transactionService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { Transaction, TransactionFilters } from '../types';
import MetricsCards from '../components/MetricsCards';
import FiltersCard from '../components/FiltersCard';
import ChartsSection from '../components/ChartsSection';
import TransactionsTable from '../components/TransactionsTable';
import TransactionForm from '../components/TransactionForm';
import QuickEntryForm from '../components/QuickEntryForm';
import FileUpload from '../components/FileUpload';
import ShortcutsModal from '../components/ShortcutsModal';
import { Logo } from '../components/Logo';
import { showSuccess, showErrorWithRetry, showConfirm, showWarning } from '../utils/notifications';

interface DashboardProps {
  mode: 'light' | 'dark';
  onToggleTheme: () => void;
}

export default function Dashboard({ mode, onToggleTheme }: DashboardProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [filters, setFilters] = useState<TransactionFilters>({});
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Query para buscar transações
  const { data: transactions = [], refetch, isLoading } = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => transactionService.getAll(filters),
  });

  // Query para estatísticas
  const { data: stats } = useQuery({
    queryKey: ['stats', filters],
    queryFn: () => transactionService.getStats(filters),
  });

  // Atualizar timestamp
  useEffect(() => {
    setLastUpdate(new Date());
  }, [transactions]);

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar se estiver em campo de input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'g':
          e.preventDefault();
          document.getElementById('filters-section')?.scrollIntoView({ behavior: 'smooth' });
          break;
        case 'n':
          e.preventDefault();
          handleNewTransaction();
          break;
        case 'e':
          e.preventDefault();
          handleExport();
          break;
        case 't':
          e.preventDefault();
          onToggleTheme();
          break;
        case '?':
          e.preventDefault();
          setShowShortcuts(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleTheme]);

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
        const transaction = transactions.find((t: Transaction) => t.id === id);
        if (transaction) {
          await transactionService.delete(id, transaction.dashboardId);
          refetch();
          showSuccess('Transação removida com sucesso.', { title: 'Excluído!', timer: 2000 });
        }
      } catch (error) {
        showErrorWithRetry(error, () => handleDeleteTransaction(id));
      }
    }
  };

  const handleSaveTransaction = async (data: Partial<Transaction>, scope?: 'single' | 'remaining' | 'all') => {
    try {
      if (selectedTransaction) {
        // Check if this is an installment transaction with group and scope is not 'single'
        const groupId = selectedTransaction.installmentGroupId;
        const txDashboardId = selectedTransaction.dashboardId;
        if (groupId && scope && scope !== 'single' && txDashboardId) {
          const result = await transactionService.updateInstallmentGroup(groupId, data, txDashboardId, scope);
          showSuccess(`${result.count} parcelas atualizadas com sucesso.`, { title: 'Atualizado!', timer: 2000 });
        } else {
          await transactionService.update(selectedTransaction.id, data);
          showSuccess('Transação atualizada com sucesso.', { title: 'Atualizado!', timer: 2000 });
        }
      } else {
        await transactionService.create(data as any);
        showSuccess('Transação criada com sucesso.', { title: 'Criado!', timer: 2000 });
      }
      refetch();
      setShowTransactionForm(false);
    } catch (error) {
      showErrorWithRetry(error, () => handleSaveTransaction(data, scope));
    }
  };

  const handleThirdPartyUpdate = async (id: string, data: { isThirdParty: boolean; thirdPartyName?: string; thirdPartyDescription?: string }) => {
    try {
      // Get the transaction to check if it belongs to an installment group
      const transaction = transactions.find((t: Transaction) => t.id === id);
      if (!transaction) {
        throw new Error('Transação não encontrada');
      }

      const groupId = transaction.installmentGroupId;
      if (groupId) {
        // Propagate third-party status to ALL installments in the group
        const result = await transactionService.updateInstallmentGroup(
          groupId,
          { ...data, dashboardId: transaction.dashboardId },
          transaction.dashboardId,
          'all'
        );
        refetch();
        showSuccess(
          data.isThirdParty
            ? `Terceiro adicionado em ${result.count} parcelas.`
            : `Terceiro removido de ${result.count} parcelas.`,
          { title: 'Atualizado!' }
        );
      } else {
        await transactionService.update(id, { ...data, dashboardId: transaction.dashboardId });
        refetch();
        showSuccess(data.isThirdParty ? 'Terceiro adicionado.' : 'Terceiro removido.', { title: 'Atualizado!' });
      }
    } catch (error) {
      showErrorWithRetry(error, () => handleThirdPartyUpdate(id, data));
    }
  };

  const handleImport = async (importedTransactions: Partial<Transaction>[]) => {
    try {
      const result = await transactionService.createMany(importedTransactions as any);
      refetch();
      showSuccess(`${result.count} transações importadas com sucesso.`, { title: 'Importado!', timer: 3000 });
    } catch (error) {
      showErrorWithRetry(error, () => handleImport(importedTransactions));
    }
  };

  const handleExport = useCallback(() => {
    if (!transactions.length) {
      showWarning('Não há transações para exportar.', { title: 'Sem dados' });
      return;
    }

    const header = 'Data;Tipo;Fluxo;Categoria;Subcategoria;Descricao;Valor;MetodoPag;ParcelasTotal;ParcelaAtual;StatusParcela;Fonte;Observacao\n';
    const rows = transactions.map((t: any) => {
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
    link.download = `financas_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showSuccess('Arquivo CSV baixado com sucesso.', { title: 'Exportado!', timer: 2000 });
  }, [transactions]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* AppBar */}
      <AppBar position="sticky" elevation={0} sx={{
        background: mode === 'dark'
          ? 'linear-gradient(120deg, #2d1b69 0%, #5b21b6 45%, #7c3aed 100%)'
          : 'linear-gradient(120deg, #7c3aed 0%, #9333ea 50%, #a855f7 100%)',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}>
        <Toolbar>
          <Logo
            variant="full"
            width={{ xs: 120, sm: 150 }}
            sx={{ flexGrow: 1 }}
          />

          {!isMobile && (
            <Box sx={{ display: 'flex', gap: 1, mr: 2 }}>
              <Chip label="Filtros (G)" size="small" sx={{ opacity: 0.8 }} />
              <Chip label="Novo (N)" size="small" sx={{ opacity: 0.8 }} />
              <Chip label="Exportar (E)" size="small" sx={{ opacity: 0.8 }} />
            </Box>
          )}

          <Chip
            label={`Atualizado ${lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
            size="small"
            sx={{ mr: 1 }}
          />

          <IconButton color="inherit" onClick={() => setShowShortcuts(true)}>
            <KeyboardAlt />
          </IconButton>

          <IconButton color="inherit" onClick={onToggleTheme}>
            {mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
          </IconButton>

          <IconButton
            color="inherit"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{ ml: 1 }}
          >
            <Avatar
              src={user?.avatar}
              alt={user?.name || user?.email}
              sx={{ width: 32, height: 32 }}
            >
              {!user?.avatar && (user?.name?.[0] || user?.email?.[0] || '?').toUpperCase()}
            </Avatar>
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <Box sx={{ px: 2, py: 1, minWidth: 200 }}>
              <Typography variant="subtitle2" fontWeight="bold">
                {user?.name || 'Usuário'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {user?.email}
              </Typography>
            </Box>
            <Divider />
            <MenuItem
              onClick={() => {
                setAnchorEl(null);
                navigate('/dashboards');
              }}
            >
              <ListItemIcon>
                <DashboardIcon fontSize="small" />
              </ListItemIcon>
              Meus Dashboards
            </MenuItem>
            <MenuItem
              onClick={() => {
                setAnchorEl(null);
                logout();
                navigate('/login');
              }}
            >
              <ListItemIcon>
                <Logout fontSize="small" />
              </ListItemIcon>
              Sair
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Upload e Entrada Rápida */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' }, gap: 3, mb: 4 }}>
          <FileUpload onImport={handleImport} />
          <QuickEntryForm onSave={handleSaveTransaction} onRefetch={refetch} />
        </Box>

        {/* Métricas */}
        <MetricsCards stats={stats} transactions={transactions} />

        {/* Filtros */}
        <Box id="filters-section" sx={{ mb: 4, scrollMarginTop: 80 }}>
          <FiltersCard filters={filters} onFiltersChange={setFilters} transactions={transactions} />
        </Box>

        {/* Gráficos */}
        <ChartsSection transactions={transactions} />

        {/* Tabela */}
        <TransactionsTable
          transactions={transactions}
          isLoading={isLoading}
          onEdit={handleEditTransaction}
          onDelete={handleDeleteTransaction}
          onNew={handleNewTransaction}
          onExport={handleExport}
          onThirdPartyUpdate={handleThirdPartyUpdate}
        />
      </Container>

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

      <ShortcutsModal
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </Box>
  );
}
