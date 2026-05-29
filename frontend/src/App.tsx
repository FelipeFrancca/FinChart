import { useState, useMemo, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import { createAppTheme } from './theme/theme';
import { AuthProvider } from './contexts/AuthContext';
import { initSwalTheme, applySwalTheme } from './utils/swalTheme';
import PrivateRoute from './components/PrivateRoute';

// Lazy imports
const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const GoogleCallbackPage = lazy(() => import('./pages/GoogleCallbackPage'));
const SharedPreviewPage = lazy(() => import('./pages/SharedPreviewPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'));
const DashboardFinancial = lazy(() => import('./pages/DashboardFinancial'));
const AccountsPage = lazy(() => import('./pages/AccountsPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const GoalsPage = lazy(() => import('./pages/GoalsPage'));
const BudgetsPage = lazy(() => import('./pages/BudgetsPage'));
const RecurrencesPage = lazy(() => import('./pages/RecurrencesPage'));
const TransfersPage = lazy(() => import('./pages/TransfersPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const JoinDashboardPage = lazy(() => import('./pages/JoinDashboardPage'));
const CreateDashboardPage = lazy(() => import('./pages/CreateDashboardPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const MembersPage = lazy(() => import('./pages/MembersPage'));
const DashboardSettingsPage = lazy(() => import('./pages/DashboardSettingsPage'));
const ItemAnalysisPage = lazy(() => import('./pages/ItemAnalysisPage'));
const FinancialHealthPage = lazy(() => import('./pages/FinancialHealthPage'));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
const BudgetAllocationPage = lazy(() => import('./pages/BudgetAllocationPage'));

const PageLoader = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <CircularProgress />
  </Box>
);

function App() {
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('finance-dashboard-theme');
    return (saved === 'light' ? 'light' : 'dark') as 'light' | 'dark';
  });

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  // Inicializa tema do SweetAlert2
  useEffect(() => {
    initSwalTheme();
  }, []);

  // Atualiza tema do SweetAlert2 quando o modo mudar
  useEffect(() => {
    applySwalTheme(mode);
  }, [mode]);

  const toggleTheme = () => {
    const newMode = mode === 'light' ? 'dark' : 'light';
    setMode(newMode);
    localStorage.setItem('finance-dashboard-theme', newMode);
  };

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/auth/callback" element={<GoogleCallbackPage />} />
              <Route path="/shared/:code" element={<SharedPreviewPage />} />

              {/* All authenticated routes use DashboardLayout */}
              <Route
                element={
                  <PrivateRoute>
                    <DashboardLayout mode={mode} onToggleTheme={toggleTheme} />
                  </PrivateRoute>
                }
              >
                {/* Dashboard listing */}
                <Route path="/dashboards" element={<HomePage />} />
                <Route path="/dashboards/new" element={<CreateDashboardPage />} />
                <Route path="/dashboards/join" element={<JoinDashboardPage />} />

                {/* Individual dashboard routes */}
                <Route path="/dashboard/:dashboardId" element={<DashboardFinancial />} />
                <Route path="/dashboard/:dashboardId/accounts" element={<AccountsPage />} />
                <Route path="/dashboard/:dashboardId/categories" element={<CategoriesPage />} />
                <Route path="/dashboard/:dashboardId/goals" element={<GoalsPage />} />
                <Route path="/dashboard/:dashboardId/budgets" element={<BudgetsPage />} />
                <Route path="/dashboard/:dashboardId/recurrences" element={<RecurrencesPage />} />
                <Route path="/dashboard/:dashboardId/transfers" element={<TransfersPage />} />
                <Route path="/dashboard/:dashboardId/alerts" element={<AlertsPage />} />
                <Route path="/dashboard/:dashboardId/members" element={<MembersPage />} />
                <Route path="/dashboard/:dashboardId/settings" element={<DashboardSettingsPage />} />
                <Route path="/dashboard/:dashboardId/items" element={<ItemAnalysisPage />} />
                <Route path="/dashboard/:dashboardId/financial-health" element={<FinancialHealthPage />} />
                <Route path="/dashboard/:dashboardId/analise" element={<AnalysisPage />} />
                <Route path="/dashboard/:dashboardId/allocations" element={<BudgetAllocationPage />} />

                {/* User profile and notifications */}
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
              </Route>

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
