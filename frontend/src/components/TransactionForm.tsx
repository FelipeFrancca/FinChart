import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  InputAdornment,
  FormControlLabel,
  Switch,
  Collapse,
  Box,
  Typography,
  Autocomplete,
  createFilterOptions,
  CircularProgress,
  Radio,
  RadioGroup,
  FormControl,
  Chip,
  alpha,
} from '@mui/material';
import Person from '@mui/icons-material/Person';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import { useForm, Controller } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { useCategories, useCreateCategory } from '../hooks/api/useCategories';
import { useAccounts, useCreateAccount } from '../hooks/api/useAccounts';
import { useDefaultAllocationProfile } from '../hooks/api/useBudgetAllocation';
import TransactionItemsEditor from './TransactionItemsEditor';
import type { Transaction, TransactionItem, Account } from '../types';

// Filter options for Autocomplete with create option
const filterCategory = createFilterOptions<CategoryOption>();
const filterAccount = createFilterOptions<AccountOption>();

interface CategoryOption {
  name: string;
  id?: string;
  inputValue?: string;
  isNew?: boolean;
}

interface AccountOption {
  name: string;
  id?: string;
  type?: Account['type'];
  institution?: string;
  inputValue?: string;
  isNew?: boolean;
}

/**
 * Simple fuzzy match - checks if query words appear in target
 */
function fuzzyMatch(target: string, query: string): boolean {
  const targetLower = target.toLowerCase();
  const queryWords = query.toLowerCase().split(/\s+/);
  return queryWords.every(word => targetLower.includes(word));
}

/**
 * Format number to BRL currency display: 1234.56 -> "1.234,56"
 */
function formatBRLCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Parse BRL currency input: "1.234,56" -> 1234.56
 */
