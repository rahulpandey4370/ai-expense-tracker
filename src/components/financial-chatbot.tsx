"use client";

import { useState, useRef, useEffect } from 'react';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User, SendHorizonal, Zap, Sparkles, Expand, Minimize2, History, Plus, Paperclip, X, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { askFinancialBot } from "@/ai/flows/financial-chatbot-flow";
import { clearChat, getChat, rememberFact, renameChat, undoChatDelete } from "@/ai/flows/chat-actions";
import type { AppTransaction } from "@/lib/types";
import { toAttachment } from '@/lib/attachment';
import type { ChatAttachment, ChatItem, ChatOptions, ChatTurnResult } from "@/lib/chat-types";
import { cn } from '@/lib/utils';
import { useAIModel } from '@/contexts/AIModelContext';
import Link from 'next/link';
import { useDateSelection } from '@/contexts/DateSelectionContext';
import { isSameCalendarMonth } from '@/lib/date-utils';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useInvalidateFinance } from '@/hooks/use-finance-queries';
import { AssistantText, ChatTable, CompactedDivider, ConfirmCard, MemoryLine, ResultLine, UserText } from './chat/chat-items';
import { ChatHistorySheet } from './chat/chat-history';

interface FinancialChatbotProps {
  isPage?: boolean;
  /** Sample data for /demo. When set, the chat answers from it and never reads or writes the database. */
  allTransactions?: AppTransaction[];
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

/** Sends a chat turn to /api/chat and hands each new piece of the reply to onText as it is written. */
async function streamChat(body: unknown, onText: (delta: string) => void): Promise<ChatTurnResult> {
  const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const msg = await res.json().then(j => j?.error, () => undefined);
    throw new Error(msg ?? (res.status === 413 ? 'That file is too large. Keep it under 3 MB.' : "The AI couldn't answer just now. Please try again."));
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.t === 'text') onText(msg.d);
      else if (msg.t === 'done') return msg.result;
      else if (msg.t === 'error') throw new Error(msg.message);
    }
  }
  throw new Error("The AI couldn't answer just now. Please try again.");
}

