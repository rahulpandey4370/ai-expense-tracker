
"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, User, SendHorizonal, Zap, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { askFinancialBot, type ChatMessage } from "@/ai/flows/financial-chatbot-flow";
import type { AppTransaction } from "@/lib/types"; // Using AppTransaction
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAIModel } from '@/contexts/AIModelContext';
import { ModelInfoBadge } from './model-info-badge';


interface FinancialChatbotProps {
  allTransactions: AppTransaction[];
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

interface ParsedTable {
    headers: string[];
    rows: string[][];
}

const parseTableFromResponse = (text: string): { intro: string; tableData: ParsedTable | null; outro: string } => {
    const tableStartToken = '[START_TABLE]';
    const tableEndToken = '[END_TABLE]';

    const startIdx = text.indexOf(tableStartToken);
    const endIdx = text.indexOf(tableEndToken);

    if (startIdx === -1 || endIdx === -1) {
        return { intro: text, tableData: null, outro: '' };
    }

    const intro = text.substring(0, startIdx).trim();
    const outro = text.substring(endIdx + tableEndToken.length).trim();
    
    const tableContent = text.substring(startIdx + tableStartToken.length, endIdx).trim();
    const rows = tableContent.split('\n').map(row => row.split('|').map(cell => cell.trim()));
    
    if (rows.length === 0) {
        return { intro, tableData: null, outro };
    }

    // Since we now have a fixed format from the prompt, we can hardcode headers.
    const headers = ['Date', 'Amount', 'Description', 'Category'];

    return { intro, tableData: { headers, rows }, outro };
};


export function FinancialChatbot({ allTransactions }: FinancialChatbotProps) {
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
  }, [messages]);

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
        transactions: allTransactions, // Pass AppTransaction array
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
  
  const ChatMessageContent = ({ message }: { message: ChatMessage }) => {
    const { intro, tableData, outro } = useMemo(() => parseTableFromResponse(message.content), [message.content]);

    return (
        <div className="flex-1 break-words text-sm whitespace-pre-wrap">
            {intro && <p className="mb-2">{intro}</p>}
            {tableData && (
                <div className="my-2 overflow-x-auto rounded-md border bg-background/50">
                    <Table className="text-xs">
                        <TableHeader>
                            <TableRow>
                                {tableData.headers.map((header, i) => (
                                    <TableHead key={i} className="font-semibold text-foreground">{header}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tableData.rows.map((row, i) => (
                                <TableRow key={i}>
                                    {row.map((cell, j) => (
                                        <TableCell key={j}>{cell}</TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            {outro && <p className="mt-2">{outro}</p>}
            {message.role === 'assistant' && message.model && (
                <div className="mt-2 flex justify-end">
                    <ModelInfoBadge model={message.model} />
                </div>
            )}
        </div>
    );
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
        <CardContent className="flex-1 flex flex-col min-h-0">
          <ScrollArea className="flex-1 -mx-6 px-6" ref={scrollAreaRef}>
            <div className="space-y-4 pr-6">
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  variants={messageVariants}
                  initial="hidden"
                  animate="visible"
                  className={cn(
                    "flex items-start gap-3"
                  )}
                >
                  <Avatar className="h-8 w-8 border">
                    <AvatarFallback className="bg-transparent text-primary">{message.role === 'user' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-foreground pt-1">
                     <ChatMessageContent message={message} />
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8 border">
                    <AvatarFallback className="bg-transparent text-primary"><Bot className="h-5 w-5 animate-pulse" /></AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2 py-2">
                    <Skeleton className="h-3 w-4/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                </div>
              )}
              {error && !isLoading && (
                <div className="flex items-start gap-3 text-destructive">
                   <Avatar className="h-8 w-8 border border-destructive">
                    <AvatarFallback className="bg-transparent"><Bot className="h-5 w-5" /></AvatarFallback>
                  </Avatar>
                  <p className="flex-1 break-words text-sm pt-1">{error}</p>
                </div>
              )}
              {messages.length === 0 && !isLoading && !error && (
                <div className="text-center text-muted-foreground text-sm py-4 space-y-3">
                    <p>Ask me anything! Or try one of these examples:</p>
                    <div className="flex flex-wrap justify-center gap-2">
                        {examplePrompts.map((prompt, i) => (
                            <Button key={i} variant="outline" size="sm" className="text-xs" onClick={() => handleSubmit(prompt)}>
                                <Sparkles className="mr-1.5 h-3 w-3" />
                                {prompt}
                            </Button>
                        ))}
                    </div>
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="pt-4 border-t">
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
