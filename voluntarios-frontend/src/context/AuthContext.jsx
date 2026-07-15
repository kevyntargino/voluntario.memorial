/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

const TOKEN_KEY = 'mcom_token';
const USER_KEY = 'mcom_usuario';
const LEGACY_TOKEN_KEY = 'cadencia_token';
const LEGACY_USER_KEY = 'cadencia_usuario';

function readStoredAuth() {
  if (typeof window === 'undefined') {
    return { token: null, usuario: null };
  }

  const token = window.localStorage.getItem(TOKEN_KEY) || window.localStorage.getItem(LEGACY_TOKEN_KEY);
  const usuarioRaw = window.localStorage.getItem(USER_KEY) || window.localStorage.getItem(LEGACY_USER_KEY);

  let usuario = null;

  if (usuarioRaw) {
    try {
      usuario = JSON.parse(usuarioRaw);
    } catch {
      window.localStorage.removeItem(USER_KEY);
      window.localStorage.removeItem(LEGACY_USER_KEY);
    }
  }

  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  }

  if (usuario) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(usuario));
    window.localStorage.removeItem(LEGACY_USER_KEY);
  }

  return { token, usuario };
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    const stored = readStoredAuth();
    setToken(stored.token);
    setUsuario(stored.usuario);
    setCarregado(true);
  }, []);

  const login = useCallback((novoToken, novoUsuario) => {
    setToken(novoToken);
    setUsuario(novoUsuario);
    window.localStorage.setItem(TOKEN_KEY, novoToken);
    window.localStorage.setItem(USER_KEY, JSON.stringify(novoUsuario));
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    window.localStorage.removeItem(LEGACY_USER_KEY);
  }, []);

  const atualizarUsuario = useCallback((novoUsuario) => {
    setUsuario(novoUsuario);
    window.localStorage.setItem(USER_KEY, JSON.stringify(novoUsuario));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUsuario(null);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    window.localStorage.removeItem(LEGACY_USER_KEY);
  }, []);

  const value = useMemo(() => ({
    token,
    usuario,
    carregado,
    isAuthenticated: Boolean(token),
    login,
    logout,
    atualizarUsuario,
  }), [atualizarUsuario, carregado, token, usuario, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }

  return context;
}
