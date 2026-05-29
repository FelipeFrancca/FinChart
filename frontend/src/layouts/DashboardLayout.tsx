import { useState, ReactNode } from 'react';
import {
    Box,
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Avatar,
    Menu,
    MenuItem,
    ListItemIcon,
    Divider,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Collapse,
    useTheme,
    useMediaQuery,
    CssBaseline,
    Chip,
    alpha,
    Button,
} from '@mui/material';
import {
    Brightness4,
    Brightness7,
    Logout,
    Dashboard as DashboardIcon,
    AccountBalanceWallet,
    Category,
    Flag,
    AttachMoney,
    EventRepeat,
    CompareArrows,
    Notifications,
    Menu as MenuIcon,
    ChevronLeft,
    ExpandLess,
    ExpandMore,
    Add,
    VpnKey,
    Settings,
    Assessment,
    People,
    TrendingUp,
    Person,
    HealthAndSafety,
    AutoAwesome,
    PieChart,
} from '@mui/icons-material';
import { useNavigate, useLocation, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from '../components/UserAvatar';
import NotificationBell from '../components/NotificationBell';
import WebSocketIndicator from '../components/WebSocketIndicator';
import { Logo } from '../components/Logo';

const drawerWidth = 260;

interface DashboardLayoutProps {
    mode: 'light' | 'dark';
    onToggleTheme: () => void;
}

interface MenuItemType {
    text: string;
    icon: ReactNode;
    path?: string;
    badge?: string | number;
    children?: MenuItemType[];
    divider?: boolean;
    header?: string;
}

export default function DashboardLayout({ mode, onToggleTheme }: DashboardLayoutProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [open, setOpen] = useState(!isMobile);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [expandedMenus, setExpandedMenus] = useState<string[]>(['dashboards', 'financial']);
    const navigate = useNavigate();
    const location = useLocation();
    const { dashboardId } = useParams<{ dashboardId: string }>();
    const { user, logout } = useAuth();

    const handleDrawerToggle = () => {
        setOpen(!open);
    };

    const handleMenuExpand = (menu: string) => {
        setExpandedMenus(prev =>
            prev.includes(menu) ? prev.filter(m => m !== menu) : [...prev, menu]
        );
    };

    // Determine if in dashboard context
    const isInDashboard = location.pathname.includes('/dashboard/');
    const basePath = isInDashboard ? `/dashboard/${dashboardId}` : '';

    const menuStructure: MenuItemType[] = [
        {
            header: 'DASHBOARDS',
            text: 'Meus Dashboards',
            icon: <DashboardIcon />,
            children: [
                { text: 'Todos os Dashboards', icon: <Assessment />, path: '/dashboards' },
                { text: 'Novo Dashboard', icon: <Add />, path: '/dashboards/new' },
                { text: 'Entrar com Chave', icon: <VpnKey />, path: '/dashboards/join' },
            ],
        },
        ...(isInDashboard ? [
            {
                header: 'GESTÃO FINANCEIRA',
                text: 'Financeiro',
                icon: <AttachMoney />,
                divider: true,
                children: [
                    { text: 'Visão Geral', icon: <TrendingUp />, path: `${basePath}` },
                    { text: 'Análise Inteligente', icon: <AutoAwesome />, path: `${basePath}/analise` },
                    { text: 'Contas', icon: <AccountBalanceWallet />, path: `${basePath}/accounts` },
                    { text: 'Categorias', icon: <Category />, path: `${basePath}/categories` },
                    { text: 'Transferências', icon: <CompareArrows />, path: `${basePath}/transfers` },
                    { text: 'Saúde Financeira', icon: <HealthAndSafety />, path: `${basePath}/financial-health` },
                ],
            },
            {
                header: 'PLANEJAMENTO',
                text: 'Planejamento',
                icon: <Flag />,
                children: [
                    { text: 'Orçamentos', icon: <AttachMoney />, path: `${basePath}/budgets` },
                    { text: 'Alocação de Receita', icon: <PieChart />, path: `${basePath}/allocations` },
                    { text: 'Metas', icon: <Flag />, path: `${basePath}/goals` },
                    { text: 'Recorrências', icon: <EventRepeat />, path: `${basePath}/recurrences` },
                ],
            },
            {
                header: 'CONFIGURAÇÕES',
                text: 'Configurações',
                icon: <Settings />,
                divider: true,
                children: [
                    { text: 'Membros', icon: <People />, path: `${basePath}/members` },
                    { text: 'Alertas', icon: <Notifications />, path: `${basePath}/alerts` },
                    { text: 'Configurações', icon: <Settings />, path: `${basePath}/settings` },
                ],
            },
        ] : []),
    ];

    const renderMenuItem = (item: MenuItemType, level: number = 0) => {
        const hasChildren = item.children && item.children.length > 0;
        const isExpanded = expandedMenus.includes(item.text.toLowerCase().replace(' ', '-'));
        const isSelected = item.path === location.pathname;
        const isParentSelected = item.children?.some(child => child.path === location.pathname);

        return (
            <Box key={item.text}>
                {item.header && level === 0 && (
                    <Typography
                        variant="caption"
                        sx={{
                            px: 3,
                            py: 1.5,
                            display: 'block',
                            fontWeight: 700,
                            color: 'text.secondary',
                            letterSpacing: 0.5,
                            mt: level === 0 ? 2 : 0,
                        }}
                    >
                        {item.header}
                    </Typography>
                )}

                <ListItem disablePadding sx={{ display: 'block' }}>
                    <ListItemButton
                        selected={isSelected || isParentSelected}
                        onClick={() => {
                            if (hasChildren) {
                                handleMenuExpand(item.text.toLowerCase().replace(' ', '-'));
                            } else if (item.path) {
                                navigate(item.path);
                                if (isMobile) setOpen(false);
                            }
                        }}
                        sx={{
                            minHeight: 44,
                            px: 2.5,
                            pl: level === 0 ? 2.5 : 4,
                            borderRadius: 1.5,
                            mx: 1,
                            mb: 0.5,
                            '&.Mui-selected': {
                                bgcolor: alpha(theme.palette.primary.main, 0.12),
                                color: 'primary.main',
                                '&:hover': {
                                    bgcolor: alpha(theme.palette.primary.main, 0.2),
                                },
                            },
                            '&:hover': {
                                bgcolor: alpha(theme.palette.primary.main, 0.08),
                            },
                        }}
                    >
                        <ListItemIcon
                            sx={{
                                minWidth: 40,
                                color: isSelected || isParentSelected ? 'primary.main' : 'text.secondary',
                            }}
                        >
                            {item.icon}
                        </ListItemIcon>
                        <ListItemText
                            primary={item.text}
                            primaryTypographyProps={{
                                fontSize: level === 0 ? 14 : 13,
                                fontWeight: isSelected || (hasChildren && isParentSelected) ? 600 : 500,
                            }}
                        />
                        {item.badge && (
                            <Chip
                                label={item.badge}
                                size="small"
                                color="primary"
                                sx={{ height: 20, fontSize: 11 }}
                            />
                        )}
                        {hasChildren && (isExpanded ? <ExpandLess /> : <ExpandMore />)}
                    </ListItemButton>
                </ListItem>

                {hasChildren && (
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <List component="div" disablePadding>
                            {item.children?.map(child => renderMenuItem(child, level + 1))}
                        </List>
                    </Collapse>
                )}

                {item.divider && <Divider sx={{ my: 1, mx: 2 }} />}
            </Box>
        );
    };

    return (
        <Box sx={{ display: 'flex' }}>
            <CssBaseline />
            <AppBar
                position="fixed"
                sx={{
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    background: mode === 'dark'
                        ? 'linear-gradient(120deg, #2d1b69 0%, #5b21b6 45%, #7c3aed 100%)'
                        : 'linear-gradient(120deg, #7c3aed 0%, #9333ea 50%, #a855f7 100%)',
                    boxShadow: (theme) => theme.shadows[4],
                }}
            >
                <Toolbar>
                    <IconButton
                        color="inherit"
                        aria-label="toggle drawer"
                        onClick={handleDrawerToggle}
                        edge="start"
                        sx={{ mr: 2 }}
                    >
                        {open ? <ChevronLeft /> : <MenuIcon />}
                    </IconButton>

                    <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
                        <Logo
                            variant="full"
                            width={{ xs: 120, sm: 160 }}
                            sx={{ cursor: 'pointer' }}
                            onClick={() => navigate('/dashboards')}
                        />
                    </Box>

                    <NotificationBell />

                    {/* WebSocket Status */}
                    <WebSocketIndicator dashboardId={dashboardId} />

                    <IconButton color="inherit" onClick={onToggleTheme} sx={{ mr: 1 }}>
                        {mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
                    </IconButton>

                    <IconButton
                        color="inherit"
                        onClick={(e) => setAnchorEl(e.currentTarget)}
                        sx={{ ml: 1 }}
                    >
                        <Avatar
                            src={user?.avatar}
                            alt={user?.name || user?.email}
                            sx={{
                                width: 36,
                                height: 36,
                                border: '2px solid',
                                borderColor: 'rgba(255, 255, 255, 0.3)',
                            }}
                        >
                            {!user?.avatar && (user?.name?.[0] || user?.email?.[0] || '?').toUpperCase()}
                        </Avatar>
                    </IconButton>

                    <Menu
                        anchorEl={anchorEl}
                        open={Boolean(anchorEl)}
                        onClose={() => setAnchorEl(null)}
                        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                        PaperProps={{
                            elevation: 8,
                            sx: {
                                mt: 1,
                                minWidth: 220,
                                borderRadius: 2,
                            },
                        }}
                    >
                        <Box sx={{ px: 2, py: 1.5 }}>
                            <Typography variant="subtitle2" fontWeight="bold">
                                {user?.name || 'Usuário'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {user?.email}
                            </Typography>
                        </Box>
                        <Divider />
                        <MenuItem onClick={() => { navigate('/dashboards'); setAnchorEl(null); }}>
                            <ListItemIcon>
                                <DashboardIcon fontSize="small" />
                            </ListItemIcon>
                            Meus Dashboards
                        </MenuItem>
                        <MenuItem onClick={() => { navigate('/profile'); setAnchorEl(null); }}>
                            <ListItemIcon>
                                <Settings fontSize="small" />
                            </ListItemIcon>
                            Meu Perfil
                        </MenuItem>
                        <Divider />
                        <MenuItem
                            onClick={() => {
                                setAnchorEl(null);
                                logout();
                                navigate('/login');
                            }}
                            sx={{ color: 'error.main' }}
                        >
                            <ListItemIcon sx={{ color: 'error.main' }}>
                                <Logout fontSize="small" />
                            </ListItemIcon>
                            Sair
                        </MenuItem>
                    </Menu>
                </Toolbar>
            </AppBar>

            <Drawer
                variant={isMobile ? 'temporary' : 'persistent'}
                open={open}
                onClose={isMobile ? handleDrawerToggle : undefined}
                sx={{
                    width: open ? drawerWidth : 0,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    boxSizing: 'border-box',
                    transition: theme.transitions.create('width', {
                        easing: theme.transitions.easing.sharp,
                        duration: theme.transitions.duration.leavingScreen,
                    }),
                    ...(open && {
                        transition: theme.transitions.create('width', {
                            easing: theme.transitions.easing.easeOut,
                            duration: theme.transitions.duration.enteringScreen,
                        }),
                    }),
                    [`& .MuiDrawer-paper`]: {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                        borderRight: `1px solid ${theme.palette.divider}`,
                        bgcolor: mode === 'dark' ? 'background.paper' : 'background.default',
                    },
                }}
            >
                <Toolbar />
                <Box sx={{ overflow: 'auto', py: 1 }}>
                    <List>
                        {menuStructure.map(item => renderMenuItem(item))}
                    </List>
                </Box>

                {/* Footer with user info */}
                <Box
                    sx={{
                        mt: 'auto',
                        p: 2.5,
                        borderTop: `1px solid ${theme.palette.divider}`,
                        bgcolor: alpha(theme.palette.primary.main, 0.05),
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                        <UserAvatar user={user || undefined} size="medium" />
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>
                                Olá, {user?.name?.split(' ')[0] || 'Usuário'}!
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                                {user?.email}
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            fullWidth
                            size="small"
                            variant="outlined"
                            startIcon={<Person />}
                            onClick={() => navigate('/profile')}
                        >
                            Perfil
                        </Button>
                        <IconButton
                            size="small"
                            onClick={() => {
                                logout();
                                navigate('/login');
                            }}
                            color="error"
                            title="Sair"
                        >
                            <Logout fontSize="small" />
                        </IconButton>
                    </Box>
                </Box>
            </Drawer>

            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: 3,
                    width: `calc(100% - ${open ? drawerWidth : 0}px)`,
                    transition: theme.transitions.create(['width', 'margin'], {
                        easing: theme.transitions.easing.sharp,
                        duration: theme.transitions.duration.leavingScreen,
                    }),
                    ...(open && {
                        transition: theme.transitions.create(['width', 'margin'], {
                            easing: theme.transitions.easing.easeOut,
                            duration: theme.transitions.duration.enteringScreen,
                        }),
                    }),
                }}
            >
                <Toolbar />
                <Outlet />
            </Box>
        </Box>
    );
}
