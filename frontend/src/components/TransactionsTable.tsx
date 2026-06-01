import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Button,
  Chip,
  Box,
  Tooltip,
  Stack,
  Typography,
  Divider,
  TablePagination,
  useTheme,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Checkbox,
  TableSortLabel,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  alpha,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Edit,
  Delete,
  Add,
  FileDownload,
  Person,
  KeyboardArrowDown,
  PersonAddOutlined,
  PersonRemove,
  DeleteSweep,
  Description as DescriptionIcon,
  Notes as NotesIcon,
  Search as SearchIcon,
  Category as CategoryIcon,
  TableChart as ExcelIcon,
  InsertDriveFile as CsvIcon,
  Close,
  AccountBalance as AccountBalanceIcon,
  CreditCard as CreditCardIcon,
} from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { useResponsive } from '../hooks/useResponsive';
import { useAccounts } from '../hooks/api/useAccounts';
import LoadingSkeleton from './LoadingSkeleton';
import TransactionItemsEditor from './TransactionItemsEditor';
import type { Transaction, Account } from '../types';
import { fadeIn, hoverLift } from '../utils/animations';

interface TransactionsTableProps {
  transactions: Transaction[];
  isLoading: boolean;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onExport: (selectedIds?: string[]) => void;
  onExportCSV?: (selectedIds?: string[]) => void;
  onExportXLSX?: (selectedIds?: string[]) => void;
  canEdit?: boolean;
  onThirdPartyUpdate?: (id: string, data: { isThirdParty: boolean; thirdPartyName?: string; thirdPartyDescription?: string }) => Promise<void>;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onDeleteSelected?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  accounts?: Account[];
}

type Order = 'asc' | 'desc';
type DisplayMode = 'description' | 'notes';

