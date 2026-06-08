import { useState, useMemo } from 'react';
import {
  Grid,
  Card,
  CardHeader,
  CardContent,
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  Button,
  MenuItem,
  Stack,
  Chip,
  alpha,
  useTheme,
  CircularProgress,
  IconButton,
} from '@mui/material';
import ShowChart from '@mui/icons-material/ShowChart';
import PieChartIcon from '@mui/icons-material/PieChart';
import TimelineIcon from '@mui/icons-material/Timeline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ScienceIcon from '@mui/icons-material/Science';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import Swal from 'sweetalert2';
import { useQueryClient } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  PieChart as RechartsPie,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceLine,
} from 'recharts';
import { format, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useParams } from 'react-router-dom';
import type { Transaction } from '../types';
import { useCashFlowProjection, useSimulateCashFlow, analysisKeys } from '../hooks/api/useAnalysis';
import { useCreateGoal } from '../hooks/api/useGoals';
import type { CashFlowProjectionResult, InjectedTransaction } from '../services/analysisService';

interface ChartsSectionProps {
  transactions: Transaction[];
}

const COLORS = ['#9b6dff', '#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a855f7', '#14b8a6', '#f97316'];

const TRAFFIC_COLORS: Record<string, string> = {
  GREEN: '#4caf50',
  YELLOW: '#ff9800',
  RED: '#f44336',
};

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

// Custom bar shape to color each bar by traffic light status
const TrafficLightBar = (props: any) => {
  const { x, y, width, height, payload } = props;
  const color = TRAFFIC_COLORS[payload?.status] || TRAFFIC_COLORS.GREEN;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={color}
      rx={3}
      ry={3}
      opacity={0.85}
    />
  );
};

// Custom tooltip for projection chart
const ProjectionTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  const statusLabel = data.status === 'GREEN' ? '🟢 Saudável' : data.status === 'YELLOW' ? '🟡 Atenção' : '🔴 Crítico';
  const formattedDate = (() => {
    try {
      const [y, m, d] = data.date.split('-');
      return `${d}/${m}/${y}`;
    } catch {
      return label;
    }
  })();

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        p: 1.5,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        minWidth: 200,
      }}
    >
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        {formattedDate}
      </Typography>
      <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>
        {statusLabel}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">Saldo</Typography>
        <Typography variant="caption" fontWeight={600} sx={{ color: TRAFFIC_COLORS[data.status] }}>
          {formatBRL(data.runningBalance)}
        </Typography>
      </Box>
      {data.income > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          <Typography variant="caption" color="success.main">Receitas</Typography>
          <Typography variant="caption">+{formatBRL(data.income)}</Typography>
        </Box>
      )}
      {data.expenses > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          <Typography variant="caption" color="error.main">Despesas</Typography>
          <Typography variant="caption">-{formatBRL(data.expenses)}</Typography>
        </Box>
      )}
    </Box>
  );
};

type ChartView = 'history' | 'projection';

interface MockEntry {
  id: string;
  amount: string;
  date: string;
  entryType: 'Receita' | 'Despesa';
  description: string;
}

const createEmptyMock = (): MockEntry => ({
  id: crypto.randomUUID(),
  amount: '',
  date: new Date().toISOString().split('T')[0],
  entryType: 'Receita',
  description: '',
});

