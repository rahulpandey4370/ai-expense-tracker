
"use client";

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { SplitUser, SplitUserInput } from '@/lib/types';
import { addSplitUser, getSplitUsers, deleteSplitUser } from '@/lib/actions/split-expenses';
import { UserPlus, Trash2, Loader2, Users, ListChecks, FilePlus, Scale } from "lucide-react";

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
  const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null); // Stores ID of user being deleted

  const fetchSplitUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const users = await getSplitUsers();
      setSplitUsers(users);
    } catch (error: any) {
      toast({ title: "Error Fetching Users", description: error.message || "Could not load users.", variant: "destructive" });
      setSplitUsers([]);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSplitUsers();
  }, [fetchSplitUsers]);

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
      fetchSplitUsers(); // Refresh list
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
      fetchSplitUsers(); // Refresh list
      toast({ title: "User Deleted", description: `${userName} has been removed.` });
    } catch (error: any) {
      toast({ title: "Error Deleting User", description: error.message || "Could not delete user. They might be part of existing unsettled splits.", variant: "destructive" });
    } finally {
      setIsDeletingUser(null);
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
            
            {/* Manage Users Section */}
            <motion.section variants={cardVariants}>
              <Card className={cn("shadow-lg border-accent/20 bg-card/95", glowClass)}>
                <CardHeader>
                  <CardTitle className="text-lg sm:text-xl font-semibold text-accent flex items-center gap-2"><UserPlus className="text-accent/80"/>Manage Split Users</CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-muted-foreground">Add or remove people you frequently split bills with.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddUser} className="flex flex-col sm:flex-row items-end gap-2 mb-4">
                    <div className="flex-grow w-full sm:w-auto">
                      <Label htmlFor="newUserName" className="text-sm text-foreground/90">New User Name</Label>
                      <Input 
                        id="newUserName" 
                        value={newUserName} 
                        onChange={(e) => setNewUserName(e.target.value)} 
                        placeholder="e.g., Rahul, Priya"
                        className="mt-1 bg-background/70 border-border/70 focus:border-accent focus:ring-accent text-foreground placeholder:text-muted-foreground/70" 
                        disabled={isAddingUser}
                      />
                    </div>
                    <Button type="submit" disabled={isAddingUser || !newUserName.trim()} className="bg-accent hover:bg-accent/90 text-accent-foreground w-full sm:w-auto" withMotion>
                      {isAddingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                      Add User
                    </Button>
                  </form>
                  <Separator className="my-4 border-accent/20"/>
                  <h4 className="text-md font-medium text-accent/90 mb-2">Existing Users:</h4>
                  {isLoadingUsers ? (
                     <div className="space-y-2">
                        <div className="flex items-center justify-between p-2 rounded-md bg-muted/50 h-10 animate-pulse"></div>
                        <div className="flex items-center justify-between p-2 rounded-md bg-muted/50 h-10 animate-pulse"></div>
                     </div>
                  ) : splitUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No users added yet. Add some to start splitting!</p>
                  ) : (
                    <ScrollArea className="h-[150px] sm:h-[200px] pr-3">
                      <ul className="space-y-2">
                        {splitUsers.map(user => (
                          <motion.li 
                            key={user.id} 
                            variants={itemVariants}
                            className="flex items-center justify-between p-2.5 rounded-md bg-background/60 border border-border/50 hover:bg-accent/5 transition-colors"
                          >
                            <span className="text-sm text-foreground">{user.name}</span>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-7 w-7 p-1" disabled={isDeletingUser === user.id}>
                                  {isDeletingUser === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                  <span className="sr-only">Delete {user.name}</span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete User: {user.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to remove {user.name}? This might affect historical split calculations if they were involved.
                                    Consider if this user has any unsettled shared expenses.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteUser(user.id, user.name)} className="bg-destructive hover:bg-destructive/90">
                                    Delete User
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </motion.li>
                        ))}
                      </ul>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </motion.section>

            <Separator className="my-6 border-primary/30"/>

            {/* Add Split Expense Section - Placeholder */}
            <motion.section variants={cardVariants}>
              <Card className={cn("shadow-lg border-primary/20 bg-card/95", glowClass)}>
                <CardHeader>
                  <CardTitle className="text-lg sm:text-xl font-semibold text-primary flex items-center gap-2"><FilePlus className="text-primary/80"/>Add New Shared Expense</CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-muted-foreground">Record a bill that was shared among users.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground italic py-8 text-center">(Split expense form will be here. Select payer, participants, amount, and split method.)</p>
                  {/* Future: Add form with fields: title, date, totalAmount, paidById (select), participants (multi-select), splitMethod (radio: equally, custom) */}
                </CardContent>
              </Card>
            </motion.section>
            
            <Separator className="my-6 border-primary/30"/>

            {/* View Split Expenses Section - Placeholder */}
            <motion.section variants={cardVariants}>
              <Card className={cn("shadow-lg border-primary/20 bg-card/95", glowClass)}>
                <CardHeader>
                  <CardTitle className="text-lg sm:text-xl font-semibold text-primary flex items-center gap-2"><ListChecks className="text-primary/80"/>Shared Expense History</CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-muted-foreground">View and manage past shared expenses and settlements.</CardDescription>
                </CardHeader>
                <CardContent>
                   <p className="text-sm text-muted-foreground italic py-8 text-center">(List of shared expenses with settlement options will appear here.)</p>
                   {/* Future: Table/list of split expenses, expandable rows for details, settle buttons */}
                </CardContent>
              </Card>
            </motion.section>

            <Separator className="my-6 border-primary/30"/>

            {/* Overall Balances Section - Placeholder */}
            <motion.section variants={cardVariants}>
              <Card className={cn("shadow-lg border-green-500/30 bg-green-500/5", glowClass)}>
                <CardHeader>
                  <CardTitle className="text-lg sm:text-xl font-semibold text-green-600 dark:text-green-400 flex items-center gap-2"><Scale className="text-green-500/80"/>Overall Balances</CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-muted-foreground">Summary of who owes whom across all shared expenses.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground italic py-8 text-center">(Calculated balances: e.g., "Rahul owes Priya ₹500", "Priya is owed ₹200 by Sam" will appear here.)</p>
                  {/* Future: Display calculated net balances for each user relative to others */}
                </CardContent>
              </Card>
            </motion.section>

          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}
