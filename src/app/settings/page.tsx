
"use client";

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { User, Bell, Palette, ShieldCheck, Save, SettingsIcon, PlusCircle, Trash2, Loader2, List, Tag, Target, Edit } from "lucide-react";
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';
import type { Category, PaymentMethod, Budget } from '@/lib/types';
import { getCategories, getPaymentMethods, addCategory, addPaymentMethod, deleteCategory, deletePaymentMethod } from '@/lib/actions/transactions';
import { getBudgets, addBudget, updateBudget, deleteBudget } from '@/lib/actions/budgets';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';


const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const sectionVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: "easeOut", staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

const glowClass = "shadow-[var(--card-glow)] dark:shadow-[var(--card-glow-dark)]";

export default function SettingsPage() {
  const [userProfile, setUserProfile] = useState({
    name: "Me (FinWise User)",
    email: "user@finwise.ai",
  });
  const [notifications, setNotifications] = useState({
    spendingAlerts: true,
    monthlySummary: false,
    aiInsightsEmail: true,
  });

  // State for categories and payment methods
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // State for new category/payment method forms
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<'expense' | 'income'>('expense');
  const [newPaymentMethodName, setNewPaymentMethodName] = useState('');
  const [newPaymentMethodType, setNewPaymentMethodType] = useState('Credit Card');
  
  // State for budget forms
  const [newBudgetName, setNewBudgetName] = useState('');
  const [newBudgetAmount, setNewBudgetAmount] = useState('');
  const [newBudgetType, setNewBudgetType] = useState<'category' | 'expenseType'>('category');
  const [newBudgetTargetId, setNewBudgetTargetId] = useState('');

  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [editBudgetAmount, setEditBudgetAmount] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const expenseCategories = categories.filter(c => c.type === 'expense');

  const fetchData = useCallback(async () => {
    setIsLoadingData(true);
    try {
        const [fetchedCategories, fetchedPaymentMethods, fetchedBudgets] = await Promise.all([
            getCategories(),
            getPaymentMethods(),
            getBudgets(),
        ]);
        setCategories(fetchedCategories);
        setPaymentMethods(fetchedPaymentMethods);
        setBudgets(fetchedBudgets);
    } catch (error: any) {
        toast({ title: "Error loading data", description: error.message, variant: "destructive" });
    } finally {
        setIsLoadingData(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const handleSaveChanges = () => {
    console.log("Saving settings:", { userProfile, notifications });
    toast({
      title: "Settings Saved!",
      description: "Your preferences have been updated.",
    });
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({ title: "Category name is required", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await addCategory({ name: newCategoryName, type: newCategoryType });
      setNewCategoryName('');
      toast({ title: "Category Added!", description: `'${newCategoryName}' has been added.` });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error adding category", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    setIsDeleting(id);
    try {
      await deleteCategory(id);
      toast({ title: "Category Deleted!", description: "The category has been removed." });
      fetchData();
    } catch (error: any) => {
      toast({ title: "Error deleting category", description: `${error.message}. It might be in use by some transactions.`, variant: "destructive" });
    } finally {
      setIsDeleting(null);
    }
  };
  
  const handleAddPaymentMethod = async () => {
    if (!newPaymentMethodName.trim() || !newPaymentMethodType.trim()) {
      toast({ title: "Payment method name and type are required", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await addPaymentMethod({ name: newPaymentMethodName, type: newPaymentMethodType });
      setNewPaymentMethodName('');
      setNewPaymentMethodType('Credit Card');
      toast({ title: "Payment Method Added!", description: `'${newPaymentMethodName}' has been added.` });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error adding payment method", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePaymentMethod = async (id: string) => {
    setIsDeleting(id);
    try {
      await deletePaymentMethod(id);
      toast({ title: "Payment Method Deleted!", description: "The payment method has been removed." });
      fetchData();
    } catch (error: any) => {
      toast({ title: "Error deleting payment method", description: `${error.message}. It might be in use by some transactions.`, variant: "destructive" });
    } finally {
      setIsDeleting(null);
    }
  };

  const handleAddBudget = async () => {
    const amount = parseFloat(newBudgetAmount);
    if (!newBudgetTargetId || isNaN(amount) || amount <= 0) {
        toast({ title: "Invalid Input", description: "Please select a target and enter a valid positive amount.", variant: "destructive" });
        return;
    }

    // Use selected category/type name as budget name if not provided
    let finalBudgetName = newBudgetName.trim();
    if (!finalBudgetName) {
        if (newBudgetType === 'category') {
            const cat = expenseCategories.find(c => c.id === newBudgetTargetId);
            finalBudgetName = cat?.name || "Unnamed Budget";
        } else {
            finalBudgetName = `${newBudgetTargetId.charAt(0).toUpperCase() + newBudgetTargetId.slice(1)} Budget`;
        }
    }


    setIsSubmitting(true);
    try {
        await addBudget({
            name: finalBudgetName,
            amount: amount,
            type: newBudgetType,
            targetId: newBudgetTargetId,
        });
        toast({ title: "Budget Added!", description: `Budget for '${finalBudgetName}' has been set.` });
        setNewBudgetName('');
        setNewBudgetAmount('');
        setNewBudgetTargetId('');
        fetchData();
    } catch (error: any) {
        toast({ title: "Error Adding Budget", description: error.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDeleteBudget = async (id: string) => {
      setIsDeleting(id);
      try {
          await deleteBudget(id);
          toast({ title: "Budget Deleted" });
          fetchData();
      } catch (error: any) {
          toast({ title: "Error Deleting Budget", description: error.message, variant: "destructive" });
      } finally {
          setIsDeleting(null);
      }
  };

  const handleOpenEditDialog = (budget: Budget) => {
    setEditingBudget(budget);
    setEditBudgetAmount(budget.amount.toString());
  };

  const handleUpdateBudget = async () => {
    if (!editingBudget) return;
    const newAmount = parseFloat(editBudgetAmount);
    if (isNaN(newAmount) || newAmount <= 0) {
      toast({ title: "Invalid Amount", description: "Budget amount must be a positive number.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
        await updateBudget(editingBudget.id, { amount: newAmount });
        toast({ title: "Budget Updated!" });
        setEditingBudget(null);
        fetchData();
    } catch (error: any) {
        toast({ title: "Error Updating Budget", description: error.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };



  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <motion.div variants={pageVariants} initial="hidden" animate="visible">
        <Card className={cn("shadow-xl border-primary/20 border-2 rounded-xl bg-card/80", glowClass)}>
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
              <SettingsIcon className="w-7 h-7 md:w-8 md:h-8 text-primary transform -rotate-3"/>
              Application Settings
            </CardTitle>
            <CardDescription className="text-sm md:text-base text-muted-foreground">
              Configure your application preferences for FinWise AI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            
            <motion.section variants={sectionVariants}>
              <h3 className="text-lg sm:text-xl font-semibold text-primary mb-4 flex items-center gap-2"><User className="text-accent"/>User Profile</h3>
              <motion.div variants={itemVariants} className="space-y-4">
                <div>
                  <Label htmlFor="name" className="text-sm text-foreground">Full Name</Label>
                  <Input id="name" name="name" value={userProfile.name} onChange={(e) => setUserProfile({ ...userProfile, [e.target.name]: e.target.value })} className="mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent text-foreground placeholder:text-muted-foreground text-sm md:text-base" />
                </div>
                <div>
                  <Label htmlFor="email" className="text-sm text-foreground">Email Address</Label>
                  <Input id="email" name="email" type="email" value={userProfile.email} onChange={(e) => setUserProfile({ ...userProfile, [e.target.name]: e.target.value })} className="mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent text-foreground placeholder:text-muted-foreground text-sm md:text-base" />
                </div>
              </motion.div>
            </motion.section>

            <Separator className="my-6 border-primary/20" />

             {/* Manage Budgets Section */}
            <motion.section variants={sectionVariants}>
                <h3 className="text-lg sm:text-xl font-semibold text-primary mb-4 flex items-center gap-2"><Target className="text-accent"/>Manage Budgets</h3>
                 <Card className="bg-background/50 border-primary/10">
                    <CardHeader><CardTitle className="text-base text-primary">Add New Budget</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-sm">Budget Type</Label>
                                 <RadioGroup value={newBudgetType} onValueChange={(val) => { setNewBudgetType(val as 'category' | 'expenseType'); setNewBudgetTargetId(''); }} className="flex space-x-4 mt-2">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="category" id="budget-cat"/><Label htmlFor="budget-cat">By Category</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="expenseType" id="budget-type"/><Label htmlFor="budget-type">By Expense Type</Label></div>
                                </RadioGroup>
                            </div>
                            <div>
                                <Label htmlFor="newBudgetTargetId" className="text-sm">Target</Label>
                                <Select value={newBudgetTargetId} onValueChange={setNewBudgetTargetId}>
                                    <SelectTrigger id="newBudgetTargetId" className="mt-1 w-full"><SelectValue placeholder="Select a target" /></SelectTrigger>
                                    <SelectContent>
                                        {newBudgetType === 'category' ? 
                                            (expenseCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)) : 
                                            (['need', 'want', 'investment'].map(type => <SelectItem key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</SelectItem>))
                                        }
                                    </SelectContent>
                                </Select>
                            </div>
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="newBudgetName" className="text-sm">Budget Name (Optional)</Label>
                                <Input id="newBudgetName" value={newBudgetName} onChange={(e) => setNewBudgetName(e.target.value)} placeholder="e.g., Monthly Food Budget" className="mt-1"/>
                            </div>
                            <div>
                                <Label htmlFor="newBudgetAmount" className="text-sm">Amount (₹)</Label>
                                <Input id="newBudgetAmount" type="number" value={newBudgetAmount} onChange={(e) => setNewBudgetAmount(e.target.value)} placeholder="e.g., 5000" className="mt-1"/>
                            </div>
                        </div>
                        <Button onClick={handleAddBudget} disabled={isSubmitting} className="w-full sm:w-auto" withMotion>
                          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4"/>}
                          Add Budget
                        </Button>
                    </CardContent>
                </Card>
                 <Separator className="my-4"/>
                <Card className="bg-background/50 border-primary/10">
                    <CardHeader><CardTitle className="text-base text-primary">Existing Budgets</CardTitle></CardHeader>
                    <CardContent>
                        {isLoadingData ? <Loader2 className="animate-spin" /> : (
                            <ul className="space-y-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {budgets.map(budget => (
                                     <li key={budget.id} className="flex justify-between items-center text-sm p-2 rounded-md bg-background/50 border">
                                        <div className="truncate pr-2">
                                            <p className="font-semibold truncate">{budget.name}</p>
                                            <p className="text-xs text-muted-foreground">₹{budget.amount.toLocaleString()} / month</p>
                                        </div>
                                        <div className="flex items-center">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" onClick={() => handleOpenEditDialog(budget)}>
                                                <Edit className="h-4 w-4"/>
                                            </Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" disabled={isDeleting === budget.id}>
                                                        {isDeleting === budget.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4"/>}
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader><AlertDialogTitle>Delete Budget?</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete the '{budget.name}' budget?</AlertDialogDescription></AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteBudget(budget.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                     </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </motion.section>

            <Separator className="my-6 border-primary/20" />


            {/* Manage Categories Section */}
            <motion.section variants={sectionVariants}>
                <h3 className="text-lg sm:text-xl font-semibold text-primary mb-4 flex items-center gap-2"><Tag className="text-accent"/>Manage Categories</h3>
                 <Card className="bg-background/50 border-primary/10">
                    <CardHeader><CardTitle className="text-base text-primary">Add New Category</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="newCategoryName" className="text-sm">Category Name</Label>
                                <Input id="newCategoryName" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="e.g., Health Insurance" className="mt-1"/>
                            </div>
                            <div>
                                <Label className="text-sm">Category Type</Label>
                                 <RadioGroup value={newCategoryType} onValueChange={(val) => setNewCategoryType(val as 'expense' | 'income')} className="flex space-x-4 mt-2">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="expense" id="cat-exp"/><Label htmlFor="cat-exp">Expense</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="income" id="cat-inc"/><Label htmlFor="cat-inc">Income</Label></div>
                                </RadioGroup>
                            </div>
                        </div>
                        <Button onClick={handleAddCategory} disabled={isSubmitting} className="w-full sm:w-auto" withMotion>
                          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4"/>}
                          Add Category
                        </Button>
                    </CardContent>
                </Card>
                 <Separator className="my-4"/>
                <Card className="bg-background/50 border-primary/10">
                    <CardHeader><CardTitle className="text-base text-primary">Existing Categories</CardTitle></CardHeader>
                    <CardContent>
                        {isLoadingData ? <Loader2 className="animate-spin" /> : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-semibold text-accent mb-2">Expenses</h4>
                                    <ul className="space-y-2">{categories.filter(c=>c.type === 'expense').map(cat => <li key={cat.id} className="flex justify-between items-center text-sm p-2 rounded-md bg-background/50 border"><span className="truncate pr-2">{cat.name}</span><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteCategory(cat.id)} disabled={isDeleting === cat.id}>{isDeleting === cat.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4"/>}</Button></li>)}</ul>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-accent mb-2">Income</h4>
                                    <ul className="space-y-2">{categories.filter(c=>c.type === 'income').map(cat => <li key={cat.id} className="flex justify-between items-center text-sm p-2 rounded-md bg-background/50 border"><span className="truncate pr-2">{cat.name}</span><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteCategory(cat.id)} disabled={isDeleting === cat.id}>{isDeleting === cat.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4"/>}</Button></li>)}</ul>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </motion.section>

             <Separator className="my-6 border-primary/20" />

            {/* Manage Payment Methods Section */}
            <motion.section variants={sectionVariants}>
                 <h3 className="text-lg sm:text-xl font-semibold text-primary mb-4 flex items-center gap-2"><List className="text-accent"/>Manage Payment Methods</h3>
                 <Card className="bg-background/50 border-primary/10">
                     <CardHeader><CardTitle className="text-base text-primary">Add New Payment Method</CardTitle></CardHeader>
                     <CardContent className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                 <Label htmlFor="newPaymentMethodName" className="text-sm">Method Name</Label>
                                 <Input id="newPaymentMethodName" value={newPaymentMethodName} onChange={(e) => setNewPaymentMethodName(e.target.value)} placeholder="e.g., Amex Gold Card" className="mt-1"/>
                             </div>
                             <div>
                                 <Label htmlFor="newPaymentMethodType" className="text-sm">Method Type</Label>
                                 <Input id="newPaymentMethodType" value={newPaymentMethodType} onChange={(e) => setNewPaymentMethodType(e.target.value)} placeholder="e.g., Credit Card" className="mt-1"/>
                             </div>
                         </div>
                         <Button onClick={handleAddPaymentMethod} disabled={isSubmitting} className="w-full sm:w-auto" withMotion>
                           {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4"/>}
                           Add Method
                         </Button>
                     </CardContent>
                 </Card>
                  <Separator className="my-4"/>
                 <Card className="bg-background/50 border-primary/10">
                    <CardHeader><CardTitle className="text-base text-primary">Existing Methods</CardTitle></CardHeader>
                    <CardContent>
                         {isLoadingData ? <Loader2 className="animate-spin" /> : (
                             <ul className="space-y-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                 {paymentMethods.map(pm => (
                                     <li key={pm.id} className="flex justify-between items-center text-sm p-2 rounded-md bg-background/50 border">
                                        <div className="truncate pr-2"><p className="font-semibold truncate">{pm.name}</p><p className="text-xs text-muted-foreground">{pm.type}</p></div>
                                         <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDeletePaymentMethod(pm.id)} disabled={isDeleting === pm.id}>
                                             {isDeleting === pm.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4"/>}
                                         </Button>
                                     </li>
                                 ))}
                             </ul>
                         )}
                     </CardContent>
                 </Card>
             </motion.section>

            <Separator className="my-6 border-primary/20" />
            
            <motion.section variants={sectionVariants}>
              <h3 className="text-lg sm:text-xl font-semibold text-primary mb-4 flex items-center gap-2"><Bell className="text-accent"/>Notifications</h3>
              <motion.div variants={itemVariants} className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                  <Label htmlFor="spendingAlerts" className="text-sm text-foreground">Spending Alerts</Label>
                  <Switch id="spendingAlerts" checked={notifications.spendingAlerts} onCheckedChange={() => setNotifications({ ...notifications, spendingAlerts: !notifications.spendingAlerts })} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                  <Label htmlFor="monthlySummary" className="text-sm text-foreground">Monthly Summary Email</Label>
                  <Switch id="monthlySummary" checked={notifications.monthlySummary} onCheckedChange={() => setNotifications({ ...notifications, monthlySummary: !notifications.monthlySummary })} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                  <Label htmlFor="aiInsightsEmail" className="text-sm text-foreground">Receive AI Insights by Email</Label>
                  <Switch id="aiInsightsEmail" checked={notifications.aiInsightsEmail} onCheckedChange={() => setNotifications({ ...notifications, aiInsightsEmail: !notifications.aiInsightsEmail })} />
                </div>
              </motion.div>
            </motion.section>

            <Separator className="my-6 border-primary/20" />
            
            <motion.section variants={sectionVariants}>
              <h3 className="text-lg sm:text-xl font-semibold text-primary mb-4 flex items-center gap-2"><Palette className="text-accent"/>Appearance</h3>
              <motion.div variants={itemVariants} className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                <Label htmlFor="darkMode" className="text-sm text-foreground">Theme</Label>
                <ThemeToggle />
              </motion.div>
            </motion.section>
            
            <Separator className="my-6 border-primary/20" />
            
            <motion.section variants={sectionVariants}>
              <h3 className="text-lg sm:text-xl font-semibold text-primary mb-4 flex items-center gap-2"><ShieldCheck className="text-accent"/>Data & Privacy</h3>
              <motion.div variants={itemVariants} className="space-y-3 flex flex-col sm:flex-row sm:space-y-0 sm:space-x-3">
                  <Button variant="outline" className="w-full sm:w-auto border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs md:text-sm" withMotion>Export My Data</Button>
                  <Button variant="destructive" className="w-full sm:w-auto text-xs md:text-sm" withMotion>Delete My Account</Button>
              </motion.div>
              <p className="text-xs text-muted-foreground mt-2">Be careful, some actions are irreversible!</p>
            </motion.section>

            <div className="mt-8 flex justify-end">
                <Button onClick={handleSaveChanges} className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs md:text-sm" withMotion>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

       <Dialog open={editingBudget !== null} onOpenChange={(isOpen) => !isOpen && setEditingBudget(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Budget Amount</DialogTitle>
                    <DialogDescription>Update the monthly amount for '{editingBudget?.name}'.</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="edit-budget-amount">Amount (₹)</Label>
                    <Input id="edit-budget-amount" type="number" value={editBudgetAmount} onChange={(e) => setEditBudgetAmount(e.target.value)} className="mt-1" />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setEditingBudget(null)}>Cancel</Button>
                    <Button onClick={handleUpdateBudget} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update Budget
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </main>
  );
}