export default function ChartsSection({ transactions }: ChartsSectionProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const createGoalMutation = useCreateGoal();
  const [chartView, setChartView] = useState<ChartView>('history');
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [mockEntries, setMockEntries] = useState<MockEntry[]>([createEmptyMock()]);
  const [simulationResult, setSimulationResult] = useState<CashFlowProjectionResult | null>(null);

  // Cash flow projection query
  const {
    data: projection,
    isLoading: projectionLoading,
  } = useCashFlowProjection(
    chartView === 'projection' ? (dashboardId || '') : '',
    30,
    500
  );

  // Simulation mutation
  const simulateMutation = useSimulateCashFlow(dashboardId || '');

  // Preparar dados do gráfico de linha (evolução mensal)
  const monthlyData = useMemo(() => {
    const months = 12;
    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(new Date(), i));
      const monthTransactions = transactions.filter(t => {
        const tDate = new Date(t.date);
        return tDate.getMonth() === monthStart.getMonth() && tDate.getFullYear() === monthStart.getFullYear();
      });

      const income = monthTransactions.filter(t => t.entryType === 'Receita').reduce((sum, t) => sum + t.amount, 0);
      const expense = monthTransactions.filter(t => t.entryType === 'Despesa').reduce((sum, t) => sum + t.amount, 0);

      data.push({
        month: format(monthStart, 'MMM yy', { locale: ptBR }),
        receitas: income,
        despesas: expense,
        saldo: income - expense,
      });
    }
    return data;
  }, [transactions]);

  // Preparar dados do gráfico de pizza (categorias)
  const categoryData = useMemo(() => {
    const expenses = transactions.filter(t => t.entryType === 'Despesa');
    const categoryMap = new Map<string, number>();

    expenses.forEach(t => {
      const current = categoryMap.get(t.category) || 0;
      categoryMap.set(t.category, current + t.amount);
    });

    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [transactions]);

  // Projection chart data — use simulation result if available, otherwise real projection
  const projectionData = useMemo(() => {
    const source = simulationResult || projection;
    if (!source?.projections) return [];

    return source.projections.map(p => {
      const [, m, d] = p.date.split('-');
      return {
        ...p,
        label: `${d}/${m}`,
      };
    });
  }, [projection, simulationResult]);

  // Projection summary
  const projectionSummary = simulationResult?.summary || projection?.summary;

  // Handle chart view toggle
  const handleViewChange = (_: React.MouseEvent<HTMLElement>, newView: ChartView | null) => {
    if (newView !== null) {
      setChartView(newView);
      if (newView === 'history') {
        setSimulationResult(null);
      }
    }
  };

  // Mock entries handlers
  const addMockEntry = () => {
    setMockEntries(prev => [...prev, createEmptyMock()]);
  };

  const removeMockEntry = (id: string) => {
    setMockEntries(prev => prev.filter(e => e.id !== id));
  };

  const updateMockEntry = (id: string, field: keyof MockEntry, value: string) => {
    setMockEntries(prev =>
      prev.map(e => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  // Apply simulation
  const handleSimulate = () => {
    const validEntries: InjectedTransaction[] = mockEntries
      .filter(e => e.amount && parseFloat(e.amount) > 0 && e.date && e.description)
      .map(e => ({
        date: e.date,
        amount: parseFloat(e.amount),
        entryType: e.entryType,
        description: e.description,
      }));

    if (validEntries.length === 0) return;

    simulateMutation.mutate(
      { mockTransactions: validEntries },
      {
        onSuccess: (data) => {
          setSimulationResult(data);
        },
      }
    );
  };

  // Clear simulation
  const handleClearSimulation = () => {
    setSimulationResult(null);
    setMockEntries([createEmptyMock()]);
  };

  // Save Goal
  const handleSaveGoal = (entry: MockEntry) => {
    createGoalMutation.mutate(
      {
        dashboardId: dashboardId || '',
        data: {
          name: `Sprint: ${entry.description}`,
          targetAmount: parseFloat(entry.amount),
          deadline: entry.date,
        },
      },
      {
        onSuccess: () => {
          handleClearSimulation();
          queryClient.invalidateQueries({ queryKey: analysisKeys.all });
          Swal.fire({
            icon: 'success',
            title: 'Meta de Sprint salva com sucesso!',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
          });
        },
      }
    );
  };

  return (
    <Grid container spacing={3} sx={{ mb: 4 }}>
      <Grid item xs={12} lg={8}>
        <Card
          sx={{
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: `0 4px 20px ${alpha(theme.palette.common.black, 0.1)}`,
          }}
        >
          <CardHeader
            avatar={chartView === 'history' ? <ShowChart /> : <TimelineIcon />}
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Typography variant="h6" fontWeight={600}>
                  {chartView === 'history' ? 'Evolução Mensal' : 'Projeção de Caixa (30 dias)'}
                </Typography>
                {simulationResult && (
                  <Chip
                    label="Simulação ativa"
                    size="small"
                    color="warning"
                    variant="outlined"
                    onDelete={handleClearSimulation}
                    sx={{ borderRadius: 1.5, fontWeight: 500 }}
                  />
                )}
              </Box>
            }
            action={
              <ToggleButtonGroup
                value={chartView}
                exclusive
                onChange={handleViewChange}
                size="small"
                sx={{
                  '& .MuiToggleButton-root': {
                    px: 2,
                    py: 0.5,
                    borderRadius: 2,
                    fontSize: '0.8rem',
                    textTransform: 'none',
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                    '&.Mui-selected': {
                      bgcolor: alpha(theme.palette.primary.main, 0.15),
                      borderColor: theme.palette.primary.main,
                      color: theme.palette.primary.main,
                      fontWeight: 600,
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.25),
                      },
                    },
                  },
                }}
              >
                <ToggleButton value="history">
                  <ShowChart sx={{ fontSize: 16, mr: 0.5 }} />
                  Histórico
                </ToggleButton>
                <ToggleButton value="projection">
                  <TimelineIcon sx={{ fontSize: 16, mr: 0.5 }} />
                  Projeção 30 Dias
                </ToggleButton>
              </ToggleButtonGroup>
            }
            titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
          />
          <CardContent>
            {/* ===================== HISTORY CHART ===================== */}
            {chartView === 'history' && (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <RechartsTooltip
                    formatter={(value: any) => formatBRL(value)}
                    contentStyle={{
                      backgroundColor: theme.palette.background.paper,
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: 8,
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="receitas" stroke="#34d399" strokeWidth={2} name="Receitas" />
                  <Line type="monotone" dataKey="despesas" stroke="#f87171" strokeWidth={2} name="Despesas" />
                  <Line type="monotone" dataKey="saldo" stroke="#9b6dff" strokeWidth={3} name="Saldo" />
                </LineChart>
              </ResponsiveContainer>
            )}

            {/* ===================== PROJECTION CHART ===================== */}
            {chartView === 'projection' && (
              <>
                {projectionLoading && !simulationResult ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 320 }}>
                    <CircularProgress />
                  </Box>
                ) : projectionData.length > 0 ? (
                  <>
                    {/* Summary chips */}
                    {projectionSummary && (
                      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                        <Tooltip title="Dias com saldo saudável" arrow>
                          <Chip
                            label={`🟢 ${projectionSummary.daysInGreen}d`}
                            size="small"
                            sx={{
                              bgcolor: alpha('#4caf50', 0.15),
                              color: '#4caf50',
                              fontWeight: 600,
                              borderRadius: 1.5,
                            }}
                          />
                        </Tooltip>
                        <Tooltip title="Dias com atenção" arrow>
                          <Chip
                            label={`🟡 ${projectionSummary.daysInYellow}d`}
                            size="small"
                            sx={{
                              bgcolor: alpha('#ff9800', 0.15),
                              color: '#ff9800',
                              fontWeight: 600,
                              borderRadius: 1.5,
                            }}
                          />
                        </Tooltip>
                        <Tooltip title="Dias em zona crítica" arrow>
                          <Chip
                            label={`🔴 ${projectionSummary.daysInRed}d`}
                            size="small"
                            sx={{
                              bgcolor: alpha('#f44336', 0.15),
                              color: '#f44336',
                              fontWeight: 600,
                              borderRadius: 1.5,
                            }}
                          />
                        </Tooltip>
                        <Tooltip title="Saldo final projetado" arrow>
                          <Chip
                            label={`Final: ${formatBRL(projectionSummary.finalBalance)}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 500, borderRadius: 1.5 }}
                          />
                        </Tooltip>
                        <Tooltip title="Menor saldo no período" arrow>
                          <Chip
                            label={`Mín: ${formatBRL(projectionSummary.lowestBalance)}`}
                            size="small"
                            variant="outlined"
                            sx={{
                              fontWeight: 500,
                              borderRadius: 1.5,
                              borderColor: projectionSummary.lowestBalance <= 0 ? '#f44336' : undefined,
                              color: projectionSummary.lowestBalance <= 0 ? '#f44336' : undefined,
                            }}
                          />
                        </Tooltip>
                      </Stack>
                    )}

                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={projectionData} barCategoryGap="15%">
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                        />
                        <RechartsTooltip content={<ProjectionTooltip />} />
                        <ReferenceLine y={0} stroke={theme.palette.divider} strokeDasharray="3 3" />
                        <Bar
                          dataKey="runningBalance"
                          name="Saldo Projetado"
                          shape={<TrafficLightBar />}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                ) : (
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 320 }}>
                    <Typography color="text.secondary">Sem dados de projeção disponíveis</Typography>
                  </Box>
                )}

                {/* ===================== SIMULATOR ===================== */}
                <Accordion
                  expanded={simulatorOpen}
                  onChange={() => setSimulatorOpen(!simulatorOpen)}
                  sx={{
                    mt: 2,
                    bgcolor: alpha(theme.palette.primary.main, 0.03),
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                    borderRadius: '12px !important',
                    '&::before': { display: 'none' },
                    '&.Mui-expanded': { margin: '16px 0 0 0' },
                    boxShadow: 'none',
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{
                      borderRadius: 3,
                      '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
                    }}
                  >
                    <ScienceIcon sx={{ color: theme.palette.primary.main, fontSize: 20 }} />
                    <Typography variant="subtitle2" fontWeight={600}>
                      Simulador de Cenários (What-If)
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      Injete transações fictícias e veja o impacto sem afetar seus dados
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <Stack spacing={2}>
                      {mockEntries.map((entry) => (
                        <Stack
                          key={entry.id}
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={1.5}
                          alignItems={{ sm: 'flex-start' }}
                          sx={{
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: alpha(theme.palette.background.paper, 0.6),
                            border: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
                          }}
                        >
                          <TextField
                            select
                            label="Tipo"
                            value={entry.entryType}
                            onChange={(e) => updateMockEntry(entry.id, 'entryType', e.target.value)}
                            size="small"
                            sx={{ minWidth: 130, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                          >
                            <MenuItem value="Receita">💚 Receita</MenuItem>
                            <MenuItem value="Despesa">🔴 Despesa</MenuItem>
                          </TextField>
                          <TextField
                            label="Valor (R$)"
                            type="number"
                            value={entry.amount}
                            onChange={(e) => updateMockEntry(entry.id, 'amount', e.target.value)}
                            size="small"
                            inputProps={{ min: 0, step: 0.01 }}
                            sx={{ minWidth: 130, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                          />
                          <TextField
                            label="Data"
                            type="date"
                            value={entry.date}
                            onChange={(e) => updateMockEntry(entry.id, 'date', e.target.value)}
                            size="small"
                            InputLabelProps={{ shrink: true }}
                            sx={{ minWidth: 150, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                          />
                          <TextField
                            label="Descrição"
                            value={entry.description}
                            onChange={(e) => updateMockEntry(entry.id, 'description', e.target.value)}
                            size="small"
                            sx={{ flex: 1, minWidth: 150, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                          />
                          {mockEntries.length > 1 && (
                            <Tooltip title="Remover" arrow>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => removeMockEntry(entry.id)}
                                sx={{ mt: { xs: 0, sm: 0.5 } }}
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {entry.entryType === 'Receita' && (
                            <Tooltip title="Salvar como Meta de Sprint" arrow>
                              <Button
                                size="small"
                                variant="outlined"
                                color="success"
                                startIcon={<RocketLaunchIcon fontSize="small" />}
                                onClick={() => handleSaveGoal(entry)}
                                disabled={createGoalMutation.isPending || !entry.amount || !entry.description}
                                sx={{ textTransform: 'none', borderRadius: 2, height: 38, mt: { xs: 0, sm: 0.5 } }}
                              >
                                Meta de Sprint
                              </Button>
                            </Tooltip>
                          )}
                        </Stack>
                      ))}

                      <Stack direction="row" spacing={1.5} justifyContent="flex-end" flexWrap="wrap">
                        <Button
                          size="small"
                          startIcon={<AddCircleOutlineIcon />}
                          onClick={addMockEntry}
                          sx={{ borderRadius: 2, textTransform: 'none' }}
                        >
                          Adicionar Transação
                        </Button>

                        {simulationResult && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="secondary"
                            onClick={handleClearSimulation}
                            sx={{ borderRadius: 2, textTransform: 'none' }}
                          >
                            Limpar Simulação
                          </Button>
                        )}

                        <Button
                          size="small"
                          variant="contained"
                          onClick={handleSimulate}
                          disabled={simulateMutation.isPending || mockEntries.every(e => !e.amount || !e.description)}
                          startIcon={simulateMutation.isPending ? <CircularProgress size={16} /> : <ScienceIcon />}
                          sx={{
                            borderRadius: 2,
                            textTransform: 'none',
                            boxShadow: `0 4px 14px 0 ${alpha(theme.palette.primary.main, 0.39)}`,
                            '&:hover': {
                              boxShadow: `0 6px 20px 0 ${alpha(theme.palette.primary.main, 0.5)}`,
                            },
                          }}
                        >
                          Aplicar Simulação
                        </Button>
                      </Stack>
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              </>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} lg={4}>
        <Card
          sx={{
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: `0 4px 20px ${alpha(theme.palette.common.black, 0.1)}`,
          }}
        >
          <CardHeader
            avatar={<PieChartIcon />}
            title="Despesas por Categoria"
            titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
          />
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <RechartsPie>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => entry.name}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((_entry, _index) => (
                    <Cell key={`cell-${_index}`} fill={COLORS[_index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value: any) => formatBRL(value)}
                  contentStyle={{
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 8,
                  }}
                />
              </RechartsPie>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
