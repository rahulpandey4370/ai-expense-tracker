"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useCallback } from 'react';
import type { SessionUser } from '@/lib/auth/roles';

interface AuthContextType {
  user: SessionUser | null;
  isOwner: boolean;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  loginWithGoogle: (next?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** The session is read on the server (root layout) and handed down — no client-side key. */
export function AuthProvider({ children, initialUser }: { children: ReactNode; initialUser: SessionUser | null }) {
  const loginWithGoogle = useCallback((next?: string) => {
    window.location.href = `/auth/login${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  }, []);

  const logout = useCallback(async () => {
    await fetch('/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{
      user: initialUser,
      isOwner: !!initialUser?.isOwner,
      isAuthenticated: !!initialUser,
      isLoadingAuth: false,
      loginWithGoogle,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