function parseBRLCurrency(input: string): number {
  // Remove dots (thousands separator) and replace comma with dot
  const cleaned = input.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * CurrencyField: Mantém o estado local durante a digitação para evitar o pulo do cursor
 */
const CurrencyField = ({ field, error }: { field: any, error?: any }) => {
  const [localValue, setLocalValue] = useState<string>(
    field.value ? formatBRLCurrency(field.value) : ''
  );

  // Sincronizar apenas se o valor externo mudar (ex: ao abrir para editar)
  useEffect(() => {
    const numericLocal = parseBRLCurrency(localValue);
    if (field.value !== numericLocal && typeof field.value === 'number') {
      setLocalValue(formatBRLCurrency(field.value));
    }
  }, [field.value]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    // Permite digitar livremente: números, pontos e vírgulas
    setLocalValue(input);
    
    // Atualiza o formulário com o valor numérico por baixo dos panos
    const cleaned = input.replace(/[^\d.,]/g, '');
    field.onChange(parseBRLCurrency(cleaned));
  };

  const handleBlur = () => {
    // Ao perder o foco, formata lindamente com milhares e decimais corretos
    const numericValue = parseBRLCurrency(localValue);
    if (numericValue > 0) {
      setLocalValue(formatBRLCurrency(numericValue));
    } else {
      setLocalValue('');
    }
    field.onChange(numericValue);
  };

  return (
    <TextField
      fullWidth
      label="Valor"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      InputProps={{
        startAdornment: <InputAdornment position="start">R$</InputAdornment>,
      }}
      placeholder="0,00"
      error={!!error}
      helperText={error?.message}
    />
  );
};

interface TransactionFormProps {
  open: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (data: Partial<Transaction>, scope?: 'single' | 'remaining' | 'all') => Promise<void>;
}

interface TransactionFormData {
  date: string;
  entryType: 'Receita' | 'Despesa';
  flowType: string; // Pode ser 'Fixa'/'Variável' para receitas ou nome da alocação para despesas
  category: string;
  subcategory: string;
  description: string;
  amount: number | string;
  paymentMethod: string;
  institution: string;
  cardBrand: string;
  installmentTotal: number;
  installmentNumber: number;
  installmentStatus: 'N/A' | 'Paga' | 'Pendente';
  notes: string;
  isTemporary: boolean;
  isThirdParty: boolean;
  thirdPartyName: string;
  thirdPartyDescription: string;
  accountId: string;
}

const defaultValues: TransactionFormData = {
  date: new Date().toISOString().split('T')[0],
  entryType: 'Receita',
  flowType: 'Fixa',
  category: '',
  subcategory: '',
  description: '',
  amount: '',
  paymentMethod: '',
  institution: '',
  cardBrand: '',
  installmentTotal: 1,
  installmentNumber: 1,
  installmentStatus: 'N/A',
  notes: '',
  isTemporary: false,
  isThirdParty: false,
  thirdPartyName: '',
  thirdPartyDescription: '',
  accountId: '',
};

// Account type labels
const accountTypeLabels: Record<Account['type'], string> = {
  CHECKING: 'Conta Corrente',
  SAVINGS: 'Poupança',
  CREDIT_CARD: 'Cartão de Crédito',
  INVESTMENT: 'Investimento',
  CASH: 'Dinheiro',
  OTHER: 'Outro',
};

export default function TransactionForm({ open, transaction, onClose, onSave }: TransactionFormProps) {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const { data: categories = [] } = useCategories(dashboardId || '');
  const { data: accounts = [] } = useAccounts(dashboardId || '');
  const { data: allocationProfile } = useDefaultAllocationProfile(dashboardId);
  const createCategory = useCreateCategory();
  const createAccount = useCreateAccount();

  const { control, handleSubmit, reset, watch, setValue } = useForm<TransactionFormData>({
    defaultValues
  });

  const entryType = watch('entryType');
  const isThirdParty = watch('isThirdParty');
  const paymentMethod = watch('paymentMethod');
  
  // State for editable items
  const [editableItems, setEditableItems] = useState<TransactionItem[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  
  // State for installment scope dialog
  const [showInstallmentScopeDialog, setShowInstallmentScopeDialog] = useState(false);
  const [installmentScope, setInstallmentScope] = useState<'single' | 'remaining' | 'all'>('single');
  const [pendingFormData, setPendingFormData] = useState<TransactionFormData | null>(null);

  // Check if this is an installment transaction with groupId
  const isInstallmentWithGroup = transaction && 
    transaction.installmentTotal > 1 && 
    transaction.installmentGroupId;


  // Filter categories based on entry type and convert to CategoryOption format
  const categoryOptions: CategoryOption[] = categories
    .filter((cat: any) => {
      const type = cat.type === 'INCOME' ? 'Receita' : 'Despesa';
      return type === entryType;
    })
    .map((cat: any) => ({ name: cat.name, id: cat.id }));

  // Convert accounts to AccountOption format
  const accountOptions: AccountOption[] = (accounts as Account[]).map((acc) => ({
    name: acc.name,
    id: acc.id,
    type: acc.type,
    institution: acc.institution,
  }));

  useEffect(() => {
    if (open) {
      if (transaction) {
        // Sanitize null values to empty strings to prevent React controlled input warnings
        reset({
          date: new Date(transaction.date).toISOString().split('T')[0],
          entryType: transaction.entryType as 'Receita' | 'Despesa',
          flowType: transaction.flowType as 'Fixa' | 'Variável',
          category: transaction.category || '',
          subcategory: transaction.subcategory || '',
          description: transaction.description || '',
          amount: transaction.amount,
          paymentMethod: transaction.paymentMethod || '',
          institution: transaction.institution || '',
          cardBrand: transaction.cardBrand || '',
          installmentTotal: transaction.installmentTotal || 1,
          installmentNumber: transaction.installmentNumber || 1,
          installmentStatus: transaction.installmentStatus as 'N/A' | 'Paga' | 'Pendente' || 'N/A',
          notes: transaction.notes || '',
          isTemporary: transaction.isTemporary || false,
          isThirdParty: transaction.isThirdParty || false,
          thirdPartyName: transaction.thirdPartyName || '',
          thirdPartyDescription: transaction.thirdPartyDescription || '',
          accountId: transaction.accountId || '',
        });
        // Initialize editable items
        setEditableItems(transaction.items?.map(item => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })) || []);
      } else {
        reset(defaultValues);
        setEditableItems([]);
      }
    }
  }, [open, transaction, reset]);

  const onSubmit = async (data: TransactionFormData) => {
    // If editing an installment transaction with groupId, show scope dialog
    if (isInstallmentWithGroup) {
      setPendingFormData(data);
      setShowInstallmentScopeDialog(true);
      return;
    }
    
    // Normal save for non-installment transactions
    await onSave({
      ...data,
      amount: Number(data.amount),
      installmentTotal: Number(data.installmentTotal),
      installmentNumber: Number(data.installmentNumber),
      items: editableItems.length > 0 ? editableItems : undefined,
      accountId: data.accountId || undefined,
    });
    onClose();
  };

  const handleInstallmentScopeSave = async () => {
    if (!pendingFormData) return;
    
    await onSave({
      ...pendingFormData,
      amount: Number(pendingFormData.amount),
      installmentTotal: Number(pendingFormData.installmentTotal),
      installmentNumber: Number(pendingFormData.installmentNumber),
      items: editableItems.length > 0 ? editableItems : undefined,
      accountId: pendingFormData.accountId || undefined,
    }, installmentScope);
    
    setShowInstallmentScopeDialog(false);
    setPendingFormData(null);
    onClose();
  };

  const handleInstallmentScopeCancel = () => {
    setShowInstallmentScopeDialog(false);
    setPendingFormData(null);
  };

  return (
    <>
      {/* Dialog para escolher escopo de edição de parcelas */}
      <Dialog open={showInstallmentScopeDialog} onClose={handleInstallmentScopeCancel}>
        <DialogTitle>Editar Parcelas</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Esta transação faz parte de um grupo de {transaction?.installmentTotal} parcelas.
            Como deseja aplicar as alterações?
          </Typography>
          <FormControl component="fieldset">
            <RadioGroup
              value={installmentScope}
              onChange={(e) => setInstallmentScope(e.target.value as 'single' | 'remaining' | 'all')}
            >
              <FormControlLabel 
                value="single" 
                control={<Radio />} 
                label="Apenas esta parcela" 
              />
              <FormControlLabel 
                value="remaining" 
                control={<Radio />} 
                label="Todas as parcelas pendentes" 
              />
              <FormControlLabel 
                value="all" 
                control={<Radio />} 
                label="Todas as parcelas do grupo" 
              />
            </RadioGroup>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleInstallmentScopeCancel}>Cancelar</Button>
          <Button onClick={handleInstallmentScopeSave} variant="contained">
            Aplicar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>{transaction ? 'Editar Transação' : 'Nova Transação'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Linha 1: Tipo e Fluxo */}
            <Grid item xs={12} sm={6}>
              <Controller
                name="entryType"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    fullWidth
                    label="Tipo"
                    onChange={(e) => {
                      field.onChange(e);
                      setValue('category', ''); // Reset category on type change
                      // Definir flowType apropriado baseado no tipo
                      const newEntryType = e.target.value;
                      if (newEntryType === 'Despesa' && allocationProfile?.allocations?.length) {
                        setValue('flowType', allocationProfile.allocations[0].name);
                      } else {
                        setValue('flowType', 'Fixa');
                      }
                    }}
                  >
                    <MenuItem value="Receita">Receita</MenuItem>
                    <MenuItem value="Despesa">Despesa</MenuItem>
                  </TextField>
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="flowType"
                control={control}
                render={({ field }) => {
                  // Se for Receita, usar opções simples; se for Despesa, usar alocações do perfil
                  const isExpense = entryType === 'Despesa';
                  const allocationOptions = allocationProfile?.allocations || [];
                  
                  return (
                    <TextField 
                      {...field} 
                      select 
                      fullWidth 
                      label={isExpense ? 'Alocação de Orçamento' : 'Fluxo'}
                      helperText={isExpense ? 'Selecione em qual categoria do orçamento esta despesa se encaixa' : undefined}
                    >
                      {isExpense ? (
                        allocationOptions.length > 0 ? (
                          allocationOptions.map((allocation) => (
                            <MenuItem key={allocation.name} value={allocation.name}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box 
                                  sx={{ 
                                    width: 12, 
                                    height: 12, 
                                    borderRadius: '50%', 
                                    backgroundColor: allocation.color || '#666',
                                    flexShrink: 0
                                  }} 
                                />
                                <Typography variant="body2">
                                  {allocation.name}
                                </Typography>
                                <Chip 
                                  size="small" 
                                  label={`${allocation.percentage}%`} 
                                  sx={{ 
                                    ml: 'auto', 
                                    height: 20,
                                    fontSize: '0.7rem',
                                    backgroundColor: alpha(allocation.color || '#666', 0.2),
                                    color: allocation.color || '#666'
                                  }} 
                                />
                              </Box>
                            </MenuItem>
                          ))
                        ) : (
                          // Fallback para opções padrão se não houver perfil de alocação
                          [
                            <MenuItem key="Despesas Fixas" value="Despesas Fixas">Despesas Fixas</MenuItem>,
                            <MenuItem key="Lazer" value="Lazer">Lazer</MenuItem>,
                            <MenuItem key="Investimentos" value="Investimentos">Investimentos</MenuItem>,
                            <MenuItem key="Estudos" value="Estudos">Estudos</MenuItem>,
                            <MenuItem key="Cuidados Pessoais" value="Cuidados Pessoais">Cuidados Pessoais</MenuItem>,
                          ]
                        )
                      ) : (
                        [
                          <MenuItem key="Fixa" value="Fixa">Fixa</MenuItem>,
                          <MenuItem key="Variável" value="Variável">Variável</MenuItem>,
                        ]
                      )}
                    </TextField>
                  );
                }}
              />
            </Grid>

            {/* Linha 2: Descrição */}
            <Grid item xs={12}>
              <Controller
                name="description"
                control={control}
                rules={{ required: 'Descrição é obrigatória' }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Descrição"
                    error={!!error}
                    helperText={error?.message}
                  />
                )}
              />
            </Grid>

            {/* Linha 3: Valor e Data */}
            <Grid item xs={12} sm={6}>
              <Controller
                name="amount"
                control={control}
                rules={{ required: 'Valor é obrigatório', validate: v => (typeof v === 'number' ? v : parseBRLCurrency(String(v))) > 0 || 'Valor deve ser maior que zero' }}
                render={({ field, fieldState: { error } }) => (
                  <CurrencyField field={field} error={error} />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="date"
                control={control}
                rules={{ required: 'Data é obrigatória' }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    fullWidth
                    type="date"
                    label="Data"
                    InputLabelProps={{ shrink: true }}
                    error={!!error}
                    helperText={error?.message}
                  />
                )}
              />
            </Grid>

            {/* Linha 4: Categoria e Subcategoria */}
            <Grid item xs={12} sm={6}>
              <Controller
                name="category"
                control={control}
                rules={{ required: 'Categoria é obrigatória' }}
                render={({ field, fieldState: { error } }) => (
                  <Autocomplete
                    freeSolo
                    selectOnFocus
                    clearOnBlur
                    handleHomeEndKeys
                    loading={creatingCategory}
                    options={categoryOptions}
                    getOptionLabel={(option) => {
                      if (typeof option === 'string') return option;
                      if (option.inputValue) return option.inputValue;
                      return option.name;
                    }}
                    value={categoryOptions.find(c => c.name === field.value) || (field.value ? { name: field.value } : null)}
                    onChange={async (_, newValue) => {
                      if (typeof newValue === 'string') {
                        field.onChange(newValue);
                      } else if (newValue?.isNew && newValue.inputValue) {
                        // Create new category
                        setCreatingCategory(true);
                        try {
                          await createCategory.mutateAsync({
                            data: {
                              name: newValue.inputValue,
                              type: entryType === 'Receita' ? 'INCOME' : 'EXPENSE',
                            },
                            dashboardId: dashboardId!,
                          });
                          field.onChange(newValue.inputValue);
                        } catch {
                          // Handle error silently, keep input value
                          field.onChange(newValue.inputValue);
                        } finally {
                          setCreatingCategory(false);
                        }
                      } else if (newValue) {
                        field.onChange(newValue.name);
                      } else {
                        field.onChange('');
                      }
                    }}
                    filterOptions={(options, params) => {
                      const filtered = filterCategory(options, params);
                      const { inputValue } = params;
                      
                      // Fuzzy matching - show options that contain any word from input
                      if (inputValue) {
                        const fuzzyFiltered = options.filter(opt => 
                          fuzzyMatch(opt.name, inputValue)
                        );
                        // Merge fuzzy results with exact filter results
                        fuzzyFiltered.forEach(f => {
                          if (!filtered.find(x => x.name === f.name)) {
                            filtered.push(f);
                          }
                        });
                      }
                      
                      // Add "Create new" option if no exact match
                      const isExisting = options.some(opt => 
                        opt.name.toLowerCase() === inputValue.toLowerCase()
                      );
                      if (inputValue && !isExisting) {
                        filtered.push({
                          inputValue,
                          name: `➕ Criar "${inputValue}"`,
                          isNew: true,
                        });
                      }
                      
                      return filtered;
                    }}
                    renderOption={(props, option) => (
                      <li {...props} key={option.isNew ? `new-${option.inputValue}` : option.id || option.name}>
                        {option.isNew ? (
                          <Typography color="primary">{option.name}</Typography>
                        ) : (
                          option.name
                        )}
                      </li>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Categoria"
                        error={!!error}
                        helperText={error?.message || 'Digite para buscar ou criar nova'}
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {creatingCategory && <CircularProgress color="inherit" size={20} />}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="subcategory"
                control={control}
                render={({ field }) => (
                  <TextField {...field} fullWidth label="Subcategoria (Opcional)" />
                )}
              />
            </Grid>

            {/* Linha 5: Pagamento e Instituição */}
            <Grid item xs={12} sm={6}>
              <Controller
                name="paymentMethod"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select fullWidth label="Método de Pagamento">
                    <MenuItem value="Dinheiro">Dinheiro</MenuItem>
                    <MenuItem value="Pix">Pix</MenuItem>
                    <MenuItem value="Cartão de Crédito">Cartão de Crédito</MenuItem>
                    <MenuItem value="Cartão de Débito">Cartão de Débito</MenuItem>
                    <MenuItem value="Transferência">Transferência</MenuItem>
                    <MenuItem value="Boleto">Boleto</MenuItem>
                  </TextField>
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="accountId"
                control={control}
                render={({ field }) => {
                  const selectedAccount = accountOptions.find(a => a.id === field.value);
                  
                  return (
                    <Autocomplete
                      freeSolo
                      selectOnFocus
                      clearOnBlur
                      handleHomeEndKeys
                      loading={creatingAccount}
                      options={accountOptions}
                      getOptionLabel={(option) => {
                        if (typeof option === 'string') return option;
                        if (option.inputValue) return option.inputValue;
                        return option.name;
                      }}
                      value={selectedAccount || null}
                      onChange={async (_, newValue) => {
                        if (typeof newValue === 'string') {
                          // Just a string typed - ignore
                        } else if (newValue?.isNew && newValue.inputValue) {
                          // Create new account
                          setCreatingAccount(true);
                          try {
                            // Determine default account type based on payment method
                            let defaultType: Account['type'] = 'CHECKING';
                            if (paymentMethod === 'Cartão de Crédito') {
                              defaultType = 'CREDIT_CARD';
                            } else if (paymentMethod === 'Dinheiro') {
                              defaultType = 'CASH';
                            }
                            
                            const newAccount = await createAccount.mutateAsync({
                              data: {
                                name: newValue.inputValue,
                                type: defaultType,
                                currency: 'BRL',
                                initialBalance: 0,
                              },
                              dashboardId: dashboardId!,
                            });
                            field.onChange(newAccount.id);
                            // Also update institution field with account name
                            setValue('institution', newValue.inputValue);
                          } catch {
                            // Handle error silently
                          } finally {
                            setCreatingAccount(false);
                          }
                        } else if (newValue) {
                          field.onChange(newValue.id);
                          // Update institution field with account name/institution
                          setValue('institution', newValue.institution || newValue.name);
                        } else {
                          field.onChange('');
                          setValue('institution', '');
                        }
                      }}
                      filterOptions={(options, params) => {
                        const filtered = filterAccount(options, params);
                        const { inputValue } = params;
                        
                        // Add "Create new" option if no exact match
                        const isExisting = options.some(opt => 
                          opt.name.toLowerCase() === inputValue.toLowerCase()
                        );
                        if (inputValue && !isExisting) {
                          filtered.push({
                            inputValue,
                            name: `➕ Criar "${inputValue}"`,
                            isNew: true,
                          });
                        }
                        
                        return filtered;
                      }}
                      renderOption={(props, option) => (
                        <li {...props} key={option.isNew ? `new-${option.inputValue}` : option.id || option.name}>
                          {option.isNew ? (
                            <Typography color="primary">{option.name}</Typography>
                          ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                              {option.type === 'CREDIT_CARD' ? (
                                <CreditCardIcon fontSize="small" color="action" />
                              ) : (
                                <AccountBalanceIcon fontSize="small" color="action" />
                              )}
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="body2">{option.name}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {option.type && accountTypeLabels[option.type]}
                                  {option.institution && ` • ${option.institution}`}
                                </Typography>
                              </Box>
                            </Box>
                          )}
                        </li>
                      )}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Conta / Cartão"
                          placeholder="Selecione ou crie uma conta"
                          helperText="Vincule a uma conta bancária ou cartão"
                          InputProps={{
                            ...params.InputProps,
                            startAdornment: (
                              <>
                                {selectedAccount?.type === 'CREDIT_CARD' ? (
                                  <CreditCardIcon fontSize="small" color="action" sx={{ ml: 1 }} />
                                ) : selectedAccount ? (
                                  <AccountBalanceIcon fontSize="small" color="action" sx={{ ml: 1 }} />
                                ) : null}
                                {params.InputProps.startAdornment}
                              </>
                            ),
                            endAdornment: (
                              <>
                                {creatingAccount && <CircularProgress color="inherit" size={20} />}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          }}
                        />
                      )}
                    />
                  );
                }}
              />
            </Grid>

            {/* Linha 6: Parcelamento */}
            <Grid item xs={12}>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                <FormControlLabel
                  control={
                    <Switch 
                      checked={watch('installmentTotal') > 1 || watch('paymentMethod') === 'Cartão de Crédito'}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setValue('installmentTotal', 2);
                          setValue('installmentNumber', 1);
                        } else {
                          setValue('installmentTotal', 1);
                          setValue('installmentNumber', 1);
                          if (watch('paymentMethod') === 'Cartão de Crédito') {
                            setValue('paymentMethod', ''); // Forçar o usuário a mudar se ele desmarcar parcelamento de cartão
                          }
                        }
                      }}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CreditCardIcon sx={{ color: 'primary.main' }} />
                      <Typography variant="body1">
                        Transação Parcelada
                      </Typography>
                    </Box>
                  }
                />
                <Collapse in={watch('installmentTotal') > 1 || watch('paymentMethod') === 'Cartão de Crédito'}>
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={6}>
                      <Controller
                        name="installmentNumber"
                        control={control}
                        render={({ field }) => (
                          <TextField 
                            {...field} 
                            type="number" 
                            fullWidth 
                            label="Parcela Atual" 
                            inputProps={{ min: 1 }}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                          />
                        )}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <Controller
                        name="installmentTotal"
                        control={control}
                        render={({ field }) => (
                          <TextField 
                            {...field} 
                            type="number" 
                            fullWidth 
                            label="Total de Parcelas" 
                            inputProps={{ min: 1 }}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                          />
                        )}
                      />
                    </Grid>
                  </Grid>
                </Collapse>
              </Box>
            </Grid>
            {/* Linha 7: Notas */}
            <Grid item xs={12}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField {...field} fullWidth multiline rows={3} label="Notas (Opcional)" />
                )}
              />
            </Grid>

            {/* Linha 8: Despesa de Terceiro */}
            <Grid item xs={12}>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                <FormControlLabel
                  control={
                    <Controller
                      name="isThirdParty"
                      control={control}
                      render={({ field }) => (
                        <Switch {...field} checked={field.value} />
                      )}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Person sx={{ color: 'primary.main' }} />
                      <Typography variant="body1">
                        Despesa de Terceiro
                      </Typography>
                    </Box>
                  }
                />
                <Collapse in={isThirdParty}>
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12} sm={6}>
                      <Controller
                        name="thirdPartyName"
                        control={control}
                        render={({ field }) => (
                          <TextField {...field} fullWidth label="Nome do Terceiro" />
                        )}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Controller
                        name="thirdPartyDescription"
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            fullWidth
                            label="Anotação"
                            placeholder="Ex: Empréstimo para João"
                          />
                        )}
                      />
                    </Grid>
                  </Grid>
                </Collapse>
              </Box>
            </Grid>

            {/* Itens da transação (editável) */}
            <Grid item xs={12}>
              <TransactionItemsEditor 
                items={editableItems} 
                onChange={setEditableItems}
                defaultExpanded={editableItems.length > 0}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained">Salvar</Button>
        </DialogActions>
      </form>
    </Dialog>
    </>
  );
}
