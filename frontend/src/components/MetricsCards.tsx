import { Grid, Card, CardContent, Typography, Box, Tooltip, Skeleton } from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  AccountBalance,
  Shield,
  InfoOutlined,
  CalendarToday,
} from '@mui/icons-material';
import type { StatsSummary, Transaction } from '../types';
import { MetricCardSkeleton } from './LoadingSkeleton';
import { hoverLift, createStaggerDelay } from '../utils/animations';
import { useDailyPacing } from '../hooks/api/useAnalysis';
import { useParams } from 'react-router-dom';

interface MetricsCardsProps {
  stats?: StatsSummary;
  transactions: Transaction[];
  isLoading?: boolean;
}

export default function MetricsCards({ stats, isLoading = false }: MetricsCardsProps) {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const { data: pacing, isLoading: pacingLoading } = useDailyPacing(dashboardId || '');

  // Se estiver carregando ou não tiver stats, mostra skeleton
  if (isLoading || !stats) {
    return <MetricCardSkeleton count={5} />;
  }

  const formatCurrency = (value: number | string) => {
    if (typeof value === 'string') return value;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const metrics = [
    {
      title: 'Receitas Totais',
      value: stats.totalIncome,
      icon: TrendingUp,
      color: 'income.main',
      bg: 'rgba(52, 211, 153, 0.12)',
      tooltip: 'Soma de todas as entradas de dinheiro (salários, vendas, rendimentos, etc.) no período selecionado.',
      subtitle: 'Últimos 30 dias',
    },
    {
      title: 'Despesas Totais',
      value: stats.totalExpense,
      icon: TrendingDown,
      color: 'expense.main',
      bg: 'rgba(248, 113, 113, 0.12)',
      tooltip: 'Soma de todos os gastos (compras, contas, parcelas, etc.) no período selecionado. Não inclui estornos.',
      subtitle: 'Últimos 30 dias',
    },
    {
      title: 'Resultado Líquido',
      value: stats.netResult,
      icon: AccountBalance,
      color: stats.netResult >= 0 ? 'net.main' : 'expense.main',
      bg: stats.netResult >= 0 ? 'rgba(96, 165, 250, 0.12)' : 'rgba(248, 113, 113, 0.12)',
      tooltip: 'Receitas - Despesas = Resultado. Positivo significa que você está economizando, negativo significa gastos acima da renda.',
      subtitle: 'Últimos 30 dias',
    },
    {
      title: 'Margem Saudável',
      value: `${stats.savingsRate.toFixed(0)}%`,
      icon: Shield,
      color: stats.savingsRate >= 20 ? 'success.main' : 'warning.main',
      bg: stats.savingsRate >= 20 ? 'rgba(52, 211, 153, 0.12)' : 'rgba(251, 191, 36, 0.12)',
      tooltip: '(Receitas - Despesas) ÷ Receitas × 100. Indica quanto % da sua renda está sobrando. Acima de 20% é considerado saudável.',
      subtitle: 'Últimos 30 dias',
    },
  ];

  // Determine daily pacing card state
  const pacingIsOverBudget = pacing?.isOverBudget || (pacing?.dailyPacing != null && pacing.dailyPacing <= 0);
  const pacingColor = pacingIsOverBudget ? 'error.main' : 'success.main';
  const pacingBg = pacingIsOverBudget ? 'rgba(248, 113, 113, 0.12)' : 'rgba(52, 211, 153, 0.12)';
  const pacingSubtitle = pacingIsOverBudget
    ? 'Orçamento Estourado'
    : pacing
      ? `${pacing.remainingDays} dia${pacing.remainingDays !== 1 ? 's' : ''} restante${pacing.remainingDays !== 1 ? 's' : ''}`
      : '—';

  return (
    <Grid container spacing={3} sx={{ mb: 4 }}>
      {metrics.map((metric, index) => (
        <Grid item xs={12} sm={6} lg key={index}>
          <Card
            sx={{
              height: '100%',
              bgcolor: metric.bg,
              borderLeft: 3,
              borderColor: metric.color,
              ...hoverLift,
              animation: `slideInUp 400ms cubic-bezier(0.4, 0, 0.2, 1) ${createStaggerDelay(index, 100)}ms both`,
              '@keyframes slideInUp': {
                from: {
                  opacity: 0,
                  transform: 'translateY(20px)'
                },
                to: {
                  opacity: 1,
                  transform: 'translateY(0)'
                },
              },
            }}
          >
            <CardContent>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  mb: 2
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    textTransform="uppercase"
                    fontWeight={600}
                    sx={{ letterSpacing: 0.5 }}
                  >
                    {metric.title}
                  </Typography>
                  <Tooltip title={metric.tooltip} arrow placement="top">
                    <InfoOutlined
                      sx={{
                        fontSize: 14,
                        color: 'text.secondary',
                        cursor: 'help',
                        opacity: 0.7,
                        '&:hover': { opacity: 1 }
                      }}
                    />
                  </Tooltip>
                </Box>
                <Box
                  sx={{
                    p: 1,
                    borderRadius: 2,
                    bgcolor: 'background.paper',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      transform: 'rotate(360deg)',
                    },
                  }}
                >
                  <metric.icon sx={{ color: metric.color, fontSize: 24 }} />
                </Box>
              </Box>
              <Typography
                variant="h4"
                fontWeight={700}
                sx={{
                  color: metric.color,
                  mb: 0.5,
                  fontSize: { xs: '1.75rem', sm: '2rem' },
                }}
              >
                {typeof metric.value === 'number' ? formatCurrency(metric.value) : metric.value}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {metric.subtitle}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}

      {/* Daily Pacing Card */}
      <Grid item xs={12} sm={6} lg>
        <Card
          sx={{
            height: '100%',
            bgcolor: pacingBg,
            borderLeft: 3,
            borderColor: pacingColor,
            ...hoverLift,
            animation: `slideInUp 400ms cubic-bezier(0.4, 0, 0.2, 1) ${createStaggerDelay(4, 100)}ms both`,
            '@keyframes slideInUp': {
              from: { opacity: 0, transform: 'translateY(20px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          <CardContent>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                mb: 2
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  textTransform="uppercase"
                  fontWeight={600}
                  sx={{ letterSpacing: 0.5 }}
                >
                  Cota Diária Livre
                </Typography>
                <Tooltip
                  title="Quanto você pode gastar por dia para fechar o mês dentro do orçamento. Calculado como (Orçamento Livre − Gastos Variáveis) ÷ Dias Restantes."
                  arrow
                  placement="top"
                >
                  <InfoOutlined
                    sx={{
                      fontSize: 14,
                      color: 'text.secondary',
                      cursor: 'help',
                      opacity: 0.7,
                      '&:hover': { opacity: 1 }
                    }}
                  />
                </Tooltip>
              </Box>
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: 'background.paper',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    transform: 'rotate(360deg)',
                  },
                }}
              >
                <CalendarToday sx={{ color: pacingColor, fontSize: 24 }} />
              </Box>
            </Box>

            {pacingLoading ? (
              <>
                <Skeleton variant="text" width="70%" height={40} />
                <Skeleton variant="text" width="50%" height={16} />
              </>
            ) : (
              <>
                <Typography
                  variant="h4"
                  fontWeight={700}
                  sx={{
                    color: pacingColor,
                    mb: 0.5,
                    fontSize: { xs: '1.75rem', sm: '2rem' },
                  }}
                >
                  {pacing ? formatCurrency(pacing.dailyPacing) : '—'}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: pacingIsOverBudget ? 'error.main' : 'text.secondary',
                    fontWeight: pacingIsOverBudget ? 600 : 400,
                  }}
                >
                  {pacingSubtitle}
                </Typography>
              </>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
