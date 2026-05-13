"use client";

import { useEffect, useRef, useState } from 'react';
import { Bot, User, SendHorizonal, Sparkles, Trash2, Zap, Expand, Minimize2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkdownContent } from './markdown-content';
import { ModelInfoBadge } from './model-info-badge';
import { useAIModel } from '@/contexts/AIModelContext';
import { askPortfolioChat } from '@/lib/actions/portfolio';
import { cn } from '@/lib/utils';
import type { PortfolioChatMessage } from '@/ai/flows/portfolio-chat-flow';

const SESSION_KEY = 'finwise.portfolio-chat.messages.v1';
const FOLLOWUPS_KEY = 'finwise.portfolio-chat.followups.v1';

const QUICK_ACTIONS = [
  'Analyze my overall portfolio.',
  'Which asset is dragging my portfolio?',
  'What is my XIRR breakdown by asset?',
  'Am I too concentrated in any asset type?',
  'Compare my best and worst performer.',
  'What data should I add to improve analysis?',
];

const ASSET_SCOPED_ACTIONS = (assetName: string) => [
  `Summarize ${assetName}.`,
  `What is my realized vs unrealized P&L on ${assetName}?`,
  `Show my buy/sell cadence on ${assetName}.`,
  `Should I add more data points for ${assetName}?`,
];

function loadSession<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

interface PortfolioChatProps {
  scopedAssetId?: string;
  scopedAssetName?: string;
  className?: string;
  defaultExpanded?: boolean;
}

export function PortfolioChat({ scopedAssetId, scopedAssetName, className, defaultExpanded = false }: PortfolioChatProps) {
  const { selectedModel } = useAIModel();
  const sessionKey = scopedAssetId ? `${SESSION_KEY}.${scopedAssetId}` : SESSION_KEY;
  const followKey = scopedAssetId ? `${FOLLOWUPS_KEY}.${scopedAssetId}` : FOLLOWUPS_KEY;

  const [messages, setMessages] = useState<PortfolioChatMessage[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadSession<PortfolioChatMessage[]>(sessionKey, []));
    setFollowUps(loadSession<string[]>(followKey, []));
    setHydrated(true);
  }, [sessionKey, followKey]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try { sessionStorage.setItem(sessionKey, JSON.stringify(messages)); } catch {}
  }, [messages, hydrated, sessionKey]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try { sessionStorage.setItem(followKey, JSON.stringify(followUps)); } catch {}
  }, [followUps, hydrated, followKey]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const viewport = scrollRef.current.querySelector('div[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages, isLoading]);

  const send = async (text: string) => {
    const query = text.trim();
    if (!query || isLoading) return;
    const userMsg: PortfolioChatMessage = { role: 'user', content: query };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setFollowUps([]);
    try {
      const result = await askPortfolioChat({
        query,
        chatHistory: messages.slice(-6),
        model: selectedModel,
        scopedAssetId,
      });
      setMessages(prev => [...prev, { role: 'assistant', content: result.response, model: result.model }]);
      setFollowUps(result.followUpQuestions ?? []);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, an error occurred: ${err?.message || 'Unknown error'}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clear = () => {
    setMessages([]);
    setFollowUps([]);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(sessionKey);
      sessionStorage.removeItem(followKey);
    }
  };

  const quickActions = scopedAssetId && scopedAssetName
    ? ASSET_SCOPED_ACTIONS(scopedAssetName)
    : QUICK_ACTIONS;

  return (
    <Card className={cn("shadow-lg border-accent/30", isExpanded ? "h-[640px]" : "h-[520px]", "flex flex-col", className)}>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="h-5 w-5 text-primary" />
            Portfolio Chat
          </CardTitle>
          <CardDescription className="text-xs">
            {scopedAssetName ? `Scoped to ${scopedAssetName}` : 'Scoped to your portfolio data'}
          </CardDescription>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Clear" onClick={clear}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" title={isExpanded ? 'Compact' : 'Expand'} onClick={() => setIsExpanded(v => !v)}>
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden p-0">
        <ScrollArea className="flex-1 px-4 py-4 w-full" ref={scrollRef}>
          {messages.length === 0 && !isLoading && (
            <div className="text-sm text-muted-foreground space-y-3">
              <p>Ask anything about your portfolio. Quick starts:</p>
              <div className="flex flex-wrap gap-2">
                {quickActions.map((prompt, i) => (
                  <Button key={i} variant="outline" size="sm" className="text-xs h-auto py-1 px-2 whitespace-normal break-words" onClick={() => send(prompt)}>
                    <Sparkles className="mr-1.5 h-3 w-3 flex-shrink-0" />
                    <span>{prompt}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
                <Avatar className="h-8 w-8 border flex-shrink-0">
                  <AvatarFallback className="bg-transparent text-primary">
                    {msg.role === 'user' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-sm pt-1">
                  <MarkdownContent content={msg.content} />
                  {msg.role === 'assistant' && msg.model && (
                    <div className="mt-2 flex justify-end"><ModelInfoBadge model={msg.model} /></div>
                  )}
                </div>
              </motion.div>
            ))}
            {isLoading && (
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8 border flex-shrink-0">
                  <AvatarFallback className="bg-transparent text-primary"><Bot className="h-5 w-5 animate-pulse" /></AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2 py-2">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        {followUps.length > 0 && !isLoading && (
          <div className="flex flex-wrap gap-2 px-4 pt-2 border-t bg-background/40">
            <span className="w-full text-[10px] uppercase tracking-wide text-muted-foreground pt-1">Suggested follow-ups</span>
            {followUps.map((q, i) => (
              <Button key={i} variant="outline" size="sm" className="text-xs h-auto py-1 px-2 whitespace-normal break-words" onClick={() => send(q)}>
                <Sparkles className="mr-1.5 h-3 w-3 flex-shrink-0" />
                {q}
              </Button>
            ))}
          </div>
        )}
        <div className="pt-3 border-t mt-auto px-4 pb-4">
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex items-center gap-2"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={scopedAssetName ? `Ask about ${scopedAssetName}...` : 'Ask about your portfolio...'}
              className="flex-1 resize-none min-h-[40px]"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              disabled={isLoading}
            />
            <Button type="submit" disabled={isLoading || !input.trim()} size="icon">
              {isLoading ? <Zap className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
