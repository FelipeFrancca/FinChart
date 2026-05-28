import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Grid,
  Switch,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Chip
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Email as EmailIcon,
  NetworkCheck as TestIcon
} from '@mui/icons-material';
import { 
  useUserImapConfigs, 
  useCreateImapConfig, 
  useUpdateImapConfig, 
  useDeleteImapConfig 
} from '../hooks/useImapConfig';
import { imapConfigService } from '../services/imapConfigService';

export default function ImapConfigManager() {
  const { data: configs, isLoading } = useUserImapConfigs();
  const createMutation = useCreateImapConfig();
  const updateMutation = useUpdateImapConfig();
  const deleteMutation = useDeleteImapConfig();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    host: 'imap.gmail.com',
    port: 993,
    emailUser: '',
    emailPass: '',
    isActive: true
  });

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleOpenDialog = (config?: any) => {
    if (config) {
      setEditingId(config.id);
      setFormData({
        host: config.host,
        port: config.port,
        emailUser: config.emailUser,
        emailPass: '', // never show password
        isActive: config.isActive
      });
    } else {
      setEditingId(null);
      setFormData({
        host: 'imap.gmail.com',
        port: 993,
        emailUser: '',
        emailPass: '',
        isActive: true
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setTestResult(null);
  };

  const handleSave = () => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData }, {
        onSuccess: () => handleCloseDialog()
      });
    } else {
      createMutation.mutate(formData, {
        onSuccess: () => handleCloseDialog()
      });
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja remover esta credencial de email? Ela será desvinculada de todos os dashboards.')) {
      deleteMutation.mutate(id);
    }
  };

  const toggleStatus = (id: string, currentStatus: boolean) => {
    updateMutation.mutate({ id, data: { isActive: !currentStatus } });
  };

  if (isLoading) {
    return <CircularProgress />;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Credenciais IMAP</Typography>
        <Button 
          variant="contained" 
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Adicionar Email
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" paragraph>
        Adicione contas de email (como o Gmail) para o FinChart ler automaticamente as notificações do seu banco e registrar as transações. Você poderá vincular essas contas aos seus Dashboards.
      </Typography>

      {configs?.length === 0 ? (
        <Alert severity="info">
          Você ainda não cadastrou nenhuma conta de email para automação.
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {configs?.map((config) => (
            <Grid item xs={12} md={6} key={config.id}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <EmailIcon color="primary" />
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {config.emailUser}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {config.host}:{config.port}
                      </Typography>
                    </Box>
                    <Switch 
                      checked={config.isActive} 
                      onChange={() => toggleStatus(config.id, config.isActive)}
                      color="primary"
                    />
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                    <Chip size="small" label={config.isActive ? 'Ativo' : 'Inativo'} color={config.isActive ? 'success' : 'default'} />
                    <Chip size="small" label={`${config.dashboards?.length || 0} dashboard(s) vinculado(s)`} variant="outlined" />
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                    <IconButton size="small" onClick={() => handleOpenDialog(config)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(config.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Dialog para Criar/Editar */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Editar Credencial IMAP' : 'Nova Credencial IMAP'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {formData.host.toLowerCase().includes('gmail') ? (
              <Alert severity="info" icon={false}>
                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                  Passo a Passo para Gerar a Senha de App do Google:
                </Typography>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.875rem' }}>
                  <li>Acesse o painel da conta: <a href="https://myaccount.google.com/" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>myaccount.google.com</a></li>
                  <li>No menu lateral esquerdo, clique na aba <strong>Segurança</strong>.</li>
                  <li>Na seção "Como você faz login no Google", certifique-se de que a <strong>Verificação em duas etapas</strong> está <strong>Ativada</strong>.</li>
                  <li>Na barra de pesquisa no topo da página, digite <strong>Senhas de app</strong> e selecione a opção que aparecer.</li>
                  <li>No campo para selecionar o app, digite um nome como <strong>FinChart-Worker</strong> e clique em <strong>Criar</strong>.</li>
                  <li>Copie a senha de 16 letras exata como aparece e cole abaixo (espaços não importam).</li>
                </ol>
                <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                  *O seu fluxo de login principal com a senha normal do Gmail permanece inalterado.
                </Typography>
              </Alert>
            ) : formData.host.toLowerCase().includes('outlook') || formData.host.toLowerCase().includes('hotmail') || formData.host.toLowerCase().includes('office365') ? (
              <Alert severity="info" icon={false}>
                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                  Como obter a Senha de App do Outlook/Hotmail:
                </Typography>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.875rem' }}>
                  <li>Acesse as <a href="https://account.live.com/proofs/manage/additional" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Opções de Segurança da Microsoft</a>.</li>
                  <li>Ative a <strong>Verificação em duas etapas</strong> (se ainda não estiver).</li>
                  <li>Role a página até a seção <strong>Senhas de aplicativos</strong>.</li>
                  <li>Clique em <strong>Criar uma nova senha de aplicativo</strong> e cole-a abaixo.</li>
                </ol>
              </Alert>
            ) : (
              <Alert severity="warning">
                Para a maioria dos provedores de email modernos, você precisará gerar uma <strong>Senha de App</strong> (App Password) nas configurações de segurança da sua conta ao invés de usar sua senha principal.
              </Alert>
            )}
            
            <TextField
              label="Email"
              type="email"
              fullWidth
              value={formData.emailUser}
              onChange={(e) => setFormData({ ...formData, emailUser: e.target.value })}
            />
            <TextField
              label={editingId ? "Nova Senha de App (deixe em branco para manter)" : "Senha de App"}
              type="password"
              fullWidth
              value={formData.emailPass}
              onChange={(e) => setFormData({ ...formData, emailPass: e.target.value })}
            />
            <Grid container spacing={2}>
              <Grid item xs={8}>
                <TextField
                  label="Host IMAP"
                  fullWidth
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                />
              </Grid>
              <Grid item xs={4}>
                <TextField
                  label="Porta"
                  type="number"
                  fullWidth
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                />
              </Grid>
            </Grid>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
              }
              label="Ativar leitura automática"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
          <Button
            onClick={async () => {
              setTesting(true);
              setTestResult(null);
              try {
                const payload = editingId && !formData.emailPass
                  ? { configId: editingId }
                  : { host: formData.host, port: formData.port, emailUser: formData.emailUser, emailPass: formData.emailPass };
                const result = await imapConfigService.testConnection(payload);
                setTestResult({ success: true, message: result.message || 'Conexão bem-sucedida!' });
              } catch (error: any) {
                const msg = error.response?.data?.error || error.message || 'Falha na conexão';
                setTestResult({ success: false, message: msg });
              } finally {
                setTesting(false);
              }
            }}
            disabled={testing || (!formData.emailPass && !editingId)}
            startIcon={testing ? <CircularProgress size={16} /> : <TestIcon />}
            color="info"
          >
            {testing ? 'Testando...' : 'Testar Conexão'}
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={handleCloseDialog}>Cancelar</Button>
            <Button 
              onClick={handleSave} 
              variant="contained"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) ? 'Salvando...' : 'Salvar'}
            </Button>
          </Box>
        </DialogActions>
        {testResult && (
          <Alert severity={testResult.success ? 'success' : 'error'} sx={{ mx: 3, mb: 2 }}>
            {testResult.message}
          </Alert>
        )}
      </Dialog>
    </Box>
  );
}
