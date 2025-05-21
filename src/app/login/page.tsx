
"use client";

import { useState, type FormEvent } from 'react';
import { motion } from "framer-motion";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppLogo } from '@/components/app-logo';
import { Loader2, LogIn } from 'lucide-react';
import { cn } from '@/lib/utils';

const pageVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: "circOut" } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const success = await login(email, password);
    if (!success) {
      setError('Invalid email or password. Please try again.');
    }
    // Navigation is handled by the login function
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-secondary/30 dark:from-slate-900 dark:to-slate-800 p-4">
      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md"
      >
        <Card className="shadow-2xl border-primary/20 bg-card/90 backdrop-blur-sm rounded-xl overflow-hidden">
          <CardHeader className="items-center text-center p-6 sm:p-8 bg-primary/5 dark:bg-primary/10">
            <motion.div variants={itemVariants} className="mb-4">
              <AppLogo className="text-5xl sm:text-6xl justify-center" />
            </motion.div>
            <motion.div variants={itemVariants}>
              <CardTitle className="text-2xl sm:text-3xl font-bold text-primary">
                Welcome to FinWise AI
              </CardTitle>
              <CardDescription className="text-sm sm:text-base text-muted-foreground mt-1">
                Sign in to manage your finances.
              </CardDescription>
            </motion.div>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <motion.form
              onSubmit={handleSubmit}
              className="space-y-6"
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
            >
              <motion.div variants={itemVariants} className="space-y-2">
                <Label htmlFor="email" className="text-foreground/90">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your email"
                  required
                  className="bg-background/70 border-border/70 focus:border-primary focus:ring-primary"
                />
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-2">
                <Label htmlFor="password" className="text-foreground/90">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="your password"
                  required
                  className="bg-background/70 border-border/70 focus:border-primary focus:ring-primary"
                />
              </motion.div>
              {error && (
                <motion.p variants={itemVariants} className="text-sm text-red-500 dark:text-red-400 text-center">
                  {error}
                </motion.p>
              )}
              <motion.div variants={itemVariants}>
                <Button type="submit" disabled={isLoading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base py-3">
                  {isLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <LogIn className="mr-2 h-5 w-5" />
                  )}
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </Button>
              </motion.div>
            </motion.form>
          </CardContent>
        </Card>
        <motion.p variants={itemVariants} className="mt-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} FinWise AI. All rights reserved.
        </motion.p>
      </motion.div>
    </div>
  );
}
