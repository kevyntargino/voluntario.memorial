import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { Redirect } from './components/Redirect';
import { MobileBottomNav } from './components/MobileBottomNav';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { PushNotificationManager } from './components/PushNotificationManager';
import { AppSettings } from './components/AppSettings';
import { ProfileCompletionNotification } from './components/ProfileCompletionNotification';

// Cada página vira um chunk separado (code splitting) para acelerar o primeiro carregamento.
const Login = lazy(() => import('./pages/Login'));
const Home = lazy(() => import('./pages/Home'));
const Perfil = lazy(() => import('./pages/Perfil'));
const Escalas = lazy(() => import('./pages/Escalas'));
const EquipeDashboard = lazy(() => import('./pages/equipe/EquipeDashboard'));
const EquipeVoluntarios = lazy(() => import('./pages/equipe/EquipeVoluntarios'));
const EquipeEscalas = lazy(() => import('./pages/equipe/EquipeEscalas'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminVoluntarios = lazy(() => import('./pages/admin/AdminVoluntarios'));
const AdminLideres = lazy(() => import('./pages/admin/AdminLideres'));
const AdminEquipes = lazy(() => import('./pages/admin/AdminEquipes'));
const AdminAusencias = lazy(() => import('./pages/admin/AdminAusencias'));
const AdminNotificacoes = lazy(() => import('./pages/admin/AdminNotificacoes'));
const AdminGerenciarEscalas = lazy(() => import('./pages/admin/AdminGerenciarEscalas'));
const AdminManuais = lazy(() => import('./pages/admin/AdminManuais'));
const Avisos = lazy(() => import('./pages/Avisos'));
const Manuais = lazy(() => import('./pages/Manuais'));

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-6 text-gray-500 dark:bg-gray-950 dark:text-gray-400">
      <div className="flex items-center gap-2 text-sm">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-700 dark:border-t-gray-300" />
        Carregando...
      </div>
    </div>
  );
}

function App() {
  const getInitialLocation = () => {
    const params = new URLSearchParams(window.location.search || '');
    const openPath = params.get('mcom_open');

    if (openPath?.startsWith('/')) {
      window.history.replaceState({}, '', openPath);
      return {
        pathname: window.location.pathname || '/',
        search: window.location.search || '',
      };
    }

    return {
      pathname: window.location.pathname || '/',
      search: window.location.search || '',
    };
  };

  const [location, setLocation] = useState(() => ({
    ...getInitialLocation(),
  }));

  useEffect(() => {
    const handlePopState = () => {
      setLocation({
        pathname: window.location.pathname || '/',
        search: window.location.search || '',
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to, { replace = false } = {}) => {
    const nextUrl = new URL(to.startsWith('/') ? to : `/${to}`, window.location.origin);
    const nextPath = `${nextUrl.pathname}${nextUrl.search}`;

    if (`${window.location.pathname}${window.location.search}` === nextPath) {
      setLocation({ pathname: nextUrl.pathname, search: nextUrl.search });
      return;
    }

    if (replace) {
      window.history.replaceState({}, '', nextPath);
    } else {
      window.history.pushState({}, '', nextPath);
    }

    setLocation({ pathname: nextUrl.pathname, search: nextUrl.search });
  };

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    const handleNavigate = (event) => {
      const url = event.detail?.url;

      if (typeof url === 'string' && url) {
        navigateRef.current(url);
      }
    };

    window.addEventListener('mcom-navigate', handleNavigate);
    return () => window.removeEventListener('mcom-navigate', handleNavigate);
  }, []);

  return (
    <NavigationProvider value={{ ...location, navigate }}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </NavigationProvider>
  );
} 

function AppRouter() {
  const { pathname, search } = useNavigation();
  const { carregado, isAuthenticated } = useAuth();

  if (!carregado) {
    return (
      <div className="min-h-screen bg-[#f6f1e6] flex items-center justify-center px-6 text-gray-700">
        <div className="max-w-sm rounded-2xl border border-black/5 bg-white/90 px-6 py-5 shadow-xl shadow-black/5">
          Carregando sua sessão...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return pathname === '/login'
      ? <Suspense fallback={<PageFallback />}><Login /></Suspense>
      : <Redirect to="/login" replace />;
  }

  if (pathname === '/login') {
    return <Redirect to="/" replace />;
  }

  let page = <Home />;

  if (pathname === '/perfil') {
    page = <Perfil />;
  } else if (pathname === '/escalas') {
    page = <Escalas />;
  } else if (pathname === '/minha-equipe') {
    const parametrosEquipe = new URLSearchParams(search || '');
    page = parametrosEquipe.has('escala') && !parametrosEquipe.has('pedido')
      ? <EquipeEscalas />
      : <EquipeDashboard />;
  } else if (pathname === '/minha-equipe/voluntarios') {
    page = <EquipeVoluntarios />;
  } else if (pathname === '/minha-equipe/escalas') {
    page = <EquipeEscalas />;
  } else if (pathname === '/admin') {
    page = <AdminDashboard />;
  } else if (pathname === '/admin/voluntarios') {
    page = <AdminVoluntarios />;
  } else if (pathname === '/admin/lideres') {
    page = <AdminLideres />;
  } else if (pathname === '/admin/equipes') {
    page = <AdminEquipes />;
  } else if (pathname === '/admin/ausencias') {
    page = <AdminAusencias />;
  } else if (pathname === '/admin/notificacoes') {
    page = <AdminNotificacoes />;
  } else if (pathname === '/admin/escalas') {
    page = <AdminGerenciarEscalas />;
  } else if (pathname === '/admin/manuais') {
    page = <AdminManuais />;
  } else if (pathname === '/avisos') {
    page = <Avisos />;
  } else if (pathname === '/manuais') {
    page = <Manuais />;
  }

  return (
    <div className="lg:pl-64">
      <Suspense fallback={<PageFallback />}>{page}</Suspense>
      <ProfileCompletionNotification />
      <MobileBottomNav />
      <PwaInstallPrompt />
      <PushNotificationManager />
      <AppSettings />
    </div>
  );
}

export default App;
