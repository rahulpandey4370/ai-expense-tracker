"use client";

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User, SendHorizonal, Zap, Sparkles, Expand } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { askFinancialBot, type ChatMessage } from "@/ai/flows/financial-chatbot-flow";
import type { AppTransaction } from "@/lib/types";
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAIModel } from '@/contexts/AIModelContext';
import { ModelInfoBadge } from './model-info-badge';
import Link from 'next/link';

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

const MarkdownContent = ({ content }: { content: string }) => {
  const parts = content.split(/(\[START_TABLE\][\s\S]*?\[END_TABLE\])/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('[START_TABLE]') && part.endsWith('[END_TABLE]')) {
          const tableContent = part.replace('[START_TABLE]', '').replace('[END_TABLE]', '').trim();
          if (!tableContent) return null;

          const rows = tableContent.split('\n').map(row => row.split('|').map(cell => cell.trim()));
          const headers = ['Date', 'Amount', 'Description', 'Category'];

          return (
            <div key={index} className="my-2 w-full max-w-full overflow-x-auto rounded-md border bg-background/50">
              <Table className="text-xs min-w-[500px] sm:min-w-0">
                <TableHeader><TableRow>{headers.map((header, i) => <TableHead key={i} className="font-semibold whitespace-nowrap">{header}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{rows.map((row, i) => (<TableRow key={i}>{row.map((cell, j) => <TableCell key={j} className="whitespace-nowrap">{cell}</TableCell>)}</TableRow>))}</TableBody>
              </Table>
            </div>
          );
        } else if (part.trim()) {
          const lines = part.trim().split('\n');
          return (
            <div key={index} className="space-y-1">
              {lines.map((line, lineIndex) => {
                if (line.startsWith('### ')) {
                  return <h3 key={lineIndex} className="text-lg font-semibold mt-2">{line.substring(4)}</h3>;
                }
                if (line.trim().startsWith('• ') || line.trim().startsWith('- ')) {
                  const listItemContent = line.trim().substring(2);
                  const boldedContent = listItemContent.split(/(\*\*.*?\*\*)/g).map((segment, segIndex) => {
                    if (segment.startsWith('**') && segment.endsWith('**')) {
                      return <strong key={segIndex}>{segment.substring(2, segment.length - 2)}</strong>;
                    }
                    return <span key={segIndex}>{segment}</span>;
                  });
                  return <div key={lineIndex} className="flex items-start gap-2 ml-2"><span className="mt-1"> •</span><p>{boldedContent}</p></div>;
                }
                const boldedLine = line.split(/(\*\*.*?\*\*)/g).map((segment, segIndex) => {
                  if (segment.startsWith('**') && segment.endsWith('**')) {
                    return <strong key={segIndex}>{segment.substring(2, segment.length - 2)}</strong>;
                  }
                  return <span key={segIndex}>{segment}</span>;
                });
                return <p key={lineIndex}>{boldedLine}</p>;
              })}
            </div>
          );
        }
        return null;
      })}
    </>
  );
};

export function FinancialChatbot({ allTransactions, isPage = false }: FinancialChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { selectedModel } = useAIModel();

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

    const userMessage: ChatMessage = { role: 'user', content: query };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      const result = await askFinancialBot({
        query: userMessage.content,
        transactions: allTransactions,
        chatHistory: messages.slice(-5),
        model: selectedModel,
      });
      const assistantMessage: ChatMessage = { role: 'assistant', content: result.response, model: result.model };
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

  const ChatMessageContent = ({ message }: { message: ChatMessage }) => (
    <div className="w-full min-w-0 text-sm break-words overflow-x-auto whitespace-pre-wrap">
      <MarkdownContent content={message.content} />
      {message.role === 'assistant' && message.model && (
        <div className="mt-2 flex justify-end"><ModelInfoBadge model={message.model} /></div>
      )}
    </div>
  );

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible" className={cn(isPage && "h-full")}>
      <Card className={cn(
        "flex flex-col",
        isPage ? "h-full w-full rounded-none border-none" : "h-[500px] shadow-lg",
        glowClass
      )}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-xl"><Bot className="h-6 w-6 text-primary" /> FinWise AI Financial Assistant</CardTitle>
            <CardDescription>Ask questions about your finances. Powered by AI.</CardDescription>
          </div>
          {!isPage && (
            <Link href="/chatbot" passHref>
              <Button asChild variant="ghost" size="icon">
                <a><Expand className="h-5 w-5" /><span className="sr-only">Expand Chatbot</span></a>
              </Button>
            </Link>
          )}
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <ScrollArea className="flex-1 pr-4 w-full" ref={scrollAreaRef}>
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
          <div className={cn("pt-4 border-t mt-auto", isPage && "px-6 pb-4")}>
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <Textarea value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Ask a financial question..." className="flex-1 resize-none min-h-[40px]" rows={1} onKeyDown={(e) => {if (e.key === 'Enter' && !e.shiftKey) {e.preventDefault();handleSubmit();}}} disabled={isLoading} />
              <Button type="submit" disabled={isLoading || !inputValue.trim()} size="icon" className="bg-primary hover:bg-primary/90" withMotion>{isLoading ? <Zap className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}<span className="sr-only">Send</span></Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
