import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import Login from './pages/Login';
import Home from './pages/Home';
import Perfil from './pages/Perfil';
import Escalas from './pages/Escalas';
import { Redirect } from './components/Redirect';

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname || '/');

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname || '/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to, { replace = false } = {}) => {
    const nextPath = to.startsWith('/') ? to : `/${to}`;

    if (window.location.pathname === nextPath) {
      setPathname(nextPath);
      return;
    }

    if (replace) {
      window.history.replaceState({}, '', nextPath);
    } else {
      window.history.pushState({}, '', nextPath);
    }

    setPathname(nextPath);
  };

  return (
    <NavigationProvider value={{ pathname, navigate }}>
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

  if (pathname === '/perfil') {
    return <Perfil />;
  }

  if (pathname === '/escalas') {
    return <Escalas />;
  }

  return <Home />;
}

export default App;
