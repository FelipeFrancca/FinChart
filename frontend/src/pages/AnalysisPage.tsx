import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Container,
    Grid,
    Paper,
    Typography,
    CircularProgress,
    Button,
    Alert,
    Card,
    CardContent,
    useTheme,
    TextField,
    IconButton,
    Chip,
    alpha,
    Skeleton,
    Collapse,
    Tooltip,
} from '@mui/material';
import {
    Refresh,
    AutoAwesome,
    Send,
    Warning,
    CheckCircle,
    ErrorOutline,
    TrendingUp,
    TrendingDown,
    AccountBalanceWallet,
    Flag,
    Receipt,
    Add,
    ExpandMore,
    ExpandLess,
    Assessment,
    Chat as ChatIcon,
    EventRepeat,
} from '@mui/icons-material';
import PageHeader from '../components/PageHeader';
import { SpendingAnalysis } from '../components/SpendingAnalysis';
import {
    analysisService,
    FinancialSummary,
    AuditResponse,
    MissingRecurrence,
    ChatMessage,
} from '../services/analysisService';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ReactMarkdown from 'react-markdown';

// ─── Subcomponentes ──────────────────────────────────────────────────

/** Card de resumo financeiro */
const SummaryCard: React.FC<{
    label: string;
    value: string;
    color: string;
    icon: React.ReactNode;
    subtitle?: string;
}> = ({ label, value, color, icon, subtitle }) => {
    const theme = useTheme();
    return (
        <Card
            sx={{
                background: alpha(color, theme.palette.mode === 'dark' ? 0.15 : 0.08),
                border: `1px solid ${alpha(color, 0.2)}`,
                borderRadius: 3,
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: `0 8px 24px ${alpha(color, 0.15)}`,
                },
            }}
        >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <Box sx={{ color, display: 'flex' }}>{icon}</Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
                        {label}
                    </Typography>
                </Box>
                <Typography variant="h5" fontWeight="bold" sx={{ color }}>
                    {value}
                </Typography>
                {subtitle && (
                    <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
                        {subtitle}
                    </Typography>
                )}
            </CardContent>
        </Card>
    );
};

