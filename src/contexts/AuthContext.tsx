
"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation'; // Changed from 'next/router'
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  login: (email?: string, password?: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const HARDCODED_EMAIL = "rahul@example.com";
const HARDCODED_PASSWORD = "finwise_@i";
const AUTH_STORAGE_KEY = "finwiseAuthStatus";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true); // Start true to check localStorage
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    // Check localStorage on initial load
    try {
      const storedAuthStatus = localStorage.getItem(AUTH_STORAGE_KEY);
      if (storedAuthStatus === 'true') {
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error("Error reading auth status from localStorage:", error);
      // If localStorage is not available or blocked, default to not authenticated
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  const login = useCallback(async (email?: string, password?: string): Promise<boolean> => {
    if (email === HARDCODED_EMAIL && password === HARDCODED_PASSWORD) {
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
    toast({ title: "Login Failed", description: "Invalid email or password.", variant: "destructive" });
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
