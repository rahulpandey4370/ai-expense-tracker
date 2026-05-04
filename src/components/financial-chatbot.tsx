"use client";

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User, SendHorizonal, Zap, Sparkles, Expand, Minimize2, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { askFinancialBot, type ChatMessage } from "@/ai/flows/financial-chatbot-flow";
import type { AppTransaction } from "@/lib/types";
import { cn } from '@/lib/utils';
import { useAIModel } from '@/contexts/AIModelContext';
import { ModelInfoBadge } from './model-info-badge';
import { MarkdownContent } from './markdown-content';
import Link from 'next/link';
import { useDateSelection } from '@/contexts/DateSelectionContext';
import { isSameCalendarMonth } from '@/lib/date-utils';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface FinancialChatbotProps {
  allTransactions: AppTransaction[];
  isPage?: boolean;
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const messageVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

const examplePrompts = [
  "What was my total spending on groceries this month?",
  "Show me all my 'want' expenses for this month.",
  "Compare my income and expenses for the last 3 months.",
  "What are my top 3 spending categories this month?",
];

// Per-session keys so embedded + fullscreen views share the same conversation.
const CHAT_SESSION_KEY = 'finwise.chat.messages.v1';
const CHAT_FOLLOWUPS_KEY = 'finwise.chat.followUps.v1';

function loadSessionMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(CHAT_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as ChatMessage[] : [];
  } catch {
    return [];
  }
}
function loadSessionFollowUps(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(CHAT_FOLLOWUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as string[] : [];
  } catch {
    return [];
  }
}