/** Painel de recorrências faltantes */
const MissingRecurrencesPanel: React.FC<{
    items: MissingRecurrence[];
    onCreateTransaction: (item: MissingRecurrence) => void;
}> = ({ items, onCreateTransaction }) => {
    const theme = useTheme();

    if (items.length === 0) {
        return (
            <Paper
                sx={{
                    p: 3,
                    borderRadius: 3,
                    border: `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
                    background: alpha(theme.palette.success.main, 0.05),
                }}
            >
                <Box display="flex" alignItems="center" gap={1}>
                    <CheckCircle color="success" />
                    <Typography fontWeight={600} color="success.main">
                        Todas as recorrências do mês foram lançadas
                    </Typography>
                </Box>
            </Paper>
        );
    }

    return (
        <Paper
            sx={{
                p: 3,
                borderRadius: 3,
                border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
                background: alpha(theme.palette.warning.main, 0.03),
            }}
        >
            <Box display="flex" alignItems="center" gap={1} mb={2}>
                <EventRepeat color="warning" />
                <Typography variant="h6" fontWeight="bold">
                    Lançamentos Pendentes
                </Typography>
                <Chip
                    label={`${items.length} pendente${items.length > 1 ? 's' : ''}`}
                    size="small"
                    color="warning"
                    sx={{ ml: 'auto' }}
                />
            </Box>

            <Box display="flex" flexDirection="column" gap={1.5}>
                {items.map((item) => (
                    <Box
                        key={item.recurrenceId}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            p: 2,
                            borderRadius: 2,
                            bgcolor: item.isPastDue
                                ? alpha(theme.palette.error.main, 0.08)
                                : alpha(theme.palette.warning.main, 0.05),
                            border: `1px solid ${alpha(
                                item.isPastDue ? theme.palette.error.main : theme.palette.warning.main,
                                0.15
                            )}`,
                        }}
                    >
                        <Box flex={1} minWidth={0}>
                            <Box display="flex" alignItems="center" gap={1}>
                                {item.isPastDue ? (
                                    <ErrorOutline fontSize="small" color="error" />
                                ) : (
                                    <Warning fontSize="small" color="warning" />
                                )}
                                <Typography fontWeight={600} noWrap>
                                    {item.description}
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                                {item.category} • Esperado dia {item.expectedDay}
                                {item.isPastDue && ` • ${item.daysOverdue} dias de atraso`}
                            </Typography>
                        </Box>
                        <Typography fontWeight="bold" color={item.entryType === 'Despesa' ? 'error.main' : 'success.main'}>
                            R$ {item.amount.toFixed(2)}
                        </Typography>
                        <Tooltip title="Criar lançamento com estes dados">
                            <IconButton
                                size="small"
                                color="primary"
                                onClick={() => onCreateTransaction(item)}
                                sx={{
                                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.2) },
                                }}
                            >
                                <Add fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                ))}
            </Box>
        </Paper>
    );
};

/** Chat com IA */
const AIChat: React.FC<{ dashboardId: string }> = ({ dashboardId }) => {
    const theme = useTheme();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages]);

    const sendMessage = useCallback(async (text?: string) => {
        const msg = text || input.trim();
        if (!msg || loading) return;

        const userMsg: ChatMessage = { role: 'user', content: msg };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setLoading(true);

        try {
            const result = await analysisService.chatWithAI(dashboardId, msg, messages);
            setMessages([...newMessages, { role: 'assistant', content: result.response }]);
        } catch {
            setMessages([
                ...newMessages,
                { role: 'assistant', content: '❌ Erro ao processar sua pergunta. Tente novamente.' },
            ]);
        } finally {
            setLoading(false);
        }
    }, [input, loading, messages, dashboardId]);

    const suggestions = [
        'Como estou financeiramente neste mês?',
        'Onde posso cortar gastos?',
        'Vou conseguir bater minhas metas?',
        'Quais lançamentos estou esquecendo?',
        'Me dê um plano para economizar mais',
    ];

    return (
        <Paper
            sx={{
                borderRadius: 3,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                height: 500,
            }}
        >
            {/* Header */}
            <Box
                sx={{
                    p: 2,
                    background: theme.palette.mode === 'dark'
                        ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(124, 58, 237, 0.05) 100%)'
                        : 'linear-gradient(135deg, #f3e8ff 0%, #ffffff 100%)',
                    borderBottom: `1px solid ${theme.palette.divider}`,
                }}
            >
                <Box display="flex" alignItems="center" gap={1}>
                    <AutoAwesome color="primary" fontSize="small" />
                    <Typography variant="subtitle1" fontWeight="bold" color="primary.main">
                        Consultor Financeiro IA
                    </Typography>
                    <Chip
                        label="Contexto completo"
                        size="small"
                        variant="outlined"
                        color="primary"
                        sx={{ ml: 'auto', fontSize: 11 }}
                    />
                </Box>
            </Box>

            {/* Messages */}
            <Box
                sx={{
                    flex: 1,
                    overflowY: 'auto',
                    p: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                }}
            >
                {messages.length === 0 ? (
                    <Box textAlign="center" py={4}>
                        <ChatIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                        <Typography color="text.secondary" mb={3}>
                            Pergunte qualquer coisa sobre suas finanças. A IA tem acesso completo
                            às suas transações, metas, orçamentos e recorrências.
                        </Typography>
                        <Box display="flex" flexWrap="wrap" gap={1} justifyContent="center">
                            {suggestions.map((s) => (
                                <Chip
                                    key={s}
                                    label={s}
                                    variant="outlined"
                                    size="small"
                                    clickable
                                    onClick={() => sendMessage(s)}
                                    sx={{
                                        borderRadius: 2,
                                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) },
                                    }}
                                />
                            ))}
                        </Box>
                    </Box>
                ) : (
                    messages.map((msg, i) => (
                        <Box
                            key={i}
                            sx={{
                                display: 'flex',
                                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            }}
                        >
                            <Paper
                                elevation={0}
                                sx={{
                                    p: 2,
                                    maxWidth: '85%',
                                    borderRadius: 2.5,
                                    bgcolor:
                                        msg.role === 'user'
                                            ? 'primary.main'
                                            : alpha(theme.palette.text.primary, 0.06),
                                    color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
                                    '& p': { m: 0, mb: 1, '&:last-child': { mb: 0 } },
                                    '& ul, & ol': { mt: 0.5, mb: 1, pl: 2.5 },
                                    '& li': { mb: 0.3 },
                                    '& strong': { fontWeight: 700 },
                                    '& h1, & h2, & h3, & h4': { mt: 1, mb: 0.5 },
                                }}
                            >
                                {msg.role === 'assistant' ? (
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                ) : (
                                    <Typography variant="body2">{msg.content}</Typography>
                                )}
                            </Paper>
                        </Box>
                    ))
                )}
                {loading && (
                    <Box display="flex" alignItems="center" gap={1}>
                        <CircularProgress size={16} />
                        <Typography variant="body2" color="text.secondary">
                            Analisando seus dados...
                        </Typography>
                    </Box>
                )}
                <div ref={messagesEndRef} />
            </Box>

            {/* Input */}
            <Box
                sx={{
                    p: 2,
                    borderTop: `1px solid ${theme.palette.divider}`,
                    display: 'flex',
                    gap: 1,
                }}
            >
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Pergunte sobre suas finanças..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    disabled={loading}
                    sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2 },
                    }}
                />
                <IconButton
                    color="primary"
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || loading}
                    sx={{
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.2) },
                    }}
                >
                    <Send />
                </IconButton>
            </Box>
        </Paper>
    );
};

// ─── Página Principal ────────────────────────────────────────────────

export const AnalysisPage: React.FC = () => {
    const { dashboardId } = useParams<{ dashboardId: string }>();
    const navigate = useNavigate();
    const theme = useTheme();

    // States
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [data, setData] = useState<FinancialSummary | null>(null);
    const [audit, setAudit] = useState<AuditResponse | null>(null);
    const [auditLoading, setAuditLoading] = useState(false);
    const [missing, setMissing] = useState<MissingRecurrence[]>([]);
    const [showSpending, setShowSpending] = useState(false);

    // Load summary + missing recurrences
    const fetchData = useCallback(async () => {
        if (!dashboardId) return;
        try {
            setSummaryLoading(true);
            const [summaryRes, missingRes] = await Promise.all([
                analysisService.getSummary(dashboardId).catch(() => null),
                analysisService.getMissingRecurrences(dashboardId).catch(() => []),
            ]);
            if (summaryRes) setData(summaryRes);
            setMissing(missingRes);
        } finally {
            setSummaryLoading(false);
        }
    }, [dashboardId]);

    // Load AI audit
    const fetchAudit = useCallback(async () => {
        if (!dashboardId) return;
        try {
            setAuditLoading(true);
            const auditRes = await analysisService.getAudit(dashboardId);
            setAudit(auditRes);
        } catch (error) {
            console.error('Failed to generate audit', error);
        } finally {
            setAuditLoading(false);
        }
    }, [dashboardId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto-generate audit on first load
    useEffect(() => {
        if (!summaryLoading && dashboardId && !audit && !auditLoading) {
            fetchAudit();
        }
    }, [summaryLoading, dashboardId]);

    const handleCreateTransaction = (item: MissingRecurrence) => {
        // Navigate to transactions page with pre-filled data in query params
        const params = new URLSearchParams({
            prefill: 'true',
            description: item.description,
            amount: item.amount.toString(),
            category: item.category,
            entryType: item.entryType,
            flowType: item.flowType,
            ...(item.subcategory ? { subcategory: item.subcategory } : {}),
        });
        navigate(`/dashboard/${dashboardId}?${params.toString()}`);
    };

    if (!dashboardId) return <Alert severity="error">Dashboard não encontrado</Alert>;
    if (summaryLoading) return <LoadingSkeleton />;

    return (
        <Container maxWidth="xl" sx={{ py: 3 }}>
            <PageHeader
                title="Auditoria Financeira Inteligente"
                subtitle="Análise completa das suas finanças com IA — metas, orçamentos, recorrências e recomendações"
                action={
                    <Button
                        startIcon={<Refresh />}
                        onClick={() => { fetchData(); fetchAudit(); }}
                        variant="outlined"
                    >
                        Atualizar
                    </Button>
                }
            />

            <Grid container spacing={3}>
                {/* Cards de Resumo */}
                {data && (
                    <Grid item xs={12}>
                        <Grid container spacing={2}>
                            <Grid item xs={6} md={3}>
                                <SummaryCard
                                    label="Receita"
                                    value={`R$ ${data.totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                    color={theme.palette.success.main}
                                    icon={<TrendingUp />}
                                />
                            </Grid>
                            <Grid item xs={6} md={3}>
                                <SummaryCard
                                    label="Despesas"
                                    value={`R$ ${data.totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                    color={theme.palette.error.main}
                                    icon={<TrendingDown />}
                                />
                            </Grid>
                            <Grid item xs={6} md={3}>
                                <SummaryCard
                                    label="Saldo"
                                    value={`R$ ${data.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                    color={data.balance >= 0 ? theme.palette.success.main : theme.palette.error.main}
                                    icon={<AccountBalanceWallet />}
                                />
                            </Grid>
                            <Grid item xs={6} md={3}>
                                <SummaryCard
                                    label="Taxa de Poupança"
                                    value={`${data.savingsRate.toFixed(1)}%`}
                                    color={
                                        data.savingsRate > 20
                                            ? theme.palette.success.main
                                            : data.savingsRate > 0
                                              ? theme.palette.warning.main
                                              : theme.palette.error.main
                                    }
                                    icon={<Flag />}
                                    subtitle={
                                        data.savingsRate < 10
                                            ? 'Abaixo do recomendado (20%)'
                                            : data.savingsRate >= 20
                                              ? 'Excelente!'
                                              : 'Pode melhorar'
                                    }
                                />
                            </Grid>
                        </Grid>
                    </Grid>
                )}

                {/* Recorrências Faltantes */}
                <Grid item xs={12}>
                    <MissingRecurrencesPanel
                        items={missing}
                        onCreateTransaction={handleCreateTransaction}
                    />
                </Grid>

                {/* Auditoria IA */}
                <Grid item xs={12} lg={7}>
                    <Paper
                        elevation={0}
                        sx={{
                            p: 3,
                            borderRadius: 3,
                            border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                            background: theme.palette.mode === 'dark'
                                ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%, rgba(124, 58, 237, 0.02) 100%)'
                                : 'linear-gradient(135deg, #faf5ff 0%, #ffffff 100%)',
                            minHeight: 400,
                        }}
                    >
                        <Box display="flex" alignItems="center" gap={1} mb={2}>
                            <Assessment color="primary" />
                            <Typography variant="h6" fontWeight="bold" color="primary.main">
                                Relatório de Auditoria
                            </Typography>
                            <Button
                                size="small"
                                startIcon={<Refresh />}
                                onClick={fetchAudit}
                                disabled={auditLoading}
                                sx={{ ml: 'auto' }}
                            >
                                Regerar
                            </Button>
                        </Box>

                        {auditLoading ? (
                            <Box>
                                <Box display="flex" alignItems="center" gap={2} mb={3}>
                                    <CircularProgress size={24} />
                                    <Typography color="text.secondary">
                                        A IA está auditando suas finanças — transações, metas, orçamentos, recorrências...
                                    </Typography>
                                </Box>
                                <Skeleton variant="text" width="90%" height={24} />
                                <Skeleton variant="text" width="75%" height={24} />
                                <Skeleton variant="text" width="85%" height={24} />
                                <Skeleton variant="rectangular" height={100} sx={{ mt: 2, borderRadius: 2 }} />
                                <Skeleton variant="text" width="60%" height={24} sx={{ mt: 2 }} />
                                <Skeleton variant="text" width="80%" height={24} />
                            </Box>
                        ) : audit ? (
                            <Box
                                sx={{
                                    '& p': { mb: 1.5, lineHeight: 1.7 },
                                    '& h1': { fontSize: '1.3rem', fontWeight: 700, mt: 2.5, mb: 1 },
                                    '& h2': { fontSize: '1.15rem', fontWeight: 700, mt: 2, mb: 1 },
                                    '& h3': { fontSize: '1.05rem', fontWeight: 600, mt: 1.5, mb: 0.5 },
                                    '& ul, & ol': { pl: 2.5, mb: 1.5 },
                                    '& li': { mb: 0.5, lineHeight: 1.6 },
                                    '& strong': { fontWeight: 700 },
                                    '& hr': { my: 2, borderColor: alpha(theme.palette.divider, 0.5) },
                                }}
                            >
                                <ReactMarkdown>{audit.auditText}</ReactMarkdown>
                            </Box>
                        ) : (
                            <Box textAlign="center" py={4}>
                                <Typography color="text.secondary" mb={2}>
                                    Não foi possível gerar a auditoria. Verifique se as chaves de IA estão configuradas.
                                </Typography>
                                <Button
                                    variant="contained"
                                    startIcon={<AutoAwesome />}
                                    onClick={fetchAudit}
                                >
                                    Tentar Novamente
                                </Button>
                            </Box>
                        )}
                    </Paper>
                </Grid>

                {/* Chat com IA */}
                <Grid item xs={12} lg={5}>
                    <AIChat dashboardId={dashboardId} />
                </Grid>

                {/* Detalhamento de Gastos (colapsável) */}
                {data && (
                    <Grid item xs={12}>
                        <Button
                            fullWidth
                            variant="text"
                            onClick={() => setShowSpending(!showSpending)}
                            endIcon={showSpending ? <ExpandLess /> : <ExpandMore />}
                            sx={{
                                py: 1.5,
                                borderRadius: 2,
                                bgcolor: alpha(theme.palette.text.primary, 0.03),
                                mb: 1,
                            }}
                        >
                            <Receipt sx={{ mr: 1 }} />
                            Detalhamento de Gastos e Tendências
                        </Button>
                        <Collapse in={showSpending}>
                            <SpendingAnalysis data={data} />
                        </Collapse>
                    </Grid>
                )}
            </Grid>
        </Container>
    );
};

export default AnalysisPage;