export default function TransactionsTable({
  transactions,
  isLoading,
  onEdit,
  onDelete,
  onNew,
  onExport,
  onExportCSV,
  onExportXLSX,
  canEdit = true,
  onThirdPartyUpdate,
  selectedIds = new Set(),
  onSelectionChange,
  onDeleteSelected,
  searchQuery,
  onSearchChange: _onSearchChange,
}: TransactionsTableProps) {
  const theme = useTheme();
  const { isMobile, isTablet } = useResponsive();
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const { data: accounts = [] } = useAccounts(dashboardId || '');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});

  // Helper to get account by ID
  const getAccountById = (accountId?: string): Account | undefined => {
    if (!accountId) return undefined;
    return (accounts as Account[]).find(acc => acc.id === accountId);
  };

  // Local search state - filters client-side without triggering parent re-renders
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery || '');

  // Display mode: description or notes
  const [displayMode, setDisplayMode] = useState<DisplayMode>('description');

  // Sorting state
  const [orderBy, setOrderBy] = useState<keyof Transaction>('date');
  const [order, setOrder] = useState<Order>('desc');

  // Export menu state - using anchorEl state instead of ref for proper Menu positioning
  const [exportMenuAnchorEl, setExportMenuAnchorEl] = useState<HTMLElement | null>(null);
  const exportMenuOpen = Boolean(exportMenuAnchorEl);

  const handleRequestSort = (property: keyof Transaction) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  // Third party dialog state
  const [thirdPartyDialogOpen, setThirdPartyDialogOpen] = useState(false);
  const [selectedTransactionForThirdParty, setSelectedTransactionForThirdParty] = useState<Transaction | null>(null);
  const [thirdPartyName, setThirdPartyName] = useState('');
  const [thirdPartyDescription, setThirdPartyDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Selection handlers
  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    if (selectedIds.size === transactions.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(transactions.map(t => t.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    if (!onSelectionChange) return;
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    onSelectionChange(newSelected);
  };

  // Export handlers
  const handleExportMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setExportMenuAnchorEl(event.currentTarget);
  };

  const handleExportMenuClose = () => {
    setExportMenuAnchorEl(null);
  };

  const handleExportCSV = () => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
    if (onExportCSV) {
      onExportCSV(ids);
    } else {
      onExport(ids);
    }
    handleExportMenuClose();
  };

  const handleExportXLSX = () => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
    if (onExportXLSX) {
      onExportXLSX(ids);
    }
    handleExportMenuClose();
  };

  const isAllSelected = transactions.length > 0 && selectedIds.size === transactions.length;
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < transactions.length;

  const toggleRow = (id: string) => {
    setOpenRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (date: string | Date) =>
    new Date(date).toLocaleDateString('pt-BR');

  // Third party handlers
  const handleThirdPartyClick = (transaction: Transaction) => {
    setSelectedTransactionForThirdParty(transaction);
    setThirdPartyName(transaction.thirdPartyName || '');
    setThirdPartyDescription(transaction.thirdPartyDescription || '');
    setThirdPartyDialogOpen(true);
  };

  const handleThirdPartyClose = () => {
    setThirdPartyDialogOpen(false);
    setSelectedTransactionForThirdParty(null);
    setThirdPartyName('');
    setThirdPartyDescription('');
  };

  const handleThirdPartySave = async () => {
    if (!selectedTransactionForThirdParty || !onThirdPartyUpdate) return;

    setIsSubmitting(true);
    try {
      await onThirdPartyUpdate(selectedTransactionForThirdParty.id, {
        isThirdParty: true,
        thirdPartyName: thirdPartyName.trim() || undefined,
        thirdPartyDescription: thirdPartyDescription.trim() || undefined,
      });
      handleThirdPartyClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleThirdPartyRemove = async () => {
    if (!selectedTransactionForThirdParty || !onThirdPartyUpdate) return;

    setIsSubmitting(true);
    try {
      await onThirdPartyUpdate(selectedTransactionForThirdParty.id, {
        isThirdParty: false,
        thirdPartyName: undefined,
        thirdPartyDescription: undefined,
      });
      handleThirdPartyClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleDisplayModeChange = (
    _event: React.MouseEvent<HTMLElement>,
    newMode: DisplayMode | null,
  ) => {
    if (newMode !== null) {
      setDisplayMode(newMode);
    }
  };

  // Get category color based on category name (simple hash)
  const getCategoryColor = (category: string): 'default' | 'primary' | 'secondary' | 'info' | 'warning' => {
    const colors: ('primary' | 'secondary' | 'info' | 'warning')[] = ['primary', 'secondary', 'info', 'warning'];
    const hash = category.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Client-side filtering based on local search query
  const filteredTransactions = React.useMemo(() => {
    if (!localSearchQuery.trim()) return transactions;
    
    // Normalize text by removing diacritics (accents, cedilla, etc.)
    const normalizeText = (text: string): string => {
      return text
        .normalize('NFD') // Decompose accented characters
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
        .toLowerCase();
    };

    const normalizedQuery = normalizeText(localSearchQuery.trim());
    
    return transactions.filter((t) => {
      const normalizedDescription = normalizeText(t.description || '');
      const normalizedCategory = normalizeText(t.category || '');
      const normalizedNotes = normalizeText(t.notes || '');
      const normalizedInstitution = normalizeText(t.institution || '');
      const normalizedThirdPartyName = normalizeText(t.thirdPartyName || '');
      const normalizedSubcategory = normalizeText(t.subcategory || '');
      
      return (
        normalizedDescription.includes(normalizedQuery) ||
        normalizedCategory.includes(normalizedQuery) ||
        normalizedNotes.includes(normalizedQuery) ||
        normalizedInstitution.includes(normalizedQuery) ||
        normalizedThirdPartyName.includes(normalizedQuery) ||
        normalizedSubcategory.includes(normalizedQuery)
      );
    });
  }, [transactions, localSearchQuery]);

  // Sorting logic - uses filtered transactions
  const sortedTransactions = React.useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      // Handle date specifically
      if (orderBy === 'date') {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return order === 'asc' ? dateA - dateB : dateB - dateA;
      }

      // Handle installment sorting - sort by remaining installments
      if (orderBy === 'installmentNumber') {
        const hasA = a.installmentTotal > 1;
        const hasB = b.installmentTotal > 1;

        // Non-installment transactions always go to the bottom
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;
        if (!hasA && !hasB) return 0;

        // Both have installments - sort by remaining (total - current)
        const remainingA = a.installmentTotal - a.installmentNumber;
        const remainingB = b.installmentTotal - b.installmentNumber;

        if (remainingA !== remainingB) {
          return order === 'asc' ? remainingA - remainingB : remainingB - remainingA;
        }
        // Tie-break by total installments (fewer total = simpler purchase)
        return order === 'asc'
          ? a.installmentTotal - b.installmentTotal
          : b.installmentTotal - a.installmentTotal;
      }

      // Handle strings (case insensitive)
      const valA = a[orderBy] ?? '';
      const valB = b[orderBy] ?? '';

      if (typeof valA === 'string' && typeof valB === 'string') {
        return order === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      // Handle numbers
      if (valA < valB) return order === 'asc' ? -1 : 1;
      if (valA > valB) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredTransactions, orderBy, order]);

  const paginatedTransactions = sortedTransactions.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  // Reset page when search changes
  React.useEffect(() => {
    setPage(0);
  }, [localSearchQuery]);

  // Get display content based on mode
  const getDisplayContent = (transaction: Transaction) => {
    if (displayMode === 'notes') {
      return transaction.notes || '—';
    }
    return transaction.description;
  };

  if (isLoading) {
    return <LoadingSkeleton variant="table" count={5} />;
  }

  // Common header actions - IMPORTANT: This must be a JSX element, NOT a component function,
  // otherwise the TextField will lose focus on every keystroke due to remounting
  const headerActions = (
    <Stack 
      direction="row" 
      spacing={1} 
      alignItems="center"
      flexWrap="wrap"
      sx={{ gap: 1 }}
    >
      {/* Display mode toggle */}
      <Tooltip title="Alternar entre Descrição e Notas">
        <ToggleButtonGroup
          value={displayMode}
          exclusive
          onChange={handleDisplayModeChange}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              px: 1.5,
              py: 0.5,
              borderRadius: 2,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
              '&.Mui-selected': {
                bgcolor: alpha(theme.palette.primary.main, 0.15),
                borderColor: theme.palette.primary.main,
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.25),
                },
              },
            },
          }}
        >
          <ToggleButton value="description">
            <Tooltip title="Mostrar Descrição" arrow>
              <DescriptionIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="notes">
            <Tooltip title="Mostrar Notas" arrow>
              <NotesIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Tooltip>

      {/* Local search - always render, filters client-side */}
      <TextField
        size="small"
        placeholder="Buscar..."
        value={localSearchQuery}
        onChange={(e) => setLocalSearchQuery(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
          endAdornment: localSearchQuery ? (
            <InputAdornment position="end">
              <IconButton
                size="small"
                onClick={() => setLocalSearchQuery('')}
                sx={{ p: 0.5 }}
              >
                <Close fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
        sx={{ 
          width: isMobile ? 140 : 200,
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.1)}`,
            },
            '&.Mui-focused': {
              boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.2)}`,
            },
          },
        }}
      />

      {localSearchQuery && (
        <Chip
          label={`${sortedTransactions.length} encontradas`}
          size="small"
          color="info"
          variant="outlined"
          sx={{ borderRadius: 2 }}
        />
      )}

      {selectedIds.size > 0 && (
        <Chip
          label={`${selectedIds.size} selecionadas`}
          size="small"
          color="primary"
          variant="outlined"
          onDelete={() => onSelectionChange?.(new Set())}
          sx={{
            borderRadius: 2,
            fontWeight: 500,
          }}
        />
      )}

      {selectedIds.size > 0 && canEdit && onDeleteSelected && (
        <Tooltip title={`Excluir ${selectedIds.size} transações selecionadas`} arrow>
          <Button
            startIcon={<DeleteSweep />}
            onClick={onDeleteSelected}
            size="small"
            variant="outlined"
            color="error"
            sx={{ borderRadius: 2 }}
          >
            {!isMobile && `Excluir (${selectedIds.size})`}
          </Button>
        </Tooltip>
      )}

      <Tooltip title={selectedIds.size > 0 ? `Exportar ${selectedIds.size} selecionadas` : "Exportar todas as transações"} arrow>
        <Button
          startIcon={<FileDownload />}
          endIcon={<KeyboardArrowDown />}
          onClick={handleExportMenuOpen}
          size="small"
          variant="outlined"
          sx={{ 
            borderRadius: 2,
            borderColor: alpha(theme.palette.primary.main, 0.5),
          }}
        >
          {!isMobile && 'Exportar'}
        </Button>
      </Tooltip>
      <Menu
        anchorEl={exportMenuAnchorEl}
        open={exportMenuOpen}
        onClose={handleExportMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          elevation: 8,
          sx: {
            borderRadius: 2,
            minWidth: 180,
            mt: 1,
            '& .MuiMenuItem-root': {
              px: 2,
              py: 1.5,
              borderRadius: 1,
              mx: 0.5,
              my: 0.25,
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.08),
              },
            },
          },
        }}
      >
        <MenuItem onClick={handleExportCSV}>
          <ListItemIcon>
            <CsvIcon fontSize="small" sx={{ color: theme.palette.success.main }} />
          </ListItemIcon>
          <ListItemText 
            primary="CSV" 
            secondary="Planilha simples"
            primaryTypographyProps={{ fontWeight: 500 }}
            secondaryTypographyProps={{ fontSize: '0.75rem' }}
          />
        </MenuItem>
        {onExportXLSX && (
          <MenuItem onClick={handleExportXLSX}>
            <ListItemIcon>
              <ExcelIcon fontSize="small" sx={{ color: theme.palette.info.main }} />
            </ListItemIcon>
            <ListItemText 
              primary="Excel (XLSX)" 
              secondary="Com formatação e cores"
              primaryTypographyProps={{ fontWeight: 500 }}
              secondaryTypographyProps={{ fontSize: '0.75rem' }}
            />
          </MenuItem>
        )}
      </Menu>

      {canEdit && (
        <Tooltip title="Adicionar nova transação" arrow>
          <Button 
            startIcon={<Add />} 
            onClick={onNew} 
            variant="contained"
            size="small"
            sx={{
              borderRadius: 2,
              boxShadow: `0 4px 14px 0 ${alpha(theme.palette.primary.main, 0.39)}`,
              '&:hover': {
                boxShadow: `0 6px 20px 0 ${alpha(theme.palette.primary.main, 0.5)}`,
              },
            }}
          >
            {isMobile ? '' : 'Nova'}
          </Button>
        </Tooltip>
      )}
    </Stack>
  );


  // Mobile View - Cards
  if (isMobile || isTablet) {
    return (
      <Card 
        sx={{ 
          ...fadeIn,
          borderRadius: 3,
          overflow: 'hidden',
          boxShadow: `0 4px 20px ${alpha(theme.palette.common.black, 0.1)}`,
        }}
      >
        <CardHeader
          title={
            <Typography 
              variant="h6" 
              fontWeight={700}
              sx={{ 
                background: `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${theme.palette.primary.main} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Transações
            </Typography>
          }
          subheader={
            <Typography variant="caption" color="text.secondary">
              Mostrando: {displayMode === 'description' ? 'Descrição' : 'Notas'}
            </Typography>
          }
          action={headerActions}
          sx={{
            pb: 1,
            '& .MuiCardHeader-action': {
              margin: 0,
              alignSelf: 'center',
            },
          }}
        />
        <Divider sx={{ opacity: 0.5 }} />
        <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
          {paginatedTransactions.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <DescriptionIcon sx={{ fontSize: 40, color: theme.palette.primary.main }} />
              </Box>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Nenhuma transação encontrada
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Selecione outro período ou adicione uma nova transação
              </Typography>
              {canEdit && (
                <Button 
                  variant="contained" 
                  startIcon={<Add />} 
                  onClick={onNew}
                  sx={{ borderRadius: 2 }}
                >
                  Adicionar Transação
                </Button>
              )}
            </Box>
          ) : (
            <Stack spacing={1.5}>
              {paginatedTransactions.map((transaction, index) => (
                <Card
                  key={transaction.id}
                  sx={{
                    border: `1px solid ${selectedIds.has(transaction.id) 
                      ? theme.palette.primary.main 
                      : alpha(theme.palette.divider, 0.3)}`,
                    bgcolor: selectedIds.has(transaction.id) 
                      ? alpha(theme.palette.primary.main, 0.05) 
                      : 'background.paper',
                    borderRadius: 2,
                    ...hoverLift,
                    animation: `fadeInUp ${300 + index * 30}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                    '@keyframes fadeInUp': {
                      from: { opacity: 0, transform: 'translateY(15px)' },
                      to: { opacity: 1, transform: 'translateY(0)' },
                    },
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: theme.palette.primary.main,
                    },
                  }}
                >
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    {/* Header Row */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flex: 1 }}>
                        {onSelectionChange && (
                          <Checkbox
                            checked={selectedIds.has(transaction.id)}
                            onChange={() => handleSelectOne(transaction.id)}
                            size="small"
                            sx={{ mt: -0.5, ml: -0.5 }}
                          />
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography 
                            variant="subtitle2" 
                            fontWeight={600}
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {getDisplayContent(transaction)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(transaction.date)}
                          </Typography>
                        </Box>
                      </Box>
                      <Tooltip title={transaction.entryType === 'Receita' ? 'Entrada de dinheiro' : 'Saída de dinheiro'} arrow>
                        <Chip
                          label={transaction.entryType}
                          size="small"
                          color={transaction.entryType === 'Receita' ? 'success' : 'error'}
                          sx={{ 
                            fontWeight: 600, 
                            borderRadius: 1.5,
                            boxShadow: transaction.entryType === 'Receita' 
                              ? `0 2px 8px ${alpha(theme.palette.success.main, 0.3)}`
                              : `0 2px 8px ${alpha(theme.palette.error.main, 0.3)}`,
                          }}
                        />
                      </Tooltip>
                    </Box>

                    {/* Category and Value Row */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Tooltip title={`Categoria: ${transaction.category}`} arrow>
                        <Chip
                          icon={<CategoryIcon sx={{ fontSize: 14 }} />}
                          label={transaction.category}
                          size="small"
                          color={getCategoryColor(transaction.category)}
                          variant="outlined"
                          sx={{ 
                            borderRadius: 1.5,
                            maxWidth: 150,
                            '& .MuiChip-label': {
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            },
                          }}
                        />
                      </Tooltip>
                      <Typography
                        variant="h6"
                        sx={{
                          fontWeight: 700,
                          color: transaction.entryType === 'Receita' ? 'success.main' : 'error.main',
                        }}
                      >
                        {formatCurrency(transaction.amount)}
                      </Typography>
                    </Box>

                    {/* Third Party Info */}
                    {transaction.isThirdParty && (
                      <Tooltip title="Esta transação envolve terceiros" arrow>
                        <Box 
                          sx={{ 
                            mb: 1, 
                            p: 1, 
                            borderRadius: 1.5, 
                            bgcolor: alpha(theme.palette.info.main, 0.08),
                            border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Person fontSize="small" color="info" />
                            <Typography variant="caption" color="info.main" fontWeight={500}>
                              {transaction.thirdPartyName || 'Terceiro'}
                            </Typography>
                          </Box>
                          {transaction.thirdPartyDescription && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 3, fontStyle: 'italic' }}>
                              {transaction.thirdPartyDescription}
                            </Typography>
                          )}
                        </Box>
                      </Tooltip>
                    )}

                    {/* Account/Card Info */}
                    {transaction.accountId && (() => {
                      const account = getAccountById(transaction.accountId);
                      if (!account) return null;
                      return (
                        <Tooltip title={`Conta: ${account.name}${account.institution ? ` • ${account.institution}` : ''}`} arrow>
                          <Chip
                            icon={account.type === 'CREDIT_CARD' ? <CreditCardIcon /> : <AccountBalanceIcon />}
                            label={account.name}
                            size="small"
                            variant="outlined"
                            sx={{ 
                              mb: 1,
                              borderRadius: 1.5,
                              maxWidth: 180,
                              borderColor: alpha(theme.palette.primary.main, 0.3),
                              '& .MuiChip-icon': { fontSize: '1rem' },
                              '& .MuiChip-label': {
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              },
                            }}
                          />
                        </Tooltip>
                      );
                    })()}

                    {/* Installment Chip */}
                    {transaction.installmentTotal > 0 && (
                      <Tooltip title={`Parcela ${transaction.installmentNumber} de ${transaction.installmentTotal}`} arrow>
                        <Chip
                          label={`${transaction.installmentNumber}/${transaction.installmentTotal}`}
                          size="small"
                          variant="outlined"
                          sx={{ 
                            fontSize: '0.7rem', 
                            borderRadius: 1,
                            mr: 0.5,
                          }}
                        />
                      </Tooltip>
                    )}

                    {/* Items */}
                    {transaction.items && transaction.items.length > 0 && (
                      <Box sx={{ mt: 2 }}>
                        <Divider sx={{ mb: 1 }} />
                        <TransactionItemsEditor
                          items={transaction.items}
                          onChange={() => { }}
                          readOnly
                          defaultExpanded={false}
                        />
                      </Box>
                    )}
                  </CardContent>

                  <Divider sx={{ opacity: 0.5 }} />

                  {/* Actions Row */}
                  <Box 
                    sx={{ 
                      display: 'flex', 
                      justifyContent: 'flex-end', 
                      p: 1, 
                      gap: 0.5,
                      bgcolor: alpha(theme.palette.background.default, 0.5),
                    }}
                  >
                    {canEdit && (
                      <>
                        {onThirdPartyUpdate && (
                          <Tooltip title={transaction.isThirdParty ? 'Editar terceiro' : 'Marcar como terceiro'} arrow>
                            <IconButton
                              size="small"
                              onClick={() => handleThirdPartyClick(transaction)}
                              color={transaction.isThirdParty ? "primary" : "default"}
                            >
                              {transaction.isThirdParty ? <Person fontSize="small" /> : <PersonAddOutlined fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Editar transação" arrow>
                          <IconButton size="small" onClick={() => onEdit(transaction)} color="primary">
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Excluir transação" arrow>
                          <IconButton size="small" onClick={() => onDelete(transaction.id)} color="error">
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </Box>
                </Card>
              ))}
            </Stack>
          )}

          <TablePagination
            component="div"
            count={transactions.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage="Por página:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
            sx={{ 
              mt: 2,
              '& .MuiTablePagination-toolbar': {
                flexWrap: 'wrap',
                justifyContent: 'center',
              },
            }}
          />
        </CardContent>
      </Card>
    );
  }

  // Desktop View - Table
  return (
    <Card 
      sx={{ 
        ...fadeIn,
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: `0 4px 20px ${alpha(theme.palette.common.black, 0.1)}`,
      }}
    >
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography 
              variant="h6" 
              fontWeight={700}
              sx={{ 
                background: `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${theme.palette.primary.main} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Transações Detalhadas
            </Typography>
            <Chip
              label={displayMode === 'description' ? 'Descrição' : 'Notas'}
              size="small"
              variant="outlined"
              sx={{ 
                borderRadius: 1.5, 
                fontSize: '0.7rem',
                height: 22,
              }}
            />
          </Box>
        }
        action={headerActions}
        sx={{
          pb: 1,
          '& .MuiCardHeader-action': {
            margin: 0,
            alignSelf: 'center',
          },
        }}
      />
      <Divider sx={{ opacity: 0.5 }} />
      <CardContent>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow
                sx={{
                  '& .MuiTableCell-head': {
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                    fontWeight: 600,
                    color: theme.palette.text.secondary,
                    borderBottom: `2px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                  },
                }}
              >
                {onSelectionChange && (
                  <TableCell padding="checkbox">
                    <Tooltip title="Selecionar todas" arrow>
                      <Checkbox
                        indeterminate={isIndeterminate}
                        checked={isAllSelected}
                        onChange={handleSelectAll}
                        inputProps={{ 'aria-label': 'selecionar todas' }}
                      />
                    </Tooltip>
                  </TableCell>
                )}
                <TableCell sx={{ width: 50 }} />
                <TableCell sortDirection={orderBy === 'date' ? order : false}>
                  <Tooltip title="Ordenar por data" arrow>
                    <TableSortLabel
                      active={orderBy === 'date'}
                      direction={orderBy === 'date' ? order : 'asc'}
                      onClick={() => handleRequestSort('date')}
                    >
                      Data
                    </TableSortLabel>
                  </Tooltip>
                </TableCell>
                <TableCell sortDirection={orderBy === 'entryType' ? order : false}>
                  <Tooltip title="Ordenar por tipo" arrow>
                    <TableSortLabel
                      active={orderBy === 'entryType'}
                      direction={orderBy === 'entryType' ? order : 'asc'}
                      onClick={() => handleRequestSort('entryType')}
                    >
                      Tipo
                    </TableSortLabel>
                  </Tooltip>
                </TableCell>
                <TableCell sortDirection={orderBy === 'category' ? order : false}>
                  <Tooltip title="Ordenar por categoria" arrow>
                    <TableSortLabel
                      active={orderBy === 'category'}
                      direction={orderBy === 'category' ? order : 'asc'}
                      onClick={() => handleRequestSort('category')}
                    >
                      Categoria
                    </TableSortLabel>
                  </Tooltip>
                </TableCell>
                <TableCell sortDirection={orderBy === 'description' ? order : false}>
                  <Tooltip title={`Ordenar por ${displayMode === 'description' ? 'descrição' : 'notas'}`} arrow>
                    <TableSortLabel
                      active={orderBy === 'description'}
                      direction={orderBy === 'description' ? order : 'asc'}
                      onClick={() => handleRequestSort('description')}
                    >
                      {displayMode === 'description' ? 'Descrição' : 'Notas'}
                    </TableSortLabel>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Tooltip title="Conta bancária ou cartão vinculado" arrow>
                    <span>Conta</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" sortDirection={orderBy === 'amount' ? order : false}>
                  <Tooltip title="Ordenar por valor" arrow>
                    <TableSortLabel
                      active={orderBy === 'amount'}
                      direction={orderBy === 'amount' ? order : 'asc'}
                      onClick={() => handleRequestSort('amount')}
                    >
                      Valor
                    </TableSortLabel>
                  </Tooltip>
                </TableCell>
                <TableCell sortDirection={orderBy === 'installmentNumber' ? order : false}>
                  <Tooltip title="Ordenar por parcelas restantes" arrow>
                    <TableSortLabel
                      active={orderBy === 'installmentNumber'}
                      direction={orderBy === 'installmentNumber' ? order : 'asc'}
                      onClick={() => handleRequestSort('installmentNumber')}
                    >
                      Parcela
                    </TableSortLabel>
                  </Tooltip>
                </TableCell>
                <TableCell align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={onSelectionChange ? 10 : 9} align="center" sx={{ py: 8 }}>
                    <Box
                      sx={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 2,
                      }}
                    >
                      <DescriptionIcon sx={{ fontSize: 40, color: theme.palette.primary.main }} />
                    </Box>
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                      Nenhuma transação encontrada
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Selecione outro período ou adicione uma nova transação
                    </Typography>
                    {canEdit && (
                      <Button 
                        variant="contained" 
                        startIcon={<Add />} 
                        onClick={onNew}
                        sx={{ borderRadius: 2 }}
                      >
                        Adicionar Transação
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedTransactions.map((transaction, index) => (
                  <React.Fragment key={transaction.id}>
                    <TableRow
                      hover
                      sx={{
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        animation: `fadeInRow ${150 + index * 30}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                        '@keyframes fadeInRow': {
                          from: { opacity: 0, transform: 'translateX(-10px)' },
                          to: { opacity: 1, transform: 'translateX(0)' },
                        },
                        '&:hover': {
                          backgroundColor: alpha(theme.palette.primary.main, 0.04),
                          transform: 'scale(1.001)',
                        },
                        backgroundColor: selectedIds.has(transaction.id)
                          ? alpha(theme.palette.primary.main, 0.08)
                          : openRows[transaction.id]
                            ? alpha(theme.palette.action.hover, 0.5)
                            : 'inherit',
                      }}
                      onClick={() => toggleRow(transaction.id)}
                    >
                      {onSelectionChange && (
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={selectedIds.has(transaction.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleSelectOne(transaction.id);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            inputProps={{ 'aria-label': `selecionar ${transaction.description}` }}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <Tooltip title={openRows[transaction.id] ? 'Recolher detalhes' : 'Expandir detalhes'} arrow>
                          <IconButton
                            aria-label="expand row"
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRow(transaction.id);
                            }}
                            sx={{
                              transition: 'transform 0.2s ease',
                              transform: openRows[transaction.id] ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}
                          >
                            <KeyboardArrowDown />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={`Data da transação: ${formatDate(transaction.date)}`} arrow>
                          <Typography variant="body2" fontWeight={500}>
                            {formatDate(transaction.date)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={transaction.entryType === 'Receita' ? 'Entrada de dinheiro' : 'Saída de dinheiro'} arrow>
                          <Chip
                            label={transaction.entryType}
                            size="small"
                            color={transaction.entryType === 'Receita' ? 'success' : 'error'}
                            sx={{ 
                              fontWeight: 600, 
                              borderRadius: 1.5,
                              minWidth: 75,
                            }}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={`Categoria: ${transaction.category}`} arrow>
                          <Chip
                            icon={<CategoryIcon sx={{ fontSize: 14 }} />}
                            label={transaction.category}
                            size="small"
                            color={getCategoryColor(transaction.category)}
                            variant="outlined"
                            sx={{ 
                              borderRadius: 1.5,
                              maxWidth: 150,
                              '& .MuiChip-label': {
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              },
                            }}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Tooltip title={displayMode === 'notes' && transaction.notes ? transaction.notes : transaction.description} arrow>
                            <Typography
                              variant="body2"
                              sx={{
                                maxWidth: 250,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {getDisplayContent(transaction)}
                            </Typography>
                          </Tooltip>
                          {transaction.isThirdParty && (
                            <Tooltip
                              title={
                                <Box sx={{ textAlign: 'center' }}>
                                  <Typography variant="body2" fontWeight="bold">Compra de Terceiro</Typography>
                                  <Typography variant="body2">{transaction.thirdPartyName || 'N/A'}</Typography>
                                  {transaction.thirdPartyDescription && (
                                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                                      "{transaction.thirdPartyDescription}"
                                    </Typography>
                                  )}
                                </Box>
                              }
                              arrow
                            >
                              <Chip
                                icon={<Person sx={{ fontSize: 14 }} />}
                                label="Terceiro"
                                size="small"
                                color="info"
                                variant="outlined"
                                sx={{ height: 22, fontSize: '0.7rem' }}
                              />
                            </Tooltip>
                          )}
                          {transaction.items && transaction.items.length > 0 && (
                            <Tooltip title={`${transaction.items.length} itens nesta transação`} arrow>
                              <Chip
                                label={`${transaction.items.length} itens`}
                                size="small"
                                variant="outlined"
                                sx={{ height: 22, fontSize: '0.7rem', borderRadius: 1 }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {transaction.accountId ? (() => {
                          const account = getAccountById(transaction.accountId);
                          if (!account) return <Typography variant="caption" color="text.secondary">-</Typography>;
                          return (
                            <Tooltip title={`Conta: ${account.name}${account.institution ? ` • ${account.institution}` : ''}`} arrow>
                              <Stack direction="row" spacing={1} alignItems="center">
                                {account.type === 'CREDIT_CARD' ? (
                                  <CreditCardIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                ) : (
                                  <AccountBalanceIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                )}
                                <Box>
                                  <Typography variant="body2" sx={{ lineHeight: 1.2 }}>
                                    {account.name}
                                  </Typography>
                                  {account.institution && (
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                      {account.institution}
                                    </Typography>
                                  )}
                                </Box>
                              </Stack>
                            </Tooltip>
                          );
                        })() : (
                          <Typography variant="caption" color="text.secondary">-</Typography>
                        )}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          color: transaction.entryType === 'Receita' ? 'success.main' : 'error.main'
                        }}
                      >
                        <Tooltip title={`Valor: ${formatCurrency(transaction.amount)}`} arrow>
                          <span>{formatCurrency(transaction.amount)}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {transaction.installmentTotal > 1 ? (() => {
                          const remaining = transaction.installmentTotal - transaction.installmentNumber;
                          const progress = transaction.installmentNumber / transaction.installmentTotal;
                          return (
                            <Tooltip
                              title={
                                remaining === 0
                                  ? `Última parcela (${transaction.installmentNumber}/${transaction.installmentTotal})`
                                  : `Parcela ${transaction.installmentNumber} de ${transaction.installmentTotal} • ${remaining} restante${remaining > 1 ? 's' : ''}`
                              }
                              arrow
                            >
                              <Chip
                                label={`${transaction.installmentNumber}/${transaction.installmentTotal}`}
                                size="small"
                                variant="outlined"
                                color={progress >= 1 ? 'success' : progress >= 0.7 ? 'info' : 'default'}
                                sx={{ borderRadius: 1, fontWeight: 500 }}
                              />
                            </Tooltip>
                          );
                        })() : transaction.installmentTotal === 1 ? (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {canEdit && (
                          <Stack direction="row" spacing={0.5} justifyContent="center">
                            {onThirdPartyUpdate && (
                              <Tooltip title={transaction.isThirdParty ? `Terceiro: ${transaction.thirdPartyName || 'Sem nome'}` : "Marcar como terceiro"} arrow>
                                <IconButton
                                  size="small"
                                  onClick={(e) => { e.stopPropagation(); handleThirdPartyClick(transaction); }}
                                  color={transaction.isThirdParty ? "primary" : "default"}
                                  sx={{
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                                      transform: 'scale(1.1)',
                                    },
                                  }}
                                >
                                  {transaction.isThirdParty ? <Person fontSize="small" /> : <PersonAddOutlined fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="Editar transação" arrow>
                              <IconButton 
                                size="small" 
                                onClick={(e) => { e.stopPropagation(); onEdit(transaction); }}
                                sx={{
                                  transition: 'all 0.2s ease',
                                  '&:hover': {
                                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                                    transform: 'scale(1.1)',
                                  },
                                }}
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Excluir transação" arrow>
                              <IconButton 
                                size="small" 
                                color="error" 
                                onClick={(e) => { e.stopPropagation(); onDelete(transaction.id); }}
                                sx={{
                                  transition: 'all 0.2s ease',
                                  '&:hover': {
                                    bgcolor: alpha(theme.palette.error.main, 0.1),
                                    transform: 'scale(1.1)',
                                  },
                                }}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={onSelectionChange ? 10 : 9}>
                        <Collapse in={openRows[transaction.id]} timeout="auto" unmountOnExit>
                          <Box 
                            sx={{ 
                              m: 2, 
                              p: 2, 
                              borderRadius: 2, 
                              bgcolor: alpha(theme.palette.background.default, 0.5),
                              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                            }}
                          >
                            {transaction.items && transaction.items.length > 0 ? (
                              <TransactionItemsEditor
                                items={transaction.items}
                                onChange={() => { }}
                                readOnly
                                defaultExpanded={true}
                              />
                            ) : (
                              <Box sx={{ textAlign: 'center', py: 2 }}>
                                <Typography variant="body2" color="text.secondary">
                                  Nenhum item detalhado para esta transação.
                                </Typography>
                                {transaction.notes && (
                                  <Box sx={{ mt: 2, p: 2, bgcolor: alpha(theme.palette.info.main, 0.05), borderRadius: 1 }}>
                                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                      Notas:
                                    </Typography>
                                    <Typography variant="body2" color="text.primary">
                                      {transaction.notes}
                                    </Typography>
                                  </Box>
                                )}
                              </Box>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={transactions.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage="Linhas por página:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
          sx={{
            borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
              fontWeight: 500,
            },
          }}
        />
      </CardContent>

      {/* Third Party Dialog */}
      <Dialog 
        open={thirdPartyDialogOpen} 
        onClose={handleThirdPartyClose} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: `0 20px 60px ${alpha(theme.palette.common.black, 0.2)}`,
          },
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" fontWeight={700}>
            {selectedTransactionForThirdParty?.isThirdParty ? 'Editar Participação de Terceiro' : 'Adicionar Participação de Terceiro'}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Transação: <strong>{selectedTransactionForThirdParty?.description}</strong>
          </Typography>
          {selectedTransactionForThirdParty?.installmentGroupId && selectedTransactionForThirdParty?.installmentTotal > 1 && (
            <Box
              sx={{
                mb: 2,
                p: 1.5,
                borderRadius: 1.5,
                bgcolor: alpha(theme.palette.info.main, 0.08),
                border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Person fontSize="small" color="info" />
              <Typography variant="caption" color="info.main">
                Todas as {selectedTransactionForThirdParty.installmentTotal} parcelas serão atualizadas automaticamente.
              </Typography>
            </Box>
          )}
          <TextField
            fullWidth
            label="Nome do Terceiro"
            value={thirdPartyName}
            onChange={(e) => setThirdPartyName(e.target.value)}
            placeholder="Ex: João, Maria..."
            sx={{ 
              mb: 2,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />
          <TextField
            fullWidth
            label="Descrição (opcional)"
            value={thirdPartyDescription}
            onChange={(e) => setThirdPartyDescription(e.target.value)}
            placeholder="Ex: Compra dividida, empréstimo..."
            multiline
            rows={2}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {selectedTransactionForThirdParty?.isThirdParty && (
            <Button
              onClick={handleThirdPartyRemove}
              color="error"
              disabled={isSubmitting}
              startIcon={<PersonRemove />}
              sx={{ borderRadius: 2 }}
            >
              Remover
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button 
            onClick={handleThirdPartyClose} 
            disabled={isSubmitting}
            sx={{ borderRadius: 2 }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleThirdPartySave}
            variant="contained"
            disabled={isSubmitting}
            sx={{ 
              borderRadius: 2,
              boxShadow: `0 4px 14px 0 ${alpha(theme.palette.primary.main, 0.39)}`,
            }}
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
