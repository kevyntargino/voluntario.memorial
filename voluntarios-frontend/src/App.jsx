import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import Login from './pages/Login';
import Home from './pages/Home';
import Perfil from './pages/Perfil';
import Escalas from './pages/Escalas';
import MinhaEquipe from './pages/MinhaEquipe';
import AdminEscalas from './pages/AdminEscalas';
import Avisos from './pages/Avisos';
import Manuais from './pages/Manuais';
import { Redirect } from './components/Redirect';
import { MobileBottomNav } from './components/MobileBottomNav';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { PushNotificationManager } from './components/PushNotificationManager';
import { AppSettings } from './components/AppSettings';
import { ProfileCompletionNotification } from './components/ProfileCompletionNotification';

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

  return (
    <NavigationProvider value={{ ...location, navigate }}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </NavigationProvider>
  );
} 

function AppRouter() {
  const { pathname } = useNavigation();
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
    return pathname === '/login' ? <Login /> : <Redirect to="/login" replace />;
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
    page = <MinhaEquipe />;
  } else if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    page = <AdminEscalas />;
  } else if (pathname === '/avisos') {
    page = <Avisos />;
  } else if (pathname === '/manuais') {
    page = <Manuais />;
  }

  return (
    <>
      {page}
      <ProfileCompletionNotification />
      <MobileBottomNav />
      <PwaInstallPrompt />
      <PushNotificationManager />
      <AppSettings />
    </>
  );
}

export default App;
