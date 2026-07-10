import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from './api';

/* ============================================================
   AuthContext — Zero-cost NGO Coordinator Authentication
   Uses sessionStorage (tab-scoped, expires on close)
   ============================================================ */

const AuthContext = createContext(null);

const STORAGE_KEY = 'rs_ngo_token';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(STORAGE_KEY));
  const [loading, setLoading] = useState(false);

  const isAuthenticated = !!token;

  // Sync token to sessionStorage
  useEffect(() => {
    if (token) {
      sessionStorage.setItem(STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [token]);

  const login = useCallback(async (passcode) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { passcode });
      const newToken = res.data.token;
      setToken(newToken);
      return { success: true, data: res.data };
    } catch (err) {
      const detail =
        err.response?.data?.detail ||
        (err.code === 'ERR_NETWORK'
          ? 'Backend unreachable — cannot authenticate while offline.'
          : 'Authentication failed.');
      return { success: false, error: detail };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export default AuthContext;
