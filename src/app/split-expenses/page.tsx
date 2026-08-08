"use client";

import { useMemo, useState, type FormEvent } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { AppTransaction } from '@/lib/types';
import { addSplitUser, deleteSplitUser, settleSplitShare, settleMyShare, settleAllForUser } from '@/lib/actions/splits';
import { useSplitUsers, useSplitBalances, useSplitTransactions, useInvalidateFinance } from '@/hooks/use-finance-queries';
import { UserPlus, Trash2, Loader2, Users, ListChecks, Scale, CheckCircle, CircleDot, Plus } from "lucide-react";
import { format } from 'date-fns';
import { TransactionForm } from '@/components/transaction-form';
import { useIsMobile } from '@/hooks/use-mobile';

const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut", staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

/** True if a split transaction still has money outstanding — mine or someone else's. */
function isOpen(t: AppTransaction): boolean {
  const othersOpen = (t.splits ?? []).some(s => !s.isSettled);
  const myShareOpen = !!t.paidById && !t.myShareSettled && (t.myShare ?? 0) > 0;
  return othersOpen || myShareOpen;
}

export default function SplitExpensesPage() {
  const { toast } = useToast();
  const invalidate = useInvalidateFinance();
  const isMobile = useIsMobile();
  const [newUserName, setNewUserName] = useState("");
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null);
  const [settlingKey, setSettlingKey] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const usersQuery = useSplitUsers();
  const balancesQuery = useSplitBalances();
  const transactionsQuery = useSplitTransactions();

  const splitUsers = usersQuery.data ?? [];
  const balances = (balancesQuery.data ?? []).filter(b => Math.abs(b.net) > 0.01 || b.theyOweMe > 0 || b.iOweThem > 0);
  const splitTransactions = transactionsQuery.data?.rows ?? [];

  const isLoadingUsers = usersQuery.isLoading;
  const isLoadingBalances = balancesQuery.isLoading;
  const isLoadingTransactions = transactionsQuery.isLoading;

  const { openTransactions, settledTransactions } = useMemo(() => {
    const open: AppTransaction[] = [];
    const settled: AppTransaction[] = [];
    for (const t of splitTransactions) {
      (isOpen(t) ? open : settled).push(t);
    }
    return { openTransactions: open, settledTransactions: settled };
  }, [splitTransactions]);

  const handleAddUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim()) {
      toast({ title: "Name Required", description: "Please enter a name.", variant: "destructive" });
      return;
    }
    setIsAddingUser(true);
    try {
      await addSplitUser({ name: newUserName.trim() });
      setNewUserName("");
      invalidate();
      toast({ title: "Person Added!", description: `${newUserName.trim()} has been added.` });
    } catch (error: any) {
      toast({ title: "Error Adding Person", description: error.message || "Could not add person.", variant: "destructive" });
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    setIsDeletingUser(userId);
    try {
      await deleteSplitUser(userId);
      invalidate();
      toast({ title: "Person Deleted", description: `${userName} has been removed.` });
    } catch (error: any) {
      toast({ title: "Error Deleting Person", description: error.message || "Could not delete person.", variant: "destructive" });
    } finally {
      setIsDeletingUser(null);
    }
  };

  const handleSettleShare = async (transactionId: string, userId: string) => {
    const key = `${transactionId}:${userId}`;
    setSettlingKey(key);
    try {
      await settleSplitShare(transactionId, userId);
      invalidate();
      toast({ title: "Settled!", description: "That share has been marked as paid back." });
    } catch (error: any) {
      toast({ title: "Settlement Error", description: error.message || "Could not settle this share.", variant: "destructive" });
    } finally {
      setSettlingKey(null);
    }
  };

  const handleSettleMyShare = async (transactionId: string) => {
    const key = `mine:${transactionId}`;
    setSettlingKey(key);
    try {
      await settleMyShare(transactionId);
      invalidate();
      toast({ title: "Settled!", description: "Marked as paid back." });
    } catch (error: any) {
      toast({ title: "Settlement Error", description: error.message || "Could not settle this share.", variant: "destructive" });
    } finally {
      setSettlingKey(null);
    }
  };

  const handleSettleAllForUser = async (userId: string, userName: string) => {
    setSettlingKey(`all:${userId}`);
    try {
      const { successCount } = await settleAllForUser(userId);
      invalidate();
      toast({ title: "Settled Up!", description: `${successCount} balance(s) with ${userName} cleared.` });
    } catch (error: any) {
      toast({ title: "Settlement Error", description: error.message || "Could not settle up.", variant: "destructive" });
    } finally {
      setSettlingKey(null);
    }
  };

  const closeAddForm = () => setIsAddingNew(false);
  const onAdded = () => { invalidate(); setIsAddingNew(false); };

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8 bg-background/80 backdrop-blur-sm">
      <motion.div variants={pageVariants} initial="hidden" animate="visible">
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90", glowClass)}>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
                <Users className="w-7 h-7 md:w-8 md:h-8 text-accent transform -rotate-3" />
                Split Expenses
              </CardTitle>
              <CardDescription className="text-sm md:text-base text-muted-foreground">
                Every split lives on its transaction — add one from here or from the AI entry field.
              </CardDescription>
            </div>
            <Button onClick={() => setIsAddingNew(true)} className="shrink-0">
              <Plus className="mr-1.5 h-4 w-4" /> Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-8">

            {/* Balances */}
            <motion.section variants={cardVariants}>
              <Card className={cn("shadow-lg border-green-500/30 bg-green-500/5", glowClass)}>
                <CardHeader><CardTitle className="text-lg sm:text-xl font-semibold text-green-600 dark:text-green-400 flex items-center gap-2"><Scale className="text-green-500/80" />Balances</CardTitle></CardHeader>
                <CardContent>
                  {isLoadingBalances ? (
                    <p className="text-muted-foreground">Calculating balances...</p>
                  ) : balances.length === 0 ? (
                    <p className="text-muted-foreground">All settled up! No open balances.</p>
                  ) : (
                    <div className="space-y-3">
                      {balances.map(b => (
                        <div key={b.userId} className="flex items-center justify-between gap-3 rounded-md border bg-background/60 p-3">
                          <div className="text-sm">
                            <strong className="text-foreground">{b.userName}</strong>
                            {b.net > 0 ? (
                              <p className="text-green-600 dark:text-green-400">Owes you ₹{b.net.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                            ) : b.net < 0 ? (
                              <p className="text-red-600 dark:text-red-400">You owe ₹{Math.abs(b.net).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                            ) : (
                              <p className="text-muted-foreground">Settled up</p>
                            )}
                          </div>
                          {Math.abs(b.net) > 0.01 && (
                            <Button
                              size="sm" variant="outline"
                              disabled={settlingKey === `all:${b.userId}`}
                              onClick={() => handleSettleAllForUser(b.userId, b.userName)}
                            >
                              {settlingKey === `all:${b.userId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Settle up"}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.section>

            <Separator className="my-6 border-primary/30" />

            {/* Open items */}
            <motion.section variants={cardVariants}>
              <Card className={cn("shadow-lg border-primary/20 bg-card/95", glowClass)}>
                <CardHeader><CardTitle className="text-lg sm:text-xl font-semibold text-primary flex items-center gap-2"><ListChecks className="text-primary/80" />Open Splits</CardTitle></CardHeader>
                <CardContent>
                  {isLoadingTransactions ? (
                    <p className="text-muted-foreground">Loading...</p>
                  ) : openTransactions.length === 0 ? (
                    <p className="text-muted-foreground">Nothing outstanding.</p>
                  ) : (
                    <div className="space-y-4">
                      {openTransactions.map(t => (
                        <motion.div key={t.id} variants={itemVariants} className="p-4 border rounded-lg bg-background/50 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-semibold text-accent">{t.description}</h4>
                              <p className="text-xs text-muted-foreground">
                                {format(t.date, 'dd MMM, yyyy')} • Total: ₹{t.amount.toLocaleString()} • My share: ₹{(t.myShare ?? 0).toLocaleString()}
                              </p>
                              {t.paidById && (
                                <p className="text-xs text-muted-foreground">Paid by: <strong>{t.paidBy?.name ?? 'someone else'}</strong></p>
                              )}
                            </div>
                            <Badge variant="secondary" className="bg-orange-500/80 text-white">Open</Badge>
                          </div>
                          <ul className="space-y-2 text-sm">
                            {t.paidById && !t.myShareSettled && (t.myShare ?? 0) > 0 && (
                              <li className="flex justify-between items-center text-xs">
                                <div className="flex items-center gap-2">
                                  <CircleDot className="h-4 w-4 text-orange-500" />
                                  <span>You owe {t.paidBy?.name ?? 'them'} ₹{(t.myShare ?? 0).toLocaleString()}</span>
                                </div>
                                <Button
                                  size="sm" variant="outline" className="h-7 px-2 text-xs"
                                  onClick={() => handleSettleMyShare(t.id)}
                                  disabled={settlingKey === `mine:${t.id}`}
                                >
                                  {settlingKey === `mine:${t.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "Settle"}
                                </Button>
                              </li>
                            )}
                            {(t.splits ?? []).map(s => (
                              <li key={s.userId} className="flex justify-between items-center text-xs">
                                <div className="flex items-center gap-2">
                                  {s.isSettled ? <CheckCircle className="h-4 w-4 text-green-500" /> : <CircleDot className="h-4 w-4 text-orange-500" />}
                                  <span>{s.userName} owes ₹{s.shareAmount.toLocaleString()}</span>
                                </div>
                                {!s.isSettled && (
                                  <Button
                                    size="sm" variant="outline" className="h-7 px-2 text-xs"
                                    onClick={() => handleSettleShare(t.id, s.userId)}
                                    disabled={settlingKey === `${t.id}:${s.userId}`}
                                  >
                                    {settlingKey === `${t.id}:${s.userId}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "Settle"}
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.section>

            <Separator className="my-6 border-primary/30" />

            {/* Settled history — collapsed by default */}
            <motion.section variants={cardVariants}>
              <Accordion type="single" collapsible>
                <AccordionItem value="settled" className="border-none">
                  <Card className={cn("shadow-lg border-primary/20 bg-card/95", glowClass)}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline">
                      <CardTitle className="text-lg sm:text-xl font-semibold text-primary flex items-center gap-2">
                        <CheckCircle className="text-primary/80" />
                        Settled History
                        <Badge variant="outline" className="ml-1 font-normal">{settledTransactions.length}</Badge>
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-6">
                      {settledTransactions.length === 0 ? (
                        <p className="text-muted-foreground">Nothing settled yet.</p>
                      ) : (
                        <ScrollArea className="h-[300px] pr-3">
                          <div className="space-y-3">
                            {settledTransactions.map(t => (
                              <div key={t.id} className="p-3 border rounded-lg bg-background/40 text-sm">
                                <div className="flex justify-between">
                                  <span className="font-medium">{t.description}</span>
                                  <span className="text-muted-foreground">{format(t.date, 'dd MMM, yyyy')}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Total ₹{t.amount.toLocaleString()} • My share ₹{(t.myShare ?? 0).toLocaleString()}
                                  {t.splits && t.splits.length > 0 && ` • Split with ${t.splits.map(s => s.userName).join(', ')}`}
                                </p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </AccordionContent>
                  </Card>
                </AccordionItem>
              </Accordion>
            </motion.section>

            <Separator className="my-6 border-primary/30" />

            {/* People directory */}
            <motion.section variants={cardVariants}>
              <Card className={cn("shadow-lg border-accent/20 bg-card/95", glowClass)}>
                <CardHeader><CardTitle className="text-lg sm:text-xl font-semibold text-accent flex items-center gap-2"><UserPlus className="text-accent/80" />People</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={handleAddUser} className="flex flex-col sm:flex-row items-end gap-2 mb-4">
                    <div className="flex-grow w-full sm:w-auto">
                      <Label htmlFor="newUserName" className="text-sm text-foreground/90">New Person</Label>
                      <Input id="newUserName" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="e.g., Rahul, Priya" className="mt-1" disabled={isAddingUser} />
                    </div>
                    <Button type="submit" disabled={isAddingUser || !newUserName.trim()} className="w-full sm:w-auto" withMotion>
                      {isAddingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />} Add
                    </Button>
                  </form>
                  <Separator className="my-4" />
                  {isLoadingUsers ? (
                    <div className="h-10 animate-pulse rounded-md bg-muted/50" />
                  ) : splitUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No one added yet.</p>
                  ) : (
                    <ScrollArea className="h-[150px] pr-3">
                      <ul className="space-y-2">
                        {splitUsers.map(user => (
                          <motion.li key={user.id} variants={itemVariants} className="flex items-center justify-between p-2.5 rounded-md bg-background/60 border hover:bg-accent/5">
                            <span className="text-sm">{user.name}</span>
                            <Button
                              variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-7 w-7 p-1"
                              disabled={isDeletingUser === user.id}
                              onClick={() => handleDeleteUser(user.id, user.name)}
                            >
                              {isDeletingUser === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </motion.li>
                        ))}
                      </ul>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </motion.section>

          </CardContent>
        </Card>
      </motion.div>

      {isMobile ? (
        <Sheet open={isAddingNew} onOpenChange={(open) => !open && closeAddForm()}>
          <SheetContent side="bottom" className="bg-background/95 border-primary/50 h-[92vh] flex flex-col p-0 rounded-t-xl">
            <SheetHeader className="px-4 pt-4 pb-2 text-left">
              <SheetTitle className="text-accent text-lg">Add a Split Expense</SheetTitle>
              <SheetDescription className="text-muted-foreground text-sm">Record who this expense is shared with.</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 pb-6">
              <TransactionForm onTransactionAdded={onAdded} onCancel={closeAddForm} defaultOpenSplit />
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <AlertDialog open={isAddingNew} onOpenChange={(open) => !open && closeAddForm()}>
          <AlertDialogContent className="bg-background/95 border-primary/50 shadow-lg w-[90vw] max-w-lg sm:max-w-xl md:max-w-2xl rounded-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-accent text-xl">Add a Split Expense</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">Record who this expense is shared with.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4 max-h-[70vh] overflow-y-auto pr-2">
              <TransactionForm onTransactionAdded={onAdded} onCancel={closeAddForm} defaultOpenSplit />
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </main>
  );
}