export function FinancialChatbot({ allTransactions, isPage = false }: FinancialChatbotProps) {
  // Hydrate from sessionStorage so navigating between dashboard ↔ /chatbot does not lose context.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerbose, setIsVerbose] = useState<boolean>(false); // Add verbose state
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadSessionMessages());
    setFollowUps(loadSessionFollowUps());
    setHydrated(true);
  }, []);

  // Persist messages whenever they change, but only after initial hydration so we don't wipe storage on mount.
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(CHAT_SESSION_KEY, JSON.stringify(messages));
    } catch {/* quota; ignore */}
  }, [messages, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(CHAT_FOLLOWUPS_KEY, JSON.stringify(followUps));
    } catch {/* ignore */}
  }, [followUps, hydrated]);

  const handleClearConversation = () => {
    setMessages([]);
    setFollowUps([]);
    setError(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(CHAT_SESSION_KEY);
      sessionStorage.removeItem(CHAT_FOLLOWUPS_KEY);
    }
  };
  const { selectedModel } = useAIModel();
  const { selectedMonth, selectedYear } = useDateSelection();

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement> | string) => {
    if (e && typeof e !== 'string') {
      e.preventDefault();
    }
    const query = (typeof e === 'string' ? e : inputValue).trim();
    if (!query) return;

    // Filter transactions based on selected month and year
    const filteredTransactions = allTransactions.filter(t =>
      isSameCalendarMonth(t.date, selectedMonth, selectedYear)
    );

    const userMessage: ChatMessage = { role: 'user', content: query };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);
    setFollowUps([]);

    try {
      const result = await askFinancialBot({
        query: userMessage.content,
        transactions: filteredTransactions,
        chatHistory: messages.slice(-5),
        model: selectedModel,
        verbose: isVerbose, // Pass verbose flag
      });
      const assistantMessage: ChatMessage = { role: 'assistant', content: result.response, model: result.model };
      setMessages(prev => [...prev, assistantMessage]);
      setFollowUps(result.followUpQuestions ?? []);
    } catch (err) {
      console.error("Error with financial chatbot:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to get a response from the AI. Please try again.";
      setError(errorMessage);
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, an error occurred: ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const ChatMessageContent = ({ message }: { message: ChatMessage }) => (
    <div className="w-full min-w-0 text-sm break-words overflow-x-auto">
      <MarkdownContent content={message.content} />
      {message.role === 'assistant' && message.model && (
        <div className="mt-2 flex justify-end"><ModelInfoBadge model={message.model} /></div>
      )}
    </div>
  );

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible" className={cn(isPage && "h-full flex flex-col min-h-0 flex-1")}>
      <Card className={cn(
        "flex flex-col",
        isPage ? "h-full w-full rounded-none border-none" : "h-[500px] shadow-lg",
        glowClass
      )}>
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg"><Bot className="h-5 w-5 text-primary" /> FinWise AI</CardTitle>
            <CardDescription className="text-xs">Financial Assistant</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center space-x-2">
              <Switch id="verbose-mode" checked={isVerbose} onCheckedChange={setIsVerbose} />
              <Label htmlFor="verbose-mode" className="text-xs font-normal cursor-pointer">Verbose</Label>
            </div>
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Clear conversation" onClick={handleClearConversation}>
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Clear conversation</span>
              </Button>
            )}
            {!isPage ? (
              <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                <Link href="/chatbot">
                  <Expand className="h-4 w-4" />
                  <span className="sr-only">Expand Chatbot</span>
                </Link>
              </Button>
            ) : (
              <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Back to dashboard">
                <Link href="/">
                  <Minimize2 className="h-4 w-4" />
                  <span className="sr-only">Minimize and return to dashboard</span>
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden p-0">
          <ScrollArea className="flex-1 px-4 py-4 w-full" ref={scrollAreaRef}>
            {/* ... (rest of the content) */}

            <div className="space-y-4 w-full max-w-full overflow-hidden">
              {messages.map((message, index) => (
                <motion.div key={index} variants={messageVariants} initial="hidden" animate="visible" className={cn("flex items-start gap-3 w-full min-w-0 overflow-hidden")}>
                  <Avatar className="h-8 w-8 border flex-shrink-0"><AvatarFallback className="bg-transparent text-primary">{message.role === 'user' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}</AvatarFallback></Avatar>
                  <div className="flex-1 text-foreground pt-1 min-w-0 overflow-hidden"><ChatMessageContent message={message} /></div>
                </motion.div>
              ))}
              {isLoading && (<div className="flex items-start gap-3"><Avatar className="h-8 w-8 border flex-shrink-0"><AvatarFallback className="bg-transparent text-primary"><Bot className="h-5 w-5 animate-pulse" /></AvatarFallback></Avatar><div className="flex-1 space-y-2 py-2"><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-3/5" /></div></div>)}
              {error && !isLoading && (<div className="flex items-start gap-3 text-destructive"><Avatar className="h-8 w-8 border border-destructive flex-shrink-0"><AvatarFallback className="bg-transparent"><Bot className="h-5 w-5" /></AvatarFallback></Avatar><p className="flex-1 break-words text-sm pt-1 min-w-0">{error}</p></div>)}
              {messages.length === 0 && !isLoading && !error && (
                <div className="text-center text-muted-foreground text-sm py-4 space-y-3 w-full">
                  <p>Ask me anything! Or try one of these examples:</p>
                  <div className="flex flex-wrap justify-center gap-2 w-full">
                    {examplePrompts.map((prompt, i) => (<Button key={i} variant="outline" size="sm" className="text-xs h-auto py-1 px-2 flex-shrink-0 whitespace-normal break-words max-w-full" onClick={() => handleSubmit(prompt)}><Sparkles className="mr-1.5 h-3 w-3 flex-shrink-0" /><span className="inline-block">{prompt}</span></Button>))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          {followUps.length > 0 && !isLoading && (
            <div className={cn("flex flex-wrap gap-2 px-4 pt-2 border-t bg-background/40", isPage && "px-6")}>
              <span className="w-full text-[10px] uppercase tracking-wide text-muted-foreground pt-1">Suggested follow-ups</span>
              {followUps.map((q, i) => (
                <Button key={i} variant="outline" size="sm" className="text-xs h-auto py-1 px-2 whitespace-normal break-words" onClick={() => handleSubmit(q)}>
                  <Sparkles className="mr-1.5 h-3 w-3 flex-shrink-0" />
                  {q}
                </Button>
              ))}
            </div>
          )}
          <div className={cn("pt-4 border-t mt-auto", isPage && "px-6 pb-4")}>
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <Textarea value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Ask a financial question..." className="flex-1 resize-none min-h-[40px]" rows={1} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }} disabled={isLoading} />
              <Button type="submit" disabled={isLoading || !inputValue.trim()} size="icon" className="bg-primary hover:bg-primary/90" withMotion>{isLoading ? <Zap className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}<span className="sr-only">Send</span></Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
