import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container,
    Card,
    CardContent,
    CardHeader,
    Button,
    TextField,
    Box,
    Typography,
    Divider,
    Alert,
    CircularProgress,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    IconButton,
} from '@mui/material';
import {
    Settings,
    Save,
    Delete,
    Warning,
    Email,
    LinkOff,
    NetworkCheck,
} from '@mui/icons-material';
import PageHeader from '../components/PageHeader';
import { showSuccess, showErrorWithRetry, showConfirm } from '../utils/notifications';
import { useForm, Controller } from 'react-hook-form';
import {
    useUpdateDashboard,
    useDeleteDashboard,
} from '../hooks/api/useDashboardMembers';
import { useDashboards } from '../hooks/api/useDashboards';
import { useUserImapConfigs, useLinkImapToDashboard } from '../hooks/useImapConfig';
import { imapConfigService } from '../services/imapConfigService';
import { fadeIn } from '../utils/animations';

interface DashboardSettingsFormData {
    title: string;
    description: string;
}

export default function DashboardSettingsPage() {
    const { dashboardId } = useParams<{ dashboardId: string }>();
    const navigate = useNavigate();
    const [isDeleting, setIsDeleting] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);

    // Hooks
    const { data: dashboards = [], isLoading } = useDashboards();
    const updateDashboard = useUpdateDashboard();
    const deleteDashboard = useDeleteDashboard();
    const { data: imapConfigs, isLoading: loadingConfigs } = useUserImapConfigs();
    const linkImapToDashboard = useLinkImapToDashboard();

    // Find current dashboard
    const currentDashboard = dashboards.find((d: any) => d.id === dashboardId);

    const { control, handleSubmit, reset, formState: { isDirty, isSubmitting } } = useForm<DashboardSettingsFormData>({
        defaultValues: {
            title: '',
            description: '',
        }
    });

    // Reset form when dashboard data is loaded
    useEffect(() => {
        if (currentDashboard) {
            reset({
                title: currentDashboard.title || '',
                description: currentDashboard.description || '',
            });
        }
    }, [currentDashboard, reset]);

    const onSubmit = async (data: DashboardSettingsFormData) => {
        try {
            await updateDashboard.mutateAsync({
                id: dashboardId || '',
                updates: data,
            });
            showSuccess('Configurações salvas com sucesso!', { title: 'Salvo!' });
        } catch (error) {
            showErrorWithRetry(error, () => onSubmit(data));
        }
    };

    const handleDeleteDashboard = async () => {
        const result = await showConfirm(
            'Esta ação é irreversível. Todos os dados do dashboard serão permanentemente excluídos, incluindo transações, categorias, contas e membros.',
            {
                title: 'Excluir Dashboard?',
                icon: 'warning',
                confirmButtonText: 'Sim, quero excluir',
                cancelButtonText: 'Cancelar',
            }
        );

        if (result.isConfirmed) {
            const confirmResult = await showConfirm(
                `Tem certeza ABSOLUTA que deseja excluir "${currentDashboard?.title}"? Esta é a última confirmação.`,
                {
                    title: '⚠️ Confirmação Final',
                    icon: 'warning',
                    confirmButtonText: 'Sim, excluir permanentemente',
                    cancelButtonText: 'Não, cancelar',
                }
            );

            if (confirmResult.isConfirmed) {
                setIsDeleting(true);
                try {
                    await deleteDashboard.mutateAsync(dashboardId || '');
                    showSuccess('Dashboard excluído com sucesso.', { title: 'Excluído!' });
                    navigate('/dashboards');
                } catch (error) {
                    showErrorWithRetry(error, () => handleDeleteDashboard());
                } finally {
                    setIsDeleting(false);
                }
            }
        }
    };

    if (isLoading) {
        return (
            <Container maxWidth="md" sx={{ py: 4 }}>
                <PageHeader
                    title="Configurações"
                    breadcrumbs={[
                        { label: 'Dashboards', to: '/dashboards' },
                        { label: 'Configurações' }
                    ]}
                />
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            </Container>
        );
    }

    if (!currentDashboard) {
        return (
            <Container maxWidth="md" sx={{ py: 4 }}>
                <PageHeader
                    title="Configurações"
                    breadcrumbs={[
                        { label: 'Dashboards', to: '/dashboards' },
                        { label: 'Configurações' }
                    ]}
                />
                <Alert severity="error">
                    Dashboard não encontrado.
                </Alert>
            </Container>
        );
    }

    const isOwner = currentDashboard.role === 'OWNER';

    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <PageHeader
                title="Configurações"
                breadcrumbs={[
                    { label: 'Dashboards', to: '/dashboards' },
                    { label: currentDashboard.title, to: `/dashboard/${dashboardId}` },
                    { label: 'Configurações' }
                ]}
            />

            {/* General Settings */}
            <Card sx={{ mb: 4, ...fadeIn }}>
                <CardHeader
                    avatar={<Settings color="primary" />}
                    title="Configurações Gerais"
                    titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                    subheader="Informações básicas do dashboard"
                />
                <CardContent>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <Controller
                                name="title"
                                control={control}
                                rules={{ required: 'Título é obrigatório' }}
                                render={({ field, fieldState: { error } }) => (
                                    <TextField
                                        {...field}
                                        label="Nome do Dashboard"
                                        fullWidth
                                        error={!!error}
                                        helperText={error?.message}
                                        disabled={!isOwner}
                                    />
                                )}
                            />

                            <Controller
                                name="description"
                                control={control}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="Descrição"
                                        fullWidth
                                        multiline
                                        rows={3}
                                        placeholder="Descreva o propósito deste dashboard..."
                                        disabled={!isOwner}
                                    />
                                )}
                            />

                            {isOwner && (
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button
                                        type="submit"
                                        variant="contained"
                                        startIcon={<Save />}
                                        disabled={!isDirty || isSubmitting}
                                    >
                                        {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
                                    </Button>
                                </Box>
                            )}

                            {!isOwner && (
                                <Alert severity="info">
                                    Apenas o proprietário do dashboard pode editar as configurações.
                                </Alert>
                            )}
                        </Box>
                    </form>
                </CardContent>
            </Card>

            {/* IMAP Automation Settings */}
            <Card sx={{ mb: 4, ...fadeIn }}>
                <CardHeader
                    avatar={<Email color="primary" />}
                    title="Automação IMAP"
                    titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                    subheader="Vincule uma ou mais credenciais de e-mail para registrar transações automaticamente"
                />
                <CardContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {loadingConfigs ? (
                            <CircularProgress size={24} />
                        ) : (
                            <>
                                {currentDashboard?.imapConfigurations && currentDashboard.imapConfigurations.length > 0 ? (
                                    <List sx={{ width: '100%', bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                                        {currentDashboard.imapConfigurations.map((config: any) => (
                                            <ListItem key={config.id} divider>
                                                <ListItemText primary={config.emailUser} />
                                                <ListItemSecondaryAction>
                                                    <Button
                                                        size="small"
                                                        startIcon={testingId === config.id ? <CircularProgress size={16} /> : <NetworkCheck />}
                                                        onClick={async () => {
                                                            setTestingId(config.id);
                                                            try {
                                                                const result = await imapConfigService.testConnection({ configId: config.id });
                                                                showSuccess(result.message || 'Conexão bem-sucedida!');
                                                            } catch (error: any) {
                                                                const msg = error.response?.data?.error || error.message || 'Falha na conexão';
                                                                showErrorWithRetry(new Error(msg), () => {});
                                                            } finally {
                                                                setTestingId(null);
                                                            }
                                                        }}
                                                        disabled={testingId !== null}
                                                        sx={{ mr: 1 }}
                                                    >
                                                        Testar
                                                    </Button>
                                                    <IconButton
                                                        edge="end"
                                                        aria-label="desvincular"
                                                        color="error"
                                                        disabled={!isOwner || linkImapToDashboard.isPending}
                                                        onClick={async () => {
                                                            try {
                                                                const newIds = currentDashboard.imapConfigurations
                                                                    .filter((c: any) => c.id !== config.id)
                                                                    .map((c: any) => c.id);
                                                                await linkImapToDashboard.mutateAsync({
                                                                    dashboardId: dashboardId || '',
                                                                    imapConfigurationIds: newIds,
                                                                });
                                                                showSuccess('Conta desvinculada com sucesso!');
                                                            } catch (error) {
                                                                showErrorWithRetry(error, () => {});
                                                            }
                                                        }}
                                                    >
                                                        <LinkOff />
                                                    </IconButton>
                                                </ListItemSecondaryAction>
                                            </ListItem>
                                        ))}
                                    </List>
                                ) : (
                                    <Typography variant="body2" color="text.secondary">
                                        Nenhuma conta vinculada a este dashboard.
                                    </Typography>
                                )}

                                {isOwner && imapConfigs && imapConfigs.length > 0 && (
                                    <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
                                        <TextField
                                            select
                                            size="small"
                                            label="Vincular nova conta"
                                            value=""
                                            onChange={async (e) => {
                                                const selectedId = e.target.value;
                                                if (!selectedId) return;
                                                const currentIds = currentDashboard?.imapConfigurations?.map((c: any) => c.id) || [];
                                                if (currentIds.includes(selectedId)) return;

                                                try {
                                                    await linkImapToDashboard.mutateAsync({
                                                        dashboardId: dashboardId || '',
                                                        imapConfigurationIds: [...currentIds, selectedId],
                                                    });
                                                    showSuccess('Conta vinculada com sucesso!');
                                                } catch (error) {
                                                    showErrorWithRetry(error, () => {});
                                                }
                                            }}
                                            InputLabelProps={{ shrink: true }}
                                            SelectProps={{ native: true, displayEmpty: true }}
                                            sx={{ minWidth: 250 }}
                                        >
                                            <option value="" disabled>Selecione uma conta...</option>
                                            {imapConfigs
                                                .filter(c => !(currentDashboard?.imapConfigurations || []).some((linked: any) => linked.id === c.id))
                                                .map((config) => (
                                                    <option key={config.id} value={config.id}>
                                                        {config.emailUser}
                                                    </option>
                                                ))}
                                        </TextField>
                                    </Box>
                                )}
                            </>
                        )}
                        {!isOwner && (
                            <Alert severity="info">
                                Apenas o proprietário do dashboard pode alterar a automação.
                            </Alert>
                        )}
                        {isOwner && (!imapConfigs || imapConfigs.length === 0) && (
                            <Alert severity="warning">
                                Você ainda não tem contas de e-mail cadastradas. Vá até o seu Perfil para adicionar uma Credencial IMAP.
                            </Alert>
                        )}
                    </Box>
                </CardContent>
            </Card>

            {/* Dashboard Info */}
            <Card sx={{ mb: 4, ...fadeIn }}>
                <CardHeader
                    title="Informações do Dashboard"
                    titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
                />
                <CardContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" color="text.secondary">ID do Dashboard</Typography>
                            <Typography variant="body2" fontFamily="monospace">{dashboardId}</Typography>
                        </Box>
                        <Divider />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" color="text.secondary">Sua permissão</Typography>
                            <Typography variant="body2" fontWeight={600}>
                                {currentDashboard.role === 'OWNER' ? 'Proprietário' :
                                 currentDashboard.role === 'EDITOR' ? 'Editor' : 'Visualizador'}
                            </Typography>
                        </Box>
                        <Divider />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" color="text.secondary">Criado em</Typography>
                            <Typography variant="body2">
                                {currentDashboard.createdAt
                                    ? new Date(currentDashboard.createdAt).toLocaleDateString('pt-BR')
                                    : 'N/A'}
                            </Typography>
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            {/* Danger Zone - Only for owners */}
            {isOwner && (
                <Card sx={{ border: 2, borderColor: 'error.main', ...fadeIn }}>
                    <CardHeader
                        avatar={<Warning color="error" />}
                        title="Zona de Perigo"
                        titleTypographyProps={{ variant: 'h6', fontWeight: 600, color: 'error.main' }}
                        subheader="Ações irreversíveis"
                    />
                    <CardContent>
                        <Alert severity="warning" sx={{ mb: 3 }}>
                            <Typography variant="body2">
                                A exclusão do dashboard é permanente e não pode ser desfeita.
                                Todos os dados associados serão perdidos, incluindo:
                            </Typography>
                            <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                                <li>Todas as transações</li>
                                <li>Categorias e contas</li>
                                <li>Metas e orçamentos</li>
                                <li>Membros e convites</li>
                            </ul>
                        </Alert>

                        <Button
                            variant="contained"
                            color="error"
                            startIcon={<Delete />}
                            onClick={handleDeleteDashboard}
                            disabled={isDeleting}
                        >
                            {isDeleting ? 'Excluindo...' : 'Excluir Dashboard Permanentemente'}
                        </Button>
                    </CardContent>
                </Card>
            )}
        </Container>
    );
}
