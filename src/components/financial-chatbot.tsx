
"use client";

import { useState, useRef, useEffect } from 'react';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, User, SendHorizonal, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { askFinancialBot, type ChatMessage } from "@/ai/flows/financial-chatbot-flow";
import type { AppTransaction } from "@/lib/types"; // Using AppTransaction
import { cn } from '@/lib/utils';

interface FinancialChatbotProps {
  allTransactions: AppTransaction[];
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const messageVariants = {
  hidden: { opacity: 0, x: (message: ChatMessage) => (message.role === 'user' ? 20 : -20) },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 100 } },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

export function FinancialChatbot({ allTransactions }: FinancialChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = { role: 'user', content: inputValue.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      const result = await askFinancialBot({
        query: userMessage.content,
        transactions: allTransactions, // Pass AppTransaction array
        chatHistory: messages.slice(-5),
      });
      const assistantMessage: ChatMessage = { role: 'assistant', content: result.response };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error("Error with financial chatbot:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to get a response from the AI. Please try again.";
      setError(errorMessage);
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, an error occurred: ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <Card className={cn("shadow-lg flex flex-col h-[500px]", glowClass)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Bot className="h-6 w-6 text-primary" /> FinWise AI Financial Assistant
          </CardTitle>
          <CardDescription>Ask questions about your finances. Powered by AI.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
          <ScrollArea className="flex-1 p-4 pr-2" ref={scrollAreaRef}>
            <div className="space-y-4">
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  custom={message}
                  variants={messageVariants}
                  initial="hidden"
                  animate="visible"
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg max-w-[85%]",
                    message.role === 'user' ? "ml-auto bg-primary/10 text-primary-foreground-dark" : "mr-auto bg-accent/10 text-accent-foreground-dark"
                  )}
                >
                  <Avatar className={cn("h-8 w-8", message.role === 'user' ? 'order-2' : 'order-1')}>
                    <AvatarImage
                      src={message.role === 'user' ? "https://placehold.co/100x100.png" : "https://placehold.co/100x100.png"}
                      alt={message.role}
                      data-ai-hint={message.role === 'user' ? 'user avatar' : 'robot avatar'}
                    />
                    <AvatarFallback>{message.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</AvatarFallback>
                  </Avatar>
                  <div className={cn("flex-1 break-words text-sm", message.role === 'user' ? 'order-1 text-right text-foreground' : 'order-2 text-foreground')}>
                    {message.content.split('\n').map((line, i) => (<p key={i}>{line}</p>))}
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/10 mr-auto max-w-[85%]">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="https://placehold.co/100x100.png" alt="AI thinking" data-ai-hint="robot avatar" />
                    <AvatarFallback><Bot className="h-4 w-4 animate-pulse" /></AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2 py-1">
                    <Skeleton className="h-3 w-4/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                </div>
              )}
              {error && !isLoading && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 text-destructive mr-auto max-w-[85%]">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback><Bot className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                  <p className="flex-1 break-words text-sm">{error}</p>
                </div>
              )}
              {messages.length === 0 && !isLoading && !error && (
                <p className="text-center text-muted-foreground text-sm py-4">
                  Ask me anything about your transactions! For example: "What was my total spending on groceries this month?" or "Compare my income and expenses."
                </p>
              )}
            </div>
          </ScrollArea>
          <div className="border-t p-4">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask a financial question..."
                className="flex-1 resize-none min-h-[40px]"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                disabled={isLoading}
              />
              <Button 
                type="submit" 
                disabled={isLoading || !inputValue.trim()} 
                size="icon" 
                className="bg-primary hover:bg-primary/90"
                withMotion 
              >
                {isLoading ? <Zap className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                <span className="sr-only">Send</span>
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
    
