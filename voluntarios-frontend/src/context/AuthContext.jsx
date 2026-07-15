/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../lib/api';

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

function clearStoredAuth() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_USER_KEY);
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    let ativo = true;

    async function carregarSessao() {
      const stored = readStoredAuth();

      if (!stored.token) {
        if (!ativo) return;
        setToken(null);
        setUsuario(null);
        setCarregado(true);
        return;
      }

      try {
        const resposta = await fetch(buildApiUrl('/api/auth/me'), {
          headers: {
            Authorization: `Bearer ${stored.token}`,
          },
        });
        const dados = await resposta.json().catch(() => ({}));

        if (!resposta.ok) {
          throw new Error(dados.erro || 'Sessão inválida.');
        }

        if (!ativo) return;
        setToken(stored.token);
        setUsuario(dados.usuario);
        window.localStorage.setItem(TOKEN_KEY, stored.token);
        window.localStorage.setItem(USER_KEY, JSON.stringify(dados.usuario));
      } catch {
        if (!ativo) return;
        clearStoredAuth();
        setToken(null);
        setUsuario(null);
      } finally {
        if (ativo) {
          setCarregado(true);
        }
      }
    }

    carregarSessao();

    return () => {
      ativo = false;
    };
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
    clearStoredAuth();
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