/** The reply so far, without the follow-up list (or a half-written marker) at its end. */
const visibleSoFar = (raw: string) => raw.split(/\[FOLLOWUPS\]/i)[0].replace(/\[[A-Z/]*$/i, '').trim();

const examplePrompts = [
  "What were my top 3 spending categories this month?",
  "Add ₹450 Swiggy dinner yesterday",
  "Compare my income and expenses for the last 3 months.",
  "Who owes me money right now?",
];
/** /demo can't change data or see people, so it only gets read-only examples. */
const DEMO_PROMPTS = [examplePrompts[0], examplePrompts[2], "Show me all my 'want' expenses for this month."];

// The open chat is remembered per device, so the dashboard and /chatbot show the same one.
const CURRENT_CHAT_KEY = 'finwise.chat.current.v2';
const CHAT_VERBOSE_KEY = 'finwise.chat.verbose.v1';
const CHAT_INVESTMENT_MODE_KEY = 'finwise.chat.investmentMode.v1';
const MAX_FILES = 3;

function readFlag(key: string): boolean {
  try { return sessionStorage.getItem(key) === '1'; } catch { return false; }
}
function writeFlag(key: string, on: boolean) {
  try { sessionStorage.setItem(key, on ? '1' : '0'); } catch { /* private mode */ }
}
function readCurrentChat(): string | undefined {
  try { return localStorage.getItem(CURRENT_CHAT_KEY) || undefined; } catch { return undefined; }
}
function writeCurrentChat(id?: string) {
  try { if (id) localStorage.setItem(CURRENT_CHAT_KEY, id); else localStorage.removeItem(CURRENT_CHAT_KEY); } catch { /* private mode */ }
}

/** Slash commands, run in the browser without asking the AI (except /review). */
const COMMANDS: { name: string; arg?: string; hint: string }[] = [
  { name: 'clear', hint: 'Erase this chat and start over in it' },
  { name: 'new', hint: 'Start a new chat' },
  { name: 'history', hint: 'Your last 10 chats and saved facts' },
  { name: 'rename', arg: 'name', hint: 'Rename this chat' },
  { name: 'remember', arg: 'fact', hint: 'Save a fact for all future chats' },
  { name: 'review', arg: 'last', hint: 'This month so far, or last month' },
  { name: 'help', hint: 'List these commands' },
];
const HELP_TEXT = `**Commands**\n${COMMANDS.map(c => `- \`/${c.name}${c.arg ? ` [${c.arg}]` : ''}\` ${c.hint}`).join('\n')}`;

let localId = 0;
const nextLocalId = () => `local-${++localId}`;

export function FinancialChatbot({ isPage = false, allTransactions }: FinancialChatbotProps) {
  const isDemo = !!allTransactions;
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [title, setTitle] = useState<string>('');
  const [items, setItems] = useState<ChatItem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  const [isVerbose, setIsVerbose] = useState(false);
  const [isInvestmentMode, setIsInvestmentMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const invalidate = useInvalidateFinance();
  const { selectedModel } = useAIModel();
  const { selectedMonth, selectedYear } = useDateSelection();

  const openChat = async (id: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const chat = await getChat(id);
      if (!chat) { startNewChat(); return; }
      setSessionId(chat.id);
      setTitle(chat.title);
      setItems(chat.items);
      writeCurrentChat(chat.id);
    } catch {
      setError("Couldn't open that chat.");
    } finally {
      setIsLoading(false);
      setStreamText('');
    }
  };

  const startNewChat = () => {
    setSessionId(undefined);
    setTitle('');
    setItems([]);
    setFiles([]);
    setError(null);
    writeCurrentChat(undefined);
  };

  useEffect(() => {
    setIsVerbose(readFlag(CHAT_VERBOSE_KEY));
    setIsInvestmentMode(readFlag(CHAT_INVESTMENT_MODE_KEY));
    // ?chat=<id> comes from the monthly-review notification.
    const current = isDemo ? undefined : new URLSearchParams(window.location.search).get('chat') || readCurrentChat();
    if (current) openChat(current);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (hydrated) writeFlag(CHAT_VERBOSE_KEY, isVerbose); }, [isVerbose, hydrated]);
  useEffect(() => { if (hydrated) writeFlag(CHAT_INVESTMENT_MODE_KEY, isInvestmentMode); }, [isInvestmentMode, hydrated]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [items, isLoading, streamText]);

  const options = (): ChatOptions => ({
    modelKey: selectedModel, verbose: isVerbose, investmentMode: isInvestmentMode,
    viewing: { month: selectedMonth, year: selectedYear },
  });

  const applyTurn = (r: { sessionId: string; title: string; items: ChatItem[]; error?: string }) => {
    setSessionId(r.sessionId);
    setTitle(r.title);
    setItems(r.items);
    writeCurrentChat(r.sessionId);
    if (r.error) setError(r.error);
  };

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement> | string) => {
    if (e && typeof e !== 'string') e.preventDefault();
    const query = (typeof e === 'string' ? e : inputValue).trim();
    if ((!query && !files.length) || isLoading) return;
    if (!isDemo && query.startsWith('/') && !files.length) { setInputValue(''); await runCommand(query); return; }
    const sent = files;
    setItems(prev => [...prev, { kind: 'user', id: nextLocalId(), text: query, attachments: sent.map(f => f.name) }]);
    setInputValue('');
    setFiles([]);
    setIsLoading(true);
    setError(null);
    try {
      if (isDemo) {
        // /demo answers from its sample data and keeps nothing.
        const history = items
          .filter((i): i is Extract<ChatItem, { kind: 'user' | 'assistant' }> => i.kind === 'user' || i.kind === 'assistant')
          .map(i => ({ role: i.kind, content: i.text }))
          .slice(-5);
        const result = await askFinancialBot({
          query,
          transactions: allTransactions!.filter(t => isSameCalendarMonth(t.date, selectedMonth, selectedYear)),
          chatHistory: history,
          model: selectedModel,
          verbose: isVerbose,
        });
        setItems(prev => [...prev, { kind: 'assistant', id: nextLocalId(), text: result.response, followUps: result.followUpQuestions, model: result.model }]);
      } else {
        setStreamText('');
        applyTurn(await streamChat({ sessionId, text: query, attachments: sent, options: options() }, d => setStreamText(t => t + d)));
      }
    } catch (err) {
      console.error("Chat failed:", err);
      setError(err instanceof Error && err.message.length < 120 ? err.message : "The AI couldn't answer just now. Please try again.");
    } finally {
      setIsLoading(false);
      setStreamText('');
    }
  };

  const runCommand = async (raw: string) => {
    const name = raw.slice(1).split(/\s/)[0].toLowerCase();
    const arg = raw.slice(1 + name.length).trim();
    setError(null);
    try {
      switch (name) {
        case 'clear':
          if (sessionId) await clearChat(sessionId);
          setItems([]);
          setTitle(sessionId ? 'New chat' : '');
          setFiles([]);
          toast({ title: 'Chat cleared', description: 'Earlier messages are gone. Saved facts are kept.' });
          return;
        case 'new': startNewChat(); return;
        case 'history': setHistoryOpen(true); return;
        case 'help': setItems(prev => [...prev, { kind: 'assistant', id: nextLocalId(), text: HELP_TEXT }]); return;
        case 'rename':
          if (!arg) { setError('Add a name, like /rename Goa trip.'); return; }
          if (!sessionId) { setError('Send a message first, then rename the chat.'); return; }
          await renameChat(sessionId, arg);
          setTitle(arg.replace(/\s+/g, ' ').slice(0, 80));
          return;
        case 'remember': {
          if (!arg) { setError('Add what to remember, like /remember Tanshu is my flatmate.'); return; }
          const r = await rememberFact(arg);
          if (!r.saved) { setError(r.reason ?? "That couldn't be saved."); return; }
          setItems(prev => [...prev, { kind: 'memory', id: nextLocalId(), text: `Remembered: ${r.fact}` }]);
          return;
        }
        case 'review': {
          setIsLoading(true);
          toast({ title: 'Writing your review', description: 'This takes about a minute. It opens as its own chat.' });
          const res = await fetch('/api/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ review: arg.toLowerCase().startsWith('last') ? 'last' : 'this', options: options() }),
          });
          const j = await res.json().catch(() => ({}));
          if (!res.ok || !j.sessionId) throw new Error(j.error ?? "The review couldn't be made just now.");
          await openChat(j.sessionId);
          return;
        }
        default: setError(`There's no /${name} command. Type /help to see them.`);
      }
    } catch (err) {
      console.error('Command failed:', err);
      setError(err instanceof Error && err.message.length < 120 ? err.message : "That didn't work. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Suggestions while a command name is being typed.
  const commandMatches = !isDemo && /^\/\S*$/.test(inputValue)
    ? COMMANDS.filter(c => c.name.startsWith(inputValue.slice(1).toLowerCase()))
    : [];
  const pickCommand = (c: (typeof COMMANDS)[number]) => {
    if (c.arg && c.name !== 'review') { setInputValue(`/${c.name} `); inputRef.current?.focus(); return; }
    setInputValue('');
    runCommand(`/${c.name}`);
  };

  const answerConfirmation = async (confirmationId: string, confirmed: boolean) => {
    if (!sessionId) return;
    setAnswering(confirmationId);
    setError(null);
    setItems(prev => prev.map(i => (i.kind === 'confirm' && i.id === confirmationId ? { ...i, status: confirmed ? 'confirmed' : 'cancelled' } : i)));
    setIsLoading(true);
    try {
      setStreamText('');
      applyTurn(await streamChat({ sessionId, confirmation: { id: confirmationId, confirmed }, options: options() }, d => setStreamText(t => t + d)));
      if (confirmed) invalidate();
    } catch (err) {
      console.error("Confirmation failed:", err);
      setError("That change didn't go through. Please try again.");
      openChat(sessionId);
    } finally {
      setAnswering(null);
      setIsLoading(false);
      setStreamText('');
    }
  };

  const pickFiles = async (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).slice(0, MAX_FILES - files.length);
    try {
      const converted = await Promise.all(picked.map(toAttachment));
      setFiles(prev => [...prev, ...converted]);
    } catch (err) {
      toast({ title: "Couldn't attach that file", description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const lastItem = items[items.length - 1];
  const followUps = !isLoading && lastItem?.kind === 'assistant' ? lastItem.followUps ?? [] : [];

  const renderItem = (item: ChatItem) => {
    switch (item.kind) {
      case 'user': return <UserText item={item} />;
      case 'assistant': return <AssistantText item={item} />;
      case 'table': return <ChatTable title={item.title} columns={item.columns} rows={item.rows} />;
      case 'confirm': return <ConfirmCard item={item} busy={answering === item.id} onAnswer={c => answerConfirmation(item.id, c)} />;
      case 'result': return <ResultLine item={item} onUndo={item.undo ? async () => { await undoChatDelete(item.undo!); invalidate(); } : undefined} />;
      case 'memory': return <MemoryLine text={item.text} />;
      default: return null;
    }
  };

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible" className={cn(isPage && "h-full flex flex-col min-h-0 flex-1")}>
      <Card className={cn(
        "flex flex-col",
        isPage ? "h-full w-full rounded-none border-none"
               : items.length === 0 ? "min-h-[340px] shadow-lg" : "h-[500px] shadow-lg",
        glowClass
      )}>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0 px-4 py-3">
          <div className="flex min-w-0 items-center gap-1">
            {!isDemo && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setHistoryOpen(true)} aria-label="Chat history">
                <History className="h-4 w-4" />
              </Button>
            )}
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="flex items-center gap-2 text-lg"><Bot className="h-5 w-5 shrink-0 text-primary" /> FinWise AI</CardTitle>
              <CardDescription className="truncate text-xs">{title || 'Financial Assistant'}</CardDescription>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="flex shrink-0 items-center gap-1.5">
              <Switch id="investment-mode" checked={isInvestmentMode} onCheckedChange={setIsInvestmentMode} />
              <Label htmlFor="investment-mode" className="cursor-pointer whitespace-nowrap text-xs font-normal" title={`When on, answers centre on investments for ${selectedYear}.`}>
                <span className="hidden lg:inline">Investment Mode</span>
                <span className="lg:hidden">Invest</span>
              </Label>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Switch id="verbose-mode" checked={isVerbose} onCheckedChange={setIsVerbose} />
              <Label htmlFor="verbose-mode" className="cursor-pointer whitespace-nowrap text-xs font-normal">Verbose</Label>
            </div>
            {items.length > 0 && (
              <Button variant="ghost" size="icon" className="h-8 w-8" title="New chat" onClick={startNewChat}>
                <Plus className="h-4 w-4" />
                <span className="sr-only">New chat</span>
              </Button>
            )}
            {!isPage ? (
              <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                <Link href="/chatbot"><Expand className="h-4 w-4" /><span className="sr-only">Expand Chatbot</span></Link>
              </Button>
            ) : (
              <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Back to dashboard">
                <Link href="/"><Minimize2 className="h-4 w-4" /><span className="sr-only">Minimize and return to dashboard</span></Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden p-0">
          <ScrollArea className="flex-1 px-4 py-4 w-full" ref={scrollAreaRef}>
            <div className="space-y-4 w-full max-w-full overflow-hidden">
              {items.map(item => item.kind === 'compacted' ? <CompactedDivider key={item.id} /> : (
                <div key={item.id} className="flex items-start gap-3 w-full min-w-0">
                  <Avatar className={cn("h-8 w-8 border flex-shrink-0", item.kind !== 'user' && item.kind !== 'assistant' && "invisible")}>
                    <AvatarFallback className="bg-transparent text-primary">{item.kind === 'user' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-foreground pt-1 min-w-0">{renderItem(item)}</div>
                </div>
              ))}
              {isLoading && (<div className="flex items-start gap-3 w-full min-w-0"><Avatar className="h-8 w-8 border flex-shrink-0"><AvatarFallback className="bg-transparent text-primary"><Bot className="h-5 w-5 animate-pulse motion-reduce:animate-none" /></AvatarFallback></Avatar>{visibleSoFar(streamText) ? <div className="flex-1 text-foreground pt-1 min-w-0"><AssistantText item={{ kind: 'assistant', id: 'streaming', text: visibleSoFar(streamText) }} /></div> : <div className="flex-1 space-y-2 py-2"><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-3/5" /></div>}</div>)}
              {error && !isLoading && (<p role="alert" className="break-words pl-11 text-sm text-destructive">{error}</p>)}
              {items.length === 0 && !isLoading && !error && (
                <div className="text-center text-muted-foreground text-sm py-4 space-y-3 w-full">
                  <p>{isDemo ? 'Ask me anything! Or try one of these examples:' : 'Ask, add or fix anything. Attach a receipt or statement with the clip.'}</p>
                  <div className="flex flex-wrap justify-center gap-2 w-full">
                    {(isDemo ? DEMO_PROMPTS : examplePrompts).map((prompt, i) => (<Button key={i} variant="outline" size="sm" className="text-xs h-auto py-1 px-2 flex-shrink-0 whitespace-normal break-words max-w-full" onClick={() => handleSubmit(prompt)}><Sparkles className="mr-1.5 h-3 w-3 flex-shrink-0" /><span className="inline-block">{prompt}</span></Button>))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          {followUps.length > 0 && (
            <div className={cn("flex flex-wrap gap-2 border-t bg-background/40 px-4 pb-3 pt-2", isPage && "px-6")}>
              <span className="w-full text-[10px] uppercase tracking-wide text-muted-foreground pt-1">Suggested follow-ups</span>
              {followUps.map((q, i) => (
                <Button key={i} variant="outline" size="sm" className="text-xs h-auto py-1 px-2 whitespace-normal break-words" onClick={() => handleSubmit(q)}>
                  <Sparkles className="mr-1.5 h-3 w-3 flex-shrink-0" />
                  {q}
                </Button>
              ))}
            </div>
          )}
          <div className={cn("mt-auto border-t px-4 pb-4 pt-3", isPage && "px-6")}>
            {files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span key={i} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 py-0.5 pl-2 pr-0.5 text-xs">
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="max-w-[10rem] truncate">{f.name}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={`Remove ${f.name}`} onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                ))}
              </div>
            )}
            {commandMatches.length > 0 && (
              <div role="listbox" aria-label="Commands" className="mb-2 overflow-hidden rounded-md border bg-popover text-sm shadow-sm">
                {commandMatches.map((c, i) => (
                  <button key={c.name} type="button" role="option" aria-selected={i === 0} onClick={() => pickCommand(c)}
                    className={cn("flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-accent/10 focus-visible:bg-accent/10 focus-visible:outline-none", i === 0 && "bg-muted/50")}>
                    <span className="shrink-0 font-mono text-xs font-medium text-primary">/{c.name}{c.arg ? ` [${c.arg}]` : ''}</span>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">{c.hint}</span>
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              {!isDemo && (
                <>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden" onChange={e => pickFiles(e.target.files)} />
                  <Button type="button" variant="ghost" size="icon" className="shrink-0" disabled={isLoading || files.length >= MAX_FILES} onClick={() => fileInputRef.current?.click()} aria-label="Attach a receipt or statement">
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Textarea ref={inputRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={files.length ? 'Add a note, or just send' : isDemo ? 'Ask a financial question...' : 'Ask anything, or type /'} className="flex-1 resize-none min-h-[40px]" rows={1} onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (commandMatches[0]) pickCommand(commandMatches[0]); else handleSubmit(); }
                else if (e.key === 'Escape' && commandMatches.length) setInputValue('');
              }} disabled={isLoading} />
              <Button type="submit" disabled={isLoading || (!inputValue.trim() && !files.length)} size="icon" className="bg-primary hover:bg-primary/90" withMotion>{isLoading ? <Zap className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <SendHorizonal className="h-4 w-4" />}<span className="sr-only">Send</span></Button>
            </form>
          </div>
        </CardContent>
      </Card>
      {!isDemo && (
        <ChatHistorySheet
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          currentId={sessionId}
          onOpen={openChat}
          onNew={startNewChat}
          onDeleted={id => { if (id === sessionId) startNewChat(); }}
        />
      )}
    </motion.div>
  );
}
