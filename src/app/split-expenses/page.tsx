
"use client";

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { SplitUser, SplitUserInput, SplitExpenseInput, AppSplitExpense, UserBalance } from '@/lib/types';
import { addSplitUser, getSplitUsers, deleteSplitUser, addSplitExpense, getSplitExpenses, settleParticipantShare, getSplitBalances } from '@/lib/actions/split-expenses';
import { UserPlus, Trash2, Loader2, Users, ListChecks, FilePlus, Scale, CheckCircle, CircleDot, CalendarIcon } from "lucide-react";
import { format } from 'date-fns';

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

export default function SplitExpensesPage() {
  const { toast } = useToast();
  const [splitUsers, setSplitUsers] = useState<SplitUser[]>([]);
  const [newUserName, setNewUserName] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null);

  const [splitExpenses, setSplitExpenses] = useState<AppSplitExpense[]>([]);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(true);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [isSettling, setIsSettling] = useState<{ expenseId: string, userId: string } | null>(null);
  const [balances, setBalances] = useState<UserBalance[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(true);


  const fetchData = useCallback(async () => {
    setIsLoadingUsers(true);
    setIsLoadingExpenses(true);
    setIsLoadingBalances(true);
    try {
      const [users, expenses, fetchedBalances] = await Promise.all([
        getSplitUsers(),
        getSplitExpenses(),
        getSplitBalances(),
      ]);
      setSplitUsers(users);
      setSplitExpenses(expenses);
      setBalances(fetchedBalances);
    } catch (error: any) {
      toast({ title: "Error Fetching Data", description: error.message || "Could not load split expense data.", variant: "destructive" });
      setSplitUsers([]);
      setSplitExpenses([]);
      setBalances([]);
    } finally {
      setIsLoadingUsers(false);
      setIsLoadingExpenses(false);
      setIsLoadingBalances(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim()) {
      toast({ title: "User Name Required", description: "Please enter a name for the user.", variant: "destructive" });
      return;
    }
    setIsAddingUser(true);
    try {
      await addSplitUser({ name: newUserName.trim() });
      setNewUserName("");
      fetchData(); // Refresh all data
      toast({ title: "User Added!", description: `${newUserName.trim()} has been added.` });
    } catch (error: any) {
      toast({ title: "Error Adding User", description: error.message || "Could not add user.", variant: "destructive" });
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    setIsDeletingUser(userId);
    try {
      await deleteSplitUser(userId);
      fetchData(); // Refresh all data
      toast({ title: "User Deleted", description: `${userName} has been removed.` });
    } catch (error: any) {
      toast({ title: "Error Deleting User", description: error.message || "Could not delete user. They might be part of existing unsettled splits.", variant: "destructive" });
    } finally {
      setIsDeletingUser(null);
    }
  };
  
  const handleSettleShare = async (expenseId: string, participantUserId: string) => {
    setIsSettling({ expenseId, userId: participantUserId });
    try {
        await settleParticipantShare(expenseId, participantUserId);
        toast({ title: "Share Settled!", description: "The participant's share has been marked as settled." });
        fetchData(); // Refresh all data
    } catch (error: any) {
        toast({ title: "Settlement Error", description: error.message || "Could not settle the share.", variant: "destructive" });
    } finally {
        setIsSettling(null);
    }
  };

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8 bg-background/80 backdrop-blur-sm">
      <motion.div variants={pageVariants} initial="hidden" animate="visible">
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90", glowClass)}>
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
              <Users className="w-7 h-7 md:w-8 md:h-8 text-accent transform -rotate-3" />
              Split Expenses
            </CardTitle>
            <CardDescription className="text-sm md:text-base text-muted-foreground">
              Manage shared expenses with your friends and colleagues.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            
            <motion.section variants={cardVariants}>
              <Card className={cn("shadow-lg border-accent/20 bg-card/95", glowClass)}>
                <CardHeader><CardTitle className="text-lg sm:text-xl font-semibold text-accent flex items-center gap-2"><UserPlus className="text-accent/80"/>Manage Split Users</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={handleAddUser} className="flex flex-col sm:flex-row items-end gap-2 mb-4">
                    <div className="flex-grow w-full sm:w-auto">
                      <Label htmlFor="newUserName" className="text-sm text-foreground/90">New User Name</Label>
                      <Input id="newUserName" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="e.g., Rahul, Priya" className="mt-1 bg-background/70 border-border/70 focus:border-accent focus:ring-accent" disabled={isAddingUser} />
                    </div>
                    <Button type="submit" disabled={isAddingUser || !newUserName.trim()} className="bg-accent hover:bg-accent/90 text-accent-foreground w-full sm:w-auto" withMotion>
                      {isAddingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />} Add User
                    </Button>
                  </form>
                  <Separator className="my-4 border-accent/20"/>
                  <h4 className="text-md font-medium text-accent/90 mb-2">Existing Users:</h4>
                  {isLoadingUsers ? <div className="space-y-2"><div className="h-10 animate-pulse rounded-md bg-muted/50"></div></div> : splitUsers.length === 0 ? <p className="text-sm text-muted-foreground">No users added yet.</p> : (
                    <ScrollArea className="h-[150px] pr-3"><ul className="space-y-2">
                      {splitUsers.map(user => (
                        <motion.li key={user.id} variants={itemVariants} className="flex items-center justify-between p-2.5 rounded-md bg-background/60 border hover:bg-accent/5">
                          <span className="text-sm">{user.name}</span>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-7 w-7 p-1" disabled={isDeletingUser === user.id}>{isDeletingUser === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {user.name}?</AlertDialogTitle><AlertDialogDescription>This cannot be undone and might affect balance calculations if the user has unsettled expenses.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteUser(user.id, user.name)} className="bg-destructive hover:bg-destructive/90">Delete User</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                          </AlertDialog>
                        </motion.li>
                      ))}
                    </ul></ScrollArea>
                  )}
                </CardContent>
              </Card>
            </motion.section>

            <Separator className="my-6 border-primary/30"/>

            <motion.section variants={cardVariants}>
              <Card className={cn("shadow-lg border-primary/20 bg-card/95", glowClass)}>
                <CardHeader><CardTitle className="text-lg sm:text-xl font-semibold text-primary flex items-center gap-2"><FilePlus className="text-primary/80"/>Add New Shared Expense</CardTitle></CardHeader>
                <CardContent><AddSplitExpenseForm users={splitUsers} onExpenseAdded={fetchData} /></CardContent>
              </Card>
            </motion.section>
            
            <Separator className="my-6 border-primary/30"/>

            <motion.section variants={cardVariants}>
                <Card className={cn("shadow-lg border-primary/20 bg-card/95", glowClass)}>
                    <CardHeader><CardTitle className="text-lg sm:text-xl font-semibold text-primary flex items-center gap-2"><ListChecks className="text-primary/80"/>Shared Expense History</CardTitle></CardHeader>
                    <CardContent>
                        {isLoadingExpenses ? <p className="text-muted-foreground">Loading history...</p> : splitExpenses.length === 0 ? <p className="text-muted-foreground">No shared expenses recorded yet.</p> :
                        <ScrollArea className="h-[400px] pr-3">
                            <div className="space-y-4">
                                {splitExpenses.map(expense => (
                                    <motion.div key={expense.id} variants={itemVariants} className="p-4 border rounded-lg bg-background/50 space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="font-semibold text-accent">{expense.title}</h4>
                                                <p className="text-xs text-muted-foreground">{format(expense.date, 'dd MMM, yyyy')} • Total: ₹{expense.totalAmount.toLocaleString()}</p>
                                                <p className="text-xs text-muted-foreground">Paid by: <strong>{expense.paidBy.name}</strong></p>
                                            </div>
                                            <Badge variant={expense.isFullySettled ? "default" : "secondary"} className={cn(expense.isFullySettled ? "bg-green-600/80" : "bg-orange-500/80", "text-white")}>{expense.isFullySettled ? "Settled" : "Unsettled"}</Badge>
                                        </div>
                                        <ul className="space-y-2 text-sm">
                                            {expense.participants.map(p => (
                                                <li key={p.user.id} className="flex justify-between items-center text-xs">
                                                    <div className="flex items-center gap-2">
                                                        {p.isSettled ? <CheckCircle className="h-4 w-4 text-green-500"/> : <CircleDot className="h-4 w-4 text-orange-500"/>}
                                                        <span>{p.user.name} owes ₹{p.shareAmount.toLocaleString()}</span>
                                                    </div>
                                                    {!p.isSettled && (
                                                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleSettleShare(expense.id, p.user.id)} disabled={isSettling?.expenseId === expense.id && isSettling?.userId === p.user.id}>
                                                        {isSettling?.expenseId === expense.id && isSettling?.userId === p.user.id ? <Loader2 className="h-3 w-3 animate-spin"/> : "Settle"}
                                                      </Button>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </motion.div>
                                ))}
                            </div>
                        </ScrollArea>
                        }
                    </CardContent>
                </Card>
            </motion.section>

            <Separator className="my-6 border-primary/30"/>

            <motion.section variants={cardVariants}>
                <Card className={cn("shadow-lg border-green-500/30 bg-green-500/5", glowClass)}>
                    <CardHeader><CardTitle className="text-lg sm:text-xl font-semibold text-green-600 dark:text-green-400 flex items-center gap-2"><Scale className="text-green-500/80"/>Overall Balances</CardTitle></CardHeader>
                    <CardContent>
                        {isLoadingBalances ? <p className="text-muted-foreground">Calculating balances...</p> : balances.filter(b => b.owes.length > 0).length === 0 ? <p className="text-muted-foreground">All balances are settled!</p> :
                        <div className="space-y-3">
                            {balances.map(balance => balance.owes.length > 0 && (
                                <div key={balance.userId} className="text-sm">
                                    <strong className="text-red-500">{balance.userName}</strong> owes:
                                    <ul className="list-disc list-inside pl-4 text-muted-foreground">
                                        {balance.owes.map(debt => (
                                            <li key={debt.toUserId}>₹{debt.amount.toLocaleString()} to <strong className="text-green-600">{debt.toUserName}</strong></li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                        }
                    </CardContent>
                </Card>
            </motion.section>

          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}

// Sub-component for the Add Split Expense Form
function AddSplitExpenseForm({ users, onExpenseAdded }: { users: SplitUser[], onExpenseAdded: () => void }) {
    const { toast } = useToast();
    const [title, setTitle] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [paidById, setPaidById] = useState<string | undefined>();
    const [participantIds, setParticipantIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        
        const amountNum = parseFloat(totalAmount);
        if (!title.trim() || isNaN(amountNum) || amountNum <= 0 || !date || !paidById || participantIds.size < 2) {
            toast({ title: "Missing Information", description: "Please fill all fields. At least 2 participants are required.", variant: "destructive" });
            return;
        }

        const expenseData: SplitExpenseInput = {
            title,
            totalAmount: amountNum,
            date,
            paidById,
            splitMethod: 'equally', // For now, only equal split is implemented in this form
            participants: Array.from(participantIds).map(id => ({ userId: id })),
        };
        
        setIsLoading(true);
        try {
            await addSplitExpense(expenseData);
            toast({ title: "Shared Expense Added!", description: `'${title}' has been recorded.` });
            // Reset form
            setTitle('');
            setTotalAmount('');
            setDate(new Date());
            setPaidById(undefined);
            setParticipantIds(new Set());
            onExpenseAdded(); // Refresh data on parent page
        } catch (error: any) {
            toast({ title: "Error Adding Expense", description: error.message || "Could not add shared expense.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const toggleParticipant = (userId: string) => {
        setParticipantIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(userId)) newSet.delete(userId);
            else newSet.add(userId);
            return newSet;
        });
    };

    if (users.length === 0) {
        return <p className="text-muted-foreground text-center italic">Please add at least one user to start adding shared expenses.</p>
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label htmlFor="title">Title</Label><Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Dinner at BBQ Nation" className="mt-1"/></div>
                <div><Label htmlFor="totalAmount">Total Amount (₹)</Label><Input id="totalAmount" type="number" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder="e.g., 2500" className="mt-1"/></div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="date">Date</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal mt-1", !date && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4"/>{date ? format(date, "PPP") : <span>Pick a date</span>}</Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent>
                    </Popover>
                </div>
                <div>
                    <Label htmlFor="paidById">Paid By</Label>
                    <Select value={paidById} onValueChange={setPaidById}>
                        <SelectTrigger id="paidById" className="mt-1"><SelectValue placeholder="Select who paid" /></SelectTrigger>
                        <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            </div>
            <div>
                <Label>Participants (Split Equally)</Label>
                <ScrollArea className="h-[120px] w-full rounded-md border p-2 mt-1 space-y-2">
                    {users.map(user => (
                        <div key={user.id} className="flex items-center space-x-2">
                            <Checkbox id={`participant-${user.id}`} checked={participantIds.has(user.id)} onCheckedChange={() => toggleParticipant(user.id)}/>
                            <label htmlFor={`participant-${user.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{user.name}</label>
                        </div>
                    ))}
                </ScrollArea>
            </div>
            <Button type="submit" disabled={isLoading} className="w-full bg-primary text-primary-foreground" withMotion>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FilePlus className="mr-2 h-4 w-4"/>} Add Shared Expense
            </Button>
        </form>
    );
}

