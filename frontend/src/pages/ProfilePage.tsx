import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Tabs,
  Tab,
  Box,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  FormGroup,
  Alert,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  InputAdornment,
  IconButton,
  Divider,
  Chip,
} from '@mui/material';
import {
  Edit as EditIcon,
  PhotoCamera,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Visibility,
  VisibilityOff,
  Google as GoogleIcon,
  LinkOff as LinkOffIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/api';
import PageHeader from '../components/PageHeader';
import UserAvatar from '../components/UserAvatar';
import PushNotificationToggle from '../components/PushNotificationToggle';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '../hooks/api/useNotificationPreferences';
import ImapConfigManager from '../components/ImapConfigManager';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`profile-tabpanel-${index}`}
      aria-labelledby={`profile-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function ProfilePage() {
  const { user, reloadUser } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
  });

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Google unlink state
  const [unlinkingGoogle, setUnlinkingGoogle] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const [unlinkSuccess, setUnlinkSuccess] = useState(false);

  // Sync formData with user when user loads
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
      });
    }
  }, [user]);

  // API hooks
  const { data: preferences, isLoading: loadingPreferences } = useNotificationPreferences();
  const updatePreferences = useUpdateNotificationPreferences();

  // Local state for preferences (synced with API)
  const [localPreferences, setLocalPreferences] = useState({
    emailBudgetAlerts: true,
    emailGoalMilestones: true,
    emailWeeklySummary: true,
    emailMonthlySummary: true,
    inAppBudgetAlerts: true,
    inAppGoalMilestones: true,
    inAppDashboardActivity: true,
  });

  // Sync local state with API data
  useEffect(() => {
    if (preferences) {
      setLocalPreferences({
        emailBudgetAlerts: preferences.emailBudgetAlerts,
        emailGoalMilestones: preferences.emailGoalMilestones,
        emailWeeklySummary: preferences.emailWeeklySummary,
        emailMonthlySummary: preferences.emailMonthlySummary,
        inAppBudgetAlerts: preferences.inAppBudgetAlerts,
        inAppGoalMilestones: preferences.inAppGoalMilestones,
        inAppDashboardActivity: preferences.inAppDashboardActivity,
      });
    }
  }, [preferences]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Call API to update user profile
      await authService.updateUser({
        name: formData.name,
        // avatar can be added later when file upload is implemented
      });

      console.log('[ProfilePage] Profile updated successfully');

      // Reload user in AuthContext to sync the new data
      await reloadUser();

      setEditing(false);
      setSaveSuccess(true);

      // Hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error('[ProfilePage] Error updating profile:', error);
      setSaveError(error.response?.data?.error?.message || error.message || 'Erro ao atualizar perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationChange = (key: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    // Update local state immediately for UI responsiveness
    setLocalPreferences({ ...localPreferences, [key]: newValue });
    // Update via API
    updatePreferences.mutate({ [key]: newValue });
  };

  const handleSavePreferences = () => {
    updatePreferences.mutate(localPreferences);
  };

  const handlePasswordChange = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);

    // Validations
    if (!passwordData.currentPassword) {
      setPasswordError('Digite sua senha atual');
      return;
    }
    if (!passwordData.newPassword) {
      setPasswordError('Digite a nova senha');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      setPasswordError('A nova senha deve ter pelo menos 8 caracteres');
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(passwordData.newPassword)) {
      setPasswordError('A senha deve conter pelo menos uma letra maiúscula, uma minúscula e um número');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('As senhas não coincidem');
      return;
    }

    setPasswordChanging(true);

    try {
      await authService.changePassword(passwordData.currentPassword, passwordData.newPassword);
      setPasswordSuccess(true);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });

      // Hide success message after 5 seconds
      setTimeout(() => setPasswordSuccess(false), 5000);
    } catch (error: any) {
      console.error('[ProfilePage] Error changing password:', error);
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message;
      setPasswordError(errorMessage || 'Erro ao alterar senha');
    } finally {
      setPasswordChanging(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    if (!window.confirm('Tem certeza que deseja desvincular sua conta Google? Você precisará usar email e senha para fazer login.')) {
      return;
    }

    setUnlinkingGoogle(true);
    setUnlinkError(null);
    setUnlinkSuccess(false);

    try {
      await authService.unlinkGoogle();
      setUnlinkSuccess(true);
      await reloadUser();
      setTimeout(() => setUnlinkSuccess(false), 5000);
    } catch (error: any) {
      console.error('[ProfilePage] Error unlinking Google:', error);
      const errorMessage = error.response?.data?.error?.message || error.message;
      setUnlinkError(errorMessage || 'Erro ao desvincular conta Google');
    } finally {
      setUnlinkingGoogle(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <PageHeader
        title="Meu Perfil"
        breadcrumbs={[
          { label: 'Dashboards', to: '/dashboards' },
          { label: 'Perfil' },
        ]}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Gerencie suas informações pessoais e preferências
      </Typography>

      <Paper sx={{ mt: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tab label="Informações Pessoais" />
          <Tab label="Notificações" />
          <Tab label="Segurança" />
          <Tab label="Automações / IMAP" />
        </Tabs>

        {/* Personal Info Tab */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ px: 3 }}>
            <Grid container spacing={4}>
              {/* Avatar Section */}
              <Grid item xs={12} md={4}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <UserAvatar user={user || undefined} size="large" sx={{ width: 120, height: 120, fontSize: 48 }} />
                  <Button variant="outlined" startIcon={<PhotoCamera />} size="small">
                    Alterar Foto
                  </Button>
                  <Typography variant="caption" color="text.secondary" textAlign="center">
                    JPG, PNG ou GIF. Máximo 2MB.
                  </Typography>
                </Box>
              </Grid>

              {/* Form Section */}
              <Grid item xs={12} md={8}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6">Dados Pessoais</Typography>
                  {!editing && (
                    <Button startIcon={<EditIcon />} onClick={() => setEditing(true)}>
                      Editar
                    </Button>
                  )}
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <TextField
                    label="Nome Completo"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!editing}
                    fullWidth
                  />
                  <TextField
                    label="Email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={!editing}
                    fullWidth
                    type="email"
                  />

                  {saveSuccess && (
                    <Alert severity="success">
                      Perfil atualizado com sucesso!
                    </Alert>
                  )}

                  {saveError && (
                    <Alert severity="error">
                      {saveError}
                    </Alert>
                  )}

                  {editing && (
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={handleSave}
                        disabled={saving}
                      >
                        {saving ? 'Salvando...' : 'Salvar Alterações'}
                      </Button>
                      <Button
                        variant="outlined"
                        startIcon={<CancelIcon />}
                        onClick={() => {
                          setEditing(false);
                          setSaveError(null);
                          setSaveSuccess(false);
                        }}
                        disabled={saving}
                      >
                        Cancelar
                      </Button>
                    </Box>
                  )}
                </Box>
              </Grid>
            </Grid>
          </Box>
        </TabPanel>

        {/* Notifications Tab */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ px: 3 }}>
            <Typography variant="h6" gutterBottom>
              Preferências de Notificações
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Configure como e quando você deseja receber notificações
            </Typography>

            {/* Push Notifications Toggle */}
            <Box sx={{ mb: 3 }}>
              <PushNotificationToggle />
            </Box>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                      Notificações por Email
                    </Typography>
                    <FormGroup>
                      <FormControlLabel
                        control={<Switch checked={localPreferences.emailBudgetAlerts} onChange={handleNotificationChange('emailBudgetAlerts')} />}
                        label="Alertas de orçamento"
                      />
                      <FormControlLabel
                        control={<Switch checked={localPreferences.emailGoalMilestones} onChange={handleNotificationChange('emailGoalMilestones')} />}
                        label="Marcos de metas financeiras"
                      />
                      <FormControlLabel
                        control={<Switch checked={localPreferences.emailWeeklySummary} onChange={handleNotificationChange('emailWeeklySummary')} />}
                        label="Resumo semanal"
                      />
                      <FormControlLabel
                        control={<Switch checked={localPreferences.emailMonthlySummary} onChange={handleNotificationChange('emailMonthlySummary')} />}
                        label="Resumo mensal"
                      />
                    </FormGroup>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                      Notificações no App
                    </Typography>
                    <FormGroup>
                      <FormControlLabel
                        control={<Switch checked={localPreferences.inAppBudgetAlerts} onChange={handleNotificationChange('inAppBudgetAlerts')} />}
                        label="Alertas de orçamento"
                      />
                      <FormControlLabel
                        control={<Switch checked={localPreferences.inAppGoalMilestones} onChange={handleNotificationChange('inAppGoalMilestones')} />}
                        label="Marcos de metas"
                      />
                      <FormControlLabel
                        control={<Switch checked={localPreferences.inAppDashboardActivity} onChange={handleNotificationChange('inAppDashboardActivity')} />}
                        label="Atividade do dashboard"
                      />
                    </FormGroup>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {loadingPreferences && (
              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <CircularProgress size={24} />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                  Carregando preferências...
                </Typography>
              </Box>
            )}

            <Box sx={{ mt: 3 }}>
              <Button
                variant="contained"
                onClick={handleSavePreferences}
                disabled={updatePreferences.isPending}
              >
                {updatePreferences.isPending ? 'Salvando...' : 'Salvar Preferências'}
              </Button>
            </Box>
          </Box>
        </TabPanel>

        {/* Security Tab */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ px: 3, maxWidth: 600 }}>
            <Typography variant="h6" gutterBottom>
              Alterar Senha
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              Por segurança, você precisará confirmar sua senha atual para definir uma nova.
            </Alert>

            {passwordSuccess && (
              <Alert severity="success" sx={{ mb: 3 }}>
                Senha alterada com sucesso!
              </Alert>
            )}

            {passwordError && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {passwordError}
              </Alert>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <TextField
                label="Senha Atual"
                type={showCurrentPassword ? 'text' : 'password'}
                fullWidth
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                disabled={passwordChanging}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        edge="end"
                      >
                        {showCurrentPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Nova Senha"
                type={showNewPassword ? 'text' : 'password'}
                fullWidth
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                disabled={passwordChanging}
                helperText="Mínimo 8 caracteres, com letra maiúscula, minúscula e número"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        edge="end"
                      >
                        {showNewPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Confirmar Nova Senha"
                type={showConfirmPassword ? 'text' : 'password'}
                fullWidth
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                disabled={passwordChanging}
                error={passwordData.confirmPassword.length > 0 && passwordData.newPassword !== passwordData.confirmPassword}
                helperText={
                  passwordData.confirmPassword.length > 0 && passwordData.newPassword !== passwordData.confirmPassword
                    ? 'As senhas não coincidem'
                    : ''
                }
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        edge="end"
                      >
                        {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                variant="contained"
                sx={{ alignSelf: 'flex-start' }}
                onClick={handlePasswordChange}
                disabled={passwordChanging}
              >
                {passwordChanging ? (
                  <>
                    <CircularProgress size={20} sx={{ mr: 1, color: 'inherit' }} />
                    Alterando...
                  </>
                ) : (
                  'Alterar Senha'
                )}
              </Button>
            </Box>

            {/* Linked Accounts Section */}
            <Divider sx={{ my: 4 }} />

            <Typography variant="h6" gutterBottom>
              Contas Vinculadas
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Gerencie as contas externas vinculadas ao seu perfil
            </Typography>

            {unlinkSuccess && (
              <Alert severity="success" sx={{ mb: 3 }}>
                Conta Google desvinculada com sucesso!
              </Alert>
            )}

            {unlinkError && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {unlinkError}
              </Alert>
            )}

            <Card variant="outlined">
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <GoogleIcon sx={{ fontSize: 32, color: '#4285F4' }} />
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600}>
                      Google
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {(user as any)?.hasGoogleLinked
                        ? 'Conta vinculada - você pode fazer login com Google'
                        : 'Nenhuma conta Google vinculada'}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {(user as any)?.hasGoogleLinked ? (
                    <>
                      <Chip
                        icon={<CheckCircleIcon />}
                        label="Vinculada"
                        color="success"
                        size="small"
                      />
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={unlinkingGoogle ? <CircularProgress size={16} /> : <LinkOffIcon />}
                        onClick={handleUnlinkGoogle}
                        disabled={unlinkingGoogle || !(user as any)?.hasPassword}
                      >
                        Desvincular
                      </Button>
                    </>
                  ) : (
                    <Chip label="Não vinculada" size="small" variant="outlined" />
                  )}
                </Box>
              </CardContent>

              {(user as any)?.hasGoogleLinked && !(user as any)?.hasPassword && (
                <Alert severity="warning" sx={{ m: 2, mt: 0 }}>
                  Você precisa definir uma senha antes de desvincular o Google - é sua única forma de login atualmente.
                </Alert>
              )}
            </Card>
          </Box>
        </TabPanel>

        {/* Automations Tab */}
        <TabPanel value={tabValue} index={3}>
          <Box sx={{ px: 3 }}>
            <ImapConfigManager />
          </Box>
        </TabPanel>

      </Paper>
    </Container>
  );
}

