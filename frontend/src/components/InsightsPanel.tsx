import React, { useEffect, useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    Skeleton,
    useTheme,
    Alert,
    AlertTitle,
    Chip
} from '@mui/material';
import {
    AutoAwesome as AIIcon,
    TrendingUp,
    WarningAmber,
    ArrowForward,
    Savings
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { analysisService, FinancialSummary } from '../services/analysisService';

interface InsightsPanelProps {
    dashboardId: string;
}

export const InsightsPanel: React.FC<InsightsPanelProps> = ({ dashboardId }) => {
    const theme = useTheme();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<FinancialSummary | null>(null);
    const [aiInsight, setAiInsight] = useState<string | null>(null);
    const [generatingAI, setGeneratingAI] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                // Busca resumo algorítmico (rápido)
                const summary = await analysisService.getSummary(dashboardId);
                setData(summary);
            } catch (error) {
                console.error('Failed to fetch analysis data', error);
            } finally {
                setLoading(false);
            }
        };

        if (dashboardId) {
            fetchData();
        }
    }, [dashboardId]);

    const handleGenerateInsights = async () => {
        try {
            setGeneratingAI(true);
            const insights = await analysisService.getInsights(dashboardId);
            setAiInsight(insights.insights);
        } catch (e) {
            console.warn('AI Insights failed to load', e);
        } finally {
            setGeneratingAI(false);
        }
    };

    if (loading) {
        return (
            <Card sx={{ height: '100%' }}>
                <CardContent>
                    <Box display="flex" alignItems="center" mb={2}>
                        <Skeleton variant="circular" width={40} height={40} />
                        <Skeleton variant="text" width="60%" height={32} sx={{ ml: 2 }} />
                    </Box>
                    <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 2, mb: 2 }} />
                    <Skeleton variant="text" width="80%" />
                    <Skeleton variant="text" width="40%" />
                </CardContent>
            </Card>
        );
    }

    if (!data) return null;

    return (
        <Card sx={{
            height: '100%',
            background: theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.4) 100%)'
                : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            backdropFilter: 'blur(10px)',
            border: `1px solid ${theme.palette.divider}`,
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Decorative background circle */}
            <Box sx={{
                position: 'absolute',
                top: -20,
                right: -20,
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: theme.palette.mode === 'dark'
                    ? 'radial-gradient(circle, rgba(124, 58, 237, 0.1) 0%, rgba(0,0,0,0) 70%)'
                    : 'radial-gradient(circle, rgba(124, 58, 237, 0.05) 0%, rgba(0,0,0,0) 70%)',
                zIndex: 0
            }} />

            <CardContent sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                        <Box sx={{
                            p: 1,
                            borderRadius: '12px',
                            bgcolor: theme.palette.mode === 'dark' ? 'rgba(124, 58, 237, 0.2)' : 'rgba(124, 58, 237, 0.1)',
                            color: theme.palette.primary.main,
                            display: 'flex'
                        }}>
                            <AIIcon />
                        </Box>
                        <Typography variant="h6" fontWeight="bold">
                            Insights Financeiros
                        </Typography>
                    </Box>

                    {data.savingsRate > 20 && (
                        <Chip
                            icon={<Savings sx={{ fontSize: '1rem !important' }} />}
                            label="Ótima Poupança"
                            color="success"
                            size="small"
                            variant="outlined"
                        />
                    )}
                </Box>

                {/* AI Summary Box */}
                {aiInsight ? (
                    <Box sx={{
                        p: 2,
                        mb: 3,
                        borderRadius: 3,
                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(124, 58, 237, 0.1)' : '#f5f3ff',
                        border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(124, 58, 237, 0.2)' : '#ddd6fe'}`,
                    }}>
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line', fontStyle: 'italic' }}>
                            "{aiInsight}"
                        </Typography>
                    </Box>
                ) : (
                    <Button
                        variant="outlined"
                        startIcon={<AIIcon />}
                        onClick={handleGenerateInsights}
                        disabled={generatingAI}
                        sx={{ mb: 3, borderRadius: 2 }}
                    >
                        {generatingAI ? 'Analisando...' : 'Gerar Insights com IA'}
                    </Button>
                )}

                {/* Critical Alerts */}
                <Box flex={1}>
                    {data.savingsRate < 0 && (
                        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
                            <AlertTitle>Atenção aos Gastos</AlertTitle>
                            Você gastou mais do que recebeu neste mês.
                        </Alert>
                    )}

                    {data.unusualTransactions.length > 0 && (
                        <Alert severity="info" icon={<WarningAmber />} sx={{ mb: 2, borderRadius: 2 }}>
                            <AlertTitle>Gastos Atípicos Detectados</AlertTitle>
                            Detectamos {data.unusualTransactions.length} transações incomuns.
                        </Alert>
                    )}

                    {data.alerts.slice(0, 2).map((alert, index) => (
                        <Box key={index} display="flex" alignItems="center" gap={1} mb={1}>
                            <TrendingUp fontSize="small" color="primary" />
                            <Typography variant="body2" color="text.secondary">
                                {alert}
                            </Typography>
                        </Box>
                    ))}
                </Box>

                <Button
                    variant="contained"
                    endIcon={<ArrowForward />}
                    fullWidth
                    onClick={() => navigate(`/dashboard/${dashboardId}/analise`)}
                    sx={{
                        mt: 2,
                        background: theme.palette.gradients.primary
                    }}
                >
                    Ver Análise Completa
                </Button>
            </CardContent>
        </Card>
    );
};
