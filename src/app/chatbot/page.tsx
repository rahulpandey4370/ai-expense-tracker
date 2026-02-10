"use client";

import { useState, useEffect, useCallback } from 'react';
import { FinancialChatbot } from '@/components/financial-chatbot';
import { getTransactions } from '@/lib/actions/transactions';
import type { AppTransaction } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ChatbotPage() {
  const [transactions, setTransactions] = useState<AppTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchAllTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch all transactions, chatbot can filter/use as needed
      const fetchedTransactions = await getTransactions(); 
      setTransactions(fetchedTransactions.map(t => ({...t, date: new Date(t.date)})));
    } catch (error) {
      console.error("Failed to fetch transactions for chatbot:", error);
      toast({
        title: "Error Loading Data",
        description: "Could not fetch transaction data for the chatbot.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAllTransactions();
  }, [fetchAllTransactions]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-primary">Loading Chatbot...</p>
      </div>
    );
  }
  
  return (
    <div className="h-[calc(100vh-