import { useState, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import {
  Box,
  Container,
  Paper,
  Tabs,
  Tab,
  TextField,
  Button,
  Typography,
  Link,
  Divider,
  InputAdornment,
  IconButton,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  useTheme,
  Alert,
  AlertTitle,
  Collapse,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Google as GoogleIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { showWarning, showErrorWithRetry, showConfirm } from "../utils/notifications";
import { Logo } from "../components/Logo";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}



export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login, register, isAuthenticated, isLoading: authLoading, requestPasswordReset, verifyResetCode, resetPasswordWithCode } = useAuth();
  const theme = useTheme();

  const [tab, setTab] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<{ message: string; code?: string } | null>(null);


  // Forgot Password State
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetStep, setResetStep] = useState(0); // 0: Email, 1: Verify Code, 2: New Password
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [codeDigits, setCodeDigits] = useState(['', '', '', '']);

  // Login Form
  const { register: registerLogin, handleSubmit: handleSubmitLogin, watch: watchLogin, formState: { errors: loginErrors } } = useForm({
    defaultValues: {
      email: "",
      password: "",
      rememberMe: true
    }
  });

  // Forgot Password Form
  const { handleSubmit: handleSubmitReset, control: controlReset, formState: { errors: resetErrors }, setValue: setValueReset } = useForm({
    defaultValues: {
      email: "",
      code: "",
      newPassword: "",
      confirmPassword: ""
    }
  });

  // Register Form
  const {
    register: registerSignUp,
    handleSubmit: handleSubmitSignUp,
    watch,
    formState: { errors: signUpErrors }
  } = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: ""
    }
  });

  // Toggle Forgot Password View
  const toggleForgotPassword = () => {
    if (!isForgotPassword) {
      // Switching TO forgot password - pre-fill email
      const loginEmail = watchLogin("email");
      if (loginEmail) {
        setValueReset("email", loginEmail);
      }
      setResetEmailSent(false);
      setResetError(null);
      setResetStep(0);
      setCodeDigits(['', '', '', '']);
    }
    setIsForgotPassword(!isForgotPassword);
    setLoginError(null);
  };

  // Handle code digit input
  const handleCodeDigitChange = (index: number, value: string) => {
    // Handle paste
    if (value.length > 1) {
      const digits = value.slice(0, 4).split('');
      const newCodeDigits = [...codeDigits];
      digits.forEach((digit, i) => {
        if (index + i < 4 && /^\d$/.test(digit)) {
          newCodeDigits[index + i] = digit;
        }
      });
      setCodeDigits(newCodeDigits);
      setValueReset('code', newCodeDigits.join(''));
      // Focus last filled or next empty
      const nextIndex = Math.min(index + digits.length, 3);
      const nextInput = document.getElementById(`code-digit-${nextIndex}`);
      nextInput?.focus();
      return;
    }

    // Single digit
    if (value === '' || /^\d$/.test(value)) {
      const newCodeDigits = [...codeDigits];
      newCodeDigits[index] = value;
      setCodeDigits(newCodeDigits);
      setValueReset('code', newCodeDigits.join(''));

      // Auto-focus next input
      if (value && index < 3) {
        const nextInput = document.getElementById(`code-digit-${index + 1}`);
        nextInput?.focus();
      }
    }
  };

  // Handle backspace on code inputs
  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      const prevInput = document.getElementById(`code-digit-${index - 1}`);
      prevInput?.focus();
    }
  };

  // Handle Password Reset Submit
  const onResetSubmit = async (data: any) => {
    setIsLoading(true);
    setResetError(null);
    try {
      if (resetStep === 0) {
        // Step 1: Request Code
        const result = await requestPasswordReset(data.email);

        if (result.hasExistingToken && !result.sent) {
          // There's an existing valid token - ask user if they want to resend
          const expiresInMinutes = Math.ceil((result.expiresIn || 0) / 60);
          const confirmed = await showConfirm(
            `Já existe um código de verificação válido para este email (expira em ${expiresInMinutes} minuto${expiresInMinutes !== 1 ? 's' : ''}). Deseja enviar um novo código?`,
            {
              title: 'Código Existente',
              confirmButtonText: 'Enviar novo código',
              cancelButtonText: 'Usar código atual',
            }
          );

          if (confirmed) {
            // Resend with force=true
            await requestPasswordReset(data.email, true);
          }
        }
        // Proceed to code input step
        setResetStep(1);
        setCodeDigits(['', '', '', '']);
      } else if (resetStep === 1) {
        // Step 2: Verify Code with backend
        const code = codeDigits.join('');
        if (code.length !== 4) {
          setResetError('Digite o código de 4 dígitos');
          return;
        }
        // Verify code with backend before allowing password change
        await verifyResetCode(data.email, code);
        setValueReset('code', code);
        setResetStep(2);
      } else {
        // Step 3: Verify Code and Set New Password
        if (data.newPassword !== data.confirmPassword) {
          setResetError('As senhas não coincidem');
          return;
        }
        await resetPasswordWithCode(data.email, data.code, data.newPassword);
        setResetEmailSent(true);
      }
    } catch (err: any) {
      setResetError(err.message || "Erro ao solicitar redefinição de senha");
    } finally {
      setIsLoading(false);
    }
  };



  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/dashboards", { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Check for Google OAuth error
  useEffect(() => {
    const googleError = searchParams.get("error");
    if (googleError === "google_auth_failed") {
      showErrorWithRetry(
        "Falha na autenticação com Google. Verifique se as credenciais OAuth estão configuradas corretamente no arquivo .env do backend.",
        handleGoogleLogin,
        { title: "Erro de Autenticação" }
      );
    }
  }, [searchParams]);

  const from = (location.state as any)?.from?.pathname || "/dashboards";

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTab(newValue);
    setLoginError(null); // Clear errors when switching tabs
    setIsForgotPassword(false); // Reset to login view when switching tabs
  };

  const onLoginSubmit = async (data: any) => {
    setIsLoading(true);
    setLoginError(null);

    try {
      await login(data.email, data.password, data.rememberMe);
      navigate(from, { replace: true });
    } catch (err: any) {

      // Display specific error based on error code
      const errorCode = err.code;
      const errorStatus = err.status;
      let errorMessage = err.message || "Erro ao fazer login";

      if (errorCode === "EMAIL_NOT_FOUND") {
        errorMessage = "Email não encontrado. Verifique se o email está correto ou crie uma nova conta.";
      } else if (errorCode === "INVALID_PASSWORD") {
        errorMessage = "Senha incorreta. Verifique sua senha e tente novamente.";
      } else if (errorCode === "DATABASE_UNAVAILABLE" || errorStatus === 503) {
        errorMessage = "Serviço de autenticação temporariamente indisponível. Tente novamente em instantes.";
      } else if (errorStatus >= 500) {
        errorMessage = "Não foi possível processar o login agora. Tente novamente em alguns instantes.";
      }

      setLoginError({ message: errorMessage, code: errorCode });
    } finally {
      setIsLoading(false);
    }
  };

  const onRegisterSubmit = async (data: any) => {
    if (data.password !== data.confirmPassword) {
      showWarning("As senhas não coincidem", { title: "Validação" });
      return;
    }

    // Validação de senha: deve conter maiúscula, minúscula e número
    const hasUpperCase = /[A-Z]/.test(data.password);
    const hasLowerCase = /[a-z]/.test(data.password);
    const hasNumber = /\d/.test(data.password);

    if (!hasUpperCase || !hasLowerCase || !hasNumber) {
      showWarning(
        "A senha deve conter pelo menos uma letra maiúscula, uma minúscula e um número",
        { title: "Validação" }
      );
      return;
    }

    setIsLoading(true);
    try {
      await register(data.email, data.password, data.name);
      navigate(from, { replace: true });
    } catch (err: any) {
      showErrorWithRetry(err, () => onRegisterSubmit(data), { title: "Erro ao Criar Conta" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // Em produção, usa URL relativa (mesmo domínio)
    // Em desenvolvimento, precisa da URL completa do backend
    // O proxy do Vite só funciona para fetch/XHR, não para window.location.href
    let apiUrl = import.meta.env.VITE_API_URL;

    // Fallback para desenvolvimento local
    if (!apiUrl && import.meta.env.DEV) {
      apiUrl = 'http://localhost:5000';
    }

    window.location.href = `${apiUrl || ''}/api/auth/google`;
  };


  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        background: theme.palette.gradients?.auth || "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      }}
    >
      <Container maxWidth="sm">
        <Paper elevation={24} sx={{ overflow: "hidden" }}>
          <Box sx={{ p: 4 }}>
            {/* Logo/Header */}
            <Box sx={{ textAlign: "center", mb: 3 }}>
              <Logo variant="full" width={200} sx={{ mb: 2 }} />
              <Typography variant="body2" color="text.secondary">
                Gerencie suas finanças pessoais com facilidade
              </Typography>
            </Box>

            {/* Tabs - Hide when in Forgot Password mode for cleaner UI */}
            <Collapse in={!isForgotPassword}>
              <Tabs value={tab} onChange={handleTabChange} variant="fullWidth" sx={{ mb: 2 }}>
                <Tab label="Login" />
                <Tab label="Criar Conta" />
              </Tabs>
            </Collapse>

            {/* Forgot Password Header - Show only when active */}
            <Collapse in={isForgotPassword}>
              <Box sx={{ textAlign: "center", mb: 2 }}>
                <Typography variant="h6" color="primary">
                  Redefinir Senha
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Informe seu email para receber o link de redefinição
                </Typography>
              </Box>
            </Collapse>

            {/* Login Tab */}
            <TabPanel value={tab} index={0}>
              {/* Error Display */}
              <Collapse in={!!loginError && !isForgotPassword}>
                <Alert
                  severity={loginError?.code === "EMAIL_NOT_FOUND" ? "warning" : "error"}
                  sx={{ mb: 2 }}
                  onClose={() => setLoginError(null)}
                >
                  <AlertTitle>
                    {loginError?.code === "EMAIL_NOT_FOUND" ? "Email não encontrado" : "Erro de Autenticação"}
                  </AlertTitle>
                  {loginError?.message}
                </Alert>
              </Collapse>



              {/* Login Form */}
              <Collapse in={!isForgotPassword}>
                <form onSubmit={handleSubmitLogin(onLoginSubmit)}>
                  <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    margin="normal"
                    autoComplete="email"
                    error={!!loginErrors.email}
                    helperText={loginErrors.email?.message as string}
                    {...registerLogin("email", { required: "Email é obrigatório" })}
                  />
                  <TextField
                    fullWidth
                    label="Senha"
                    type={showPassword ? "text" : "password"}
                    margin="normal"
                    autoComplete="current-password"
                    error={!!loginErrors.password}
                    helperText={loginErrors.password?.message as string}
                    {...registerLogin("password", { required: "Senha é obrigatória" })}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />

                  <Box sx={{ textAlign: "right", mt: 1, mb: 2 }}>
                    <Link
                      component="button"
                      type="button"
                      variant="body2"
                      onClick={toggleForgotPassword}
                    >
                      Esqueceu sua senha?
                    </Link>
                  </Box>

                  <FormControlLabel
                    control={
                      <Checkbox
                        color="primary"
                        {...registerLogin("rememberMe")}
                      />
                    }
                    label="Permanecer conectado"
                  />

                  <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    size="large"
                    disabled={isLoading}
                    sx={{ mb: 2 }}
                  >
                    {isLoading ? <CircularProgress size={24} /> : "Entrar"}
                  </Button>
                </form>
              </Collapse>

              {/* Forgot Password Form */}
              <Collapse in={isForgotPassword}>
                {resetEmailSent ? (
                  <Box sx={{ textAlign: "center", py: 2 }}>
                    <Alert severity="success" sx={{ mb: 3 }}>
                      <AlertTitle>Senha Redefinida!</AlertTitle>
                      Sua senha foi alterada com sucesso. Você já pode fazer login.
                    </Alert>
                    <Button
                      variant="outlined"
                      onClick={toggleForgotPassword}
                      fullWidth
                    >
                      Voltar para Login
                    </Button>
                  </Box>
                ) : (
                  <form onSubmit={handleSubmitReset(onResetSubmit)}>
                    <Collapse in={!!resetError}>
                      <Alert severity="error" sx={{ mb: 2 }}>
                        {resetError}
                      </Alert>
                    </Collapse>

                    {/* Step 0: Email Input */}
                    <Collapse in={resetStep === 0}>
                      <Controller
                        name="email"
                        control={controlReset}
                        rules={{
                          required: "Email é obrigatório",
                          pattern: {
                            value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                            message: "Email inválido"
                          }
                        }}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            fullWidth
                            label="Email"
                            type="email"
                            margin="normal"
                            autoComplete="email"
                            error={!!resetErrors.email}
                            helperText={resetErrors.email?.message as string}
                            InputLabelProps={{ shrink: !!field.value || undefined }}
                          />
                        )}
                      />
                    </Collapse>

                    {/* Step 1: Code Verification with 4 separate inputs */}
                    <Collapse in={resetStep === 1}>
                      <Box sx={{ textAlign: 'center', my: 2 }}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Digite o código de 4 dígitos enviado para seu email
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, my: 2 }}>
                          {[0, 1, 2, 3].map((index) => (
                            <TextField
                              key={index}
                              id={`code-digit-${index}`}
                              value={codeDigits[index]}
                              onChange={(e) => handleCodeDigitChange(index, e.target.value)}
                              onKeyDown={(e) => handleCodeKeyDown(index, e)}
                              onPaste={(e) => {
                                e.preventDefault();
                                const pastedData = e.clipboardData.getData('text').replace(/\D/g, '');
                                handleCodeDigitChange(index, pastedData);
                              }}
                              inputProps={{
                                maxLength: 1,
                                style: { textAlign: 'center', fontSize: '24px', fontWeight: 'bold' },
                                inputMode: 'numeric',
                                pattern: '[0-9]*',
                              }}
                              sx={{
                                width: 56,
                                '& .MuiOutlinedInput-root': {
                                  height: 64,
                                },
                              }}
                            />
                          ))}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          Cole o código ou digite cada dígito
                        </Typography>
                      </Box>
                    </Collapse>

                    {/* Step 2: New Password + Confirmation */}
                    <Collapse in={resetStep === 2}>
                      <Box sx={{ my: 1 }}>
                        <Typography variant="body2" color="text.secondary" gutterBottom sx={{ textAlign: 'center', mb: 2 }}>
                          Código verificado! Agora defina sua nova senha
                        </Typography>
                        <Controller
                          name="newPassword"
                          control={controlReset}
                          rules={{
                            required: resetStep === 2 ? "Nova senha é obrigatória" : false,
                            minLength: { value: 8, message: "Senha deve ter no mínimo 8 caracteres" },
                            pattern: {
                              value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                              message: "Senha deve conter letras maiúsculas, minúsculas e números"
                            }
                          }}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              fullWidth
                              label="Nova Senha"
                              type={showPassword ? "text" : "password"}
                              margin="normal"
                              error={!!resetErrors.newPassword}
                              helperText={resetErrors.newPassword?.message as string}
                              InputProps={{
                                endAdornment: (
                                  <InputAdornment position="end">
                                    <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                                      {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                  </InputAdornment>
                                ),
                              }}
                            />
                          )}
                        />
                        <Controller
                          name="confirmPassword"
                          control={controlReset}
                          rules={{
                            required: resetStep === 2 ? "Confirmação é obrigatória" : false,
                          }}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              fullWidth
                              label="Confirmar Nova Senha"
                              type={showPassword ? "text" : "password"}
                              margin="normal"
                              error={!!resetErrors.confirmPassword}
                              helperText={resetErrors.confirmPassword?.message as string}
                            />
                          )}
                        />
                      </Box>
                    </Collapse>

                    <Button
                      type="submit"
                      fullWidth
                      variant="contained"
                      size="large"
                      disabled={isLoading || (resetStep === 1 && codeDigits.join('').length !== 4)}
                      sx={{ mt: 2, mb: 2 }}
                    >
                      {isLoading ? <CircularProgress size={24} /> : (
                        resetStep === 0 ? "Enviar Código" :
                          resetStep === 1 ? "Verificar Código" :
                            "Redefinir Senha"
                      )}
                    </Button>

                    <Button
                      fullWidth
                      variant="text"
                      onClick={() => {
                        if (resetStep > 0 && !resetEmailSent) {
                          setResetStep(resetStep - 1);
                          setResetError(null);
                        } else {
                          toggleForgotPassword();
                        }
                      }}
                      disabled={isLoading}
                    >
                      {resetStep > 0 && !resetEmailSent ? "Voltar" : "Voltar para Login"}
                    </Button>
                  </form>
                )}
              </Collapse>
            </TabPanel>

            {/* Register Tab */}
            <TabPanel value={tab} index={1}>
              <form onSubmit={handleSubmitSignUp(onRegisterSubmit)}>
                <TextField
                  fullWidth
                  label="Nome"
                  margin="normal"
                  autoComplete="name"
                  {...registerSignUp("name", { required: "Nome é obrigatório" })}
                  error={!!signUpErrors.name}
                  helperText={signUpErrors.name?.message as string}
                />
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  margin="normal"
                  autoComplete="email"
                  {...registerSignUp("email", {
                    required: "Email é obrigatório",
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: "Email inválido"
                    }
                  })}
                  error={!!signUpErrors.email}
                  helperText={signUpErrors.email?.message as string}
                />
                <TextField
                  fullWidth
                  label="Senha"
                  type={showPassword ? "text" : "password"}
                  margin="normal"
                  autoComplete="new-password"
                  helperText={signUpErrors.password?.message as string || "Mínimo 8 caracteres, incluindo maiúscula, minúscula e número"}
                  error={!!signUpErrors.password}
                  {...registerSignUp("password", {
                    required: "Senha é obrigatória",
                    minLength: {
                      value: 8,
                      message: "Mínimo de 8 caracteres"
                    }
                  })}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Confirmar Senha"
                  type={showPassword ? "text" : "password"}
                  margin="normal"
                  autoComplete="new-password"
                  error={!!signUpErrors.confirmPassword}
                  helperText={signUpErrors.confirmPassword?.message as string}
                  {...registerSignUp("confirmPassword", {
                    required: "Confirmação de senha é obrigatória",
                    validate: (val: string) => {
                      if (watch('password') != val) {
                        return "As senhas não coincidem";
                      }
                    },
                  })}
                />

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={isLoading}
                  sx={{ mt: 3, mb: 2 }}
                >
                  {isLoading ? <CircularProgress size={24} /> : "Criar Conta"}
                </Button>
              </form>
            </TabPanel>

            {/* Divider */}
            <Divider sx={{ my: 2 }}>
              <Typography variant="body2" color="text.secondary">
                OU
              </Typography>
            </Divider>

            {/* Google Login */}
            <Button
              fullWidth
              variant="outlined"
              size="large"
              startIcon={<GoogleIcon />}
              onClick={handleGoogleLogin}
              sx={{ mb: 2 }}
            >
              Continuar com Google
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
