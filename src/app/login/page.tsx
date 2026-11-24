"use client";

import { Suspense, useState } from 'react';
import { motion } from "framer-motion";
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppLogo } from '@/components/app-logo';
import { Loader2 } from 'lucide-react';

const pageVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: "circOut" } },
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mr-2 h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1a6.5 6.5 0 0 1-6.1-4.5H2.2v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.9 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8l3.7-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.2 7.1l3.7 2.8A6.5 6.5 0 0 1 12 5.4Z" />
    </svg>
  );
}

function LoginCard() {
  const { loginWithGoogle } = useAuth();
  const params = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const error = params.get('error');

  return (
    <Card className="shadow-2xl border-primary/20 bg-card/90 backdrop-blur-sm rounded-xl overflow-hidden">
      <CardHeader className="items-center text-center p-6 sm:p-8 bg-primary/5 dark:bg-primary/10">
        <AppLogo className="mb-4 text-5xl sm:text-6xl justify-center" />
        <CardTitle className="text-2xl sm:text-3xl font-bold text-primary">Welcome to FinWise AI</CardTitle>
        <CardDescription className="text-sm sm:text-base text-muted-foreground mt-1">
          Sign in to manage your finances or open your split groups.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-6 sm:p-8">
        {error && (
          <p className="text-sm text-red-500 dark:text-red-400 text-center">Sign-in didn&apos;t complete. Please try again.</p>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={() => { setIsLoading(true); loginWithGoogle(params.get('next') ?? undefined); }}
          className="w-full rounded-full py-6 text-base font-semibold"
        >
          {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <GoogleIcon />}
          Continue with Google
        </Button>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-secondary/30 dark:from-slate-900 dark:to-slate-800 p-4">
      <motion.div variants={pageVariants} initial="hidden" animate="visible" className="w-full max-w-md">
        <Suspense>
          <LoginCard />
        </Suspense>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} FinWise AI. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
