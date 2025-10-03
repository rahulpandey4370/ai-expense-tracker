"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { serverLogin } from '@/lib/actions/auth'; // Import the server action

interface AuthContextType {
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  login: (email?: string, password?: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = "finwiseAuthStatus";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    try {
      const storedAuthStatus = localStorage.getItem(AUTH_STORAGE_KEY);
      if (storedAuthStatus === 'true') {
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error("Error reading auth status from localStorage:", error);
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  const login = useCallback(async (email?: string, password?: string): Promise<boolean> => {
    // Call the server action to securely check credentials
    const result = await serverLogin(email, password);

    if (result.success) {
      setIsAuthenticated(true);
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, 'true');
      } catch (error) {
        console.warn("Could not save auth status to localStorage:", error);
      }
      router.push('/');
      toast({ title: "Login Successful", description: "Welcome back!" });
      return true;
    }

    toast({ title: "Login Failed", description: result.error || "Invalid email or password.", variant: "destructive" });
    return false;
  }, [router, toast]);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (error) {
      console.warn("Could not remove auth status from localStorage:", error);
    }
    router.push('/login');
    toast({ title: "Logged Out", description: "You have been successfully logged out." });
  }, [router, toast]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoadingAuth, login, logout }}>
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