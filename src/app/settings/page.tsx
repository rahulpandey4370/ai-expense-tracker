
"use client";

import { useState, useEffect, useCallback } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { User, Bell, Palette, ShieldCheck, Save, SettingsIcon, PlusCircle, Trash2, Loader2, List, Tag } from "lucide-react";
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';
import type { Category, PaymentMethod } from '@/lib/types';
import { getCategories, getPaymentMethods, addCategory, addPaymentMethod, deleteCategory, deletePaymentMethod } from '@/lib/actions/transactions';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  const [isLoadingData, setIsLoadingData] = useState(true);

  // State for new category/payment method forms
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<'expense' | 'income'>('expense');
  const [newPaymentMethodName, setNewPaymentMethodName] = useState('');
  const [newPaymentMethodType, setNewPaymentMethodType] = useState('Credit Card');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoadingData(true);
    try {
        const [fetchedCategories, fetchedPaymentMethods] = await Promise.all([
            getCategories(),
            getPaymentMethods()
        ]);
        setCategories(fetchedCategories);
        setPaymentMethods(fetchedPaymentMethods);
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
    } catch (error: any) {
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
    } catch (error: any) {
      toast({ title: "Error deleting payment method", description: `${error.message}. It might be in use by some transactions.`, variant: "destructive" });
    } finally {
      setIsDeleting(null);
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
    </main>
  );
}
