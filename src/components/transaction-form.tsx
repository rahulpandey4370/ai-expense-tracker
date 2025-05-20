
"use client";

import { useState, type FormEvent, useEffect } from 'react';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CalendarIcon, PlusCircle, XCircle, FilePlus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type { Transaction, TransactionEnumType, ExpenseEnumType } from "@/lib/types";
import { addTransaction, updateTransaction, type TransactionInput } from '@/lib/actions/transactions';
import { expenseCategories, incomeCategories, paymentMethods } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";

interface TransactionFormProps {
  onTransactionAdded?: () => void;
  initialTransactionData?: Transaction | null;
  onCancel?: () => void;
}

const formCardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const buttonHoverTap = {
  whileHover: { scale: 1.03, transition: { duration: 0.15 } },
  whileTap: { scale: 0.97 },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

export function TransactionForm({ onTransactionAdded, initialTransactionData, onCancel }: TransactionFormProps) {
  const { toast } = useToast();
  const [type, setType] = useState<TransactionEnumType>('expense');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [paymentMethod, setPaymentMethod] = useState<string | undefined>(undefined);
  const [expenseType, setExpenseType] = useState<ExpenseEnumType | undefined>(undefined);
  const [source, setSource] = useState<string | undefined>(undefined);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formId, setFormId] = useState<string | null>(null);


  useEffect(() => {
    setIsClient(true);
    if (initialTransactionData) {
      setFormId(initialTransactionData.id);
      setType(initialTransactionData.type);
      setDate(new Date(initialTransactionData.date));
      setAmount(initialTransactionData.amount.toString());
      setDescription(initialTransactionData.description);
      if (initialTransactionData.type === 'expense') {
        setCategory(initialTransactionData.category);
        setPaymentMethod(initialTransactionData.paymentMethod);
        setExpenseType(initialTransactionData.expenseType);
        setSource(undefined);
      } else {
        setSource(initialTransactionData.source);
        setCategory(undefined);
        setPaymentMethod(undefined);
        setExpenseType(undefined);
      }
    } else {
        setFormId(null);
        setType('expense');
        setDate(new Date());
        setAmount('');
        setDescription('');
        setCategory(expenseCategories.length > 0 ? expenseCategories[0].name : undefined);
        setPaymentMethod(paymentMethods.length > 0 ? paymentMethods[0].name : undefined);
        setExpenseType('need');
        setSource(incomeCategories.length > 0 ? incomeCategories[0].name : undefined);
    }
  }, [initialTransactionData]);


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!date || !amount || !description ) {
      toast({
        title: "Missing Information!",
        description: "Please fill in all required fields for the transaction.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const transactionPayload: TransactionInput = {
      type,
      date,
      amount: parseFloat(amount),
      description,
      ...(type === 'expense' && {
        category: category || '',
        paymentMethod: paymentMethod || '',
        expenseType: expenseType || 'need'
      }),
      ...(type === 'income' && {
        source: source || ''
      }),
    };

    if (type === 'expense' && (!transactionPayload.category || !transactionPayload.paymentMethod || !transactionPayload.expenseType)) {
        toast({ title: "Expense Details Missing", description: "Category, Payment Method, and Expense Type are required for expenses.", variant: "destructive" });
        setIsLoading(false);
        return;
    }
    if (type === 'income' && !transactionPayload.source) {
        toast({ title: "Income Source Missing", description: "Source is required for income.", variant: "destructive" });
        setIsLoading(false);
        return;
    }

    try {
      if (formId) {
        await updateTransaction(formId, transactionPayload);
        toast({ title: "Transaction Updated!", description: "Your transaction has been successfully modified." });
      } else {
        await addTransaction(transactionPayload);
        toast({ title: "Transaction Added!", description: "New transaction recorded successfully." });
      }

      onTransactionAdded?.();

      if (!initialTransactionData) {
        setDate(new Date());
        setAmount('');
        setDescription('');
        setCategory(expenseCategories.length > 0 ? expenseCategories[0].name : undefined);
        setPaymentMethod(paymentMethods.length > 0 ? paymentMethods[0].name : undefined);
        setExpenseType('need');
        setSource(incomeCategories.length > 0 ? incomeCategories[0].name : undefined);
        setType('expense');
      }
      if (onCancel && formId) onCancel();

    } catch (error) {
      console.error("Transaction form error:", error);
      toast({
        title: "Error!",
        description: error instanceof Error ? error.message : "Could not save transaction. Please check the details.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const cardTitleText = initialTransactionData ? "Edit Transaction" : "Add New Transaction";
  const cardDescriptionText = initialTransactionData ? "Modify the details of this transaction." : "Log your income or expenses quickly.";
  const submitButtonText = initialTransactionData ? "Update Transaction" : "Add Transaction";

  if (!isClient && !initialTransactionData) {
    return null; 
  }

  const FormWrapperComponent = initialTransactionData ? motion.div : motion(Card);
  const formWrapperProps = initialTransactionData
    ? { variants: formCardVariants, initial: "hidden", animate: "visible" }
    : {
        className: cn("shadow-xl rounded-xl bg-card p-6", glowClass), // Use bg-card for light mode, p-6 for internal padding
        variants: formCardVariants,
        initial: "hidden",
        animate: "visible"
      };
  
  const labelClasses = "text-foreground dark:text-purple-300/90";
  const inputClasses = "bg-background/70 dark:bg-purple-800/30 border-border dark:border-purple-500/50 text-foreground dark:text-purple-100 placeholder:text-muted-foreground dark:placeholder:text-purple-400/60 focus:border-accent dark:focus:border-yellow-400 focus:ring-accent dark:focus:ring-yellow-400";
  const popoverButtonClasses = cn(
    "w-full justify-start text-left font-normal mt-1",
    "bg-background/70 dark:bg-purple-800/30 border-border dark:border-purple-500/50",
    "text-foreground dark:text-purple-100 hover:bg-muted dark:hover:bg-purple-700/40",
    "focus:border-accent dark:focus:border-yellow-400 focus:ring-accent dark:focus:ring-yellow-400",
    !date && "text-muted-foreground dark:text-purple-400/70"
  );
  const popoverContentClasses = "w-auto p-0 bg-popover dark:bg-purple-900 border-border dark:border-purple-500/70 text-popover-foreground dark:text-purple-100";
  const calendarClasses = "[&_button]:text-popover-foreground dark:[&_button]:text-purple-200 [&_.rdp-button_span]:text-popover-foreground dark:[&_.rdp-button_span]:text-purple-200 [&_.rdp-button:hover]:bg-accent/10 dark:[&_.rdp-button:hover]:bg-purple-700/50 [&_.rdp-day_selected]:bg-primary dark:[&_.rdp-day_selected]:bg-yellow-500 [&_.rdp-day_selected]:text-primary-foreground dark:[&_.rdp-day_selected]:text-purple-950";
  const selectTriggerClasses = cn("w-full mt-1", inputClasses);
  const selectContentClasses = "bg-popover dark:bg-purple-900 border-border dark:border-purple-500/70 text-popover-foreground dark:text-purple-100 [&_.item]:focus:bg-accent/10 dark:[&_.item]:focus:bg-yellow-500/20";


  return (
    <FormWrapperComponent {...formWrapperProps}>
      {!initialTransactionData && (
        <CardHeader className="p-0 pb-6">
          <CardTitle className="flex items-center gap-2 text-xl text-primary dark:text-purple-300">
            <FilePlus className="h-6 w-6 text-accent dark:text-yellow-400" /> {cardTitleText}
          </CardTitle>
          <CardDescription className="text-muted-foreground dark:text-purple-400/80">{cardDescriptionText}</CardDescription>
        </CardHeader>
      )}
      <CardContent className={initialTransactionData ? 'p-0' : 'p-0'}>
        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
          <div>
            <Label className={labelClasses}>Transaction Type</Label>
            <RadioGroup value={type} onValueChange={(value) => setType(value as TransactionEnumType)} className="flex space-x-4 mt-1">
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="income"
                  id={`income-${formId || 'new'}`}
                  className={cn(
                    "border-primary text-primary focus:ring-primary",
                    "data-[state=checked]:border-green-600 data-[state=checked]:bg-green-500 data-[state=checked]:text-green-50"
                  )}
                />
                <Label htmlFor={`income-${formId || 'new'}`} className={cn("text-foreground dark:text-purple-200/90", type === 'income' && "text-green-600 dark:text-green-300 font-medium")}>Income (₹)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="expense"
                  id={`expense-${formId || 'new'}`}
                  className={cn(
                    "border-primary text-primary focus:ring-primary",
                    "data-[state=checked]:border-red-600 data-[state=checked]:bg-red-500 data-[state=checked]:text-red-50"
                  )}
                />
                <Label htmlFor={`expense-${formId || 'new'}`} className={cn("text-foreground dark:text-purple-200/90", type === 'expense' && "text-red-600 dark:text-red-300 font-medium")}>Expense (₹)</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor={`date-${formId || 'new'}`} className={labelClasses}>Date of Transaction</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={popoverButtonClasses}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-accent dark:text-yellow-400" />
                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className={popoverContentClasses}>
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    className={calendarClasses}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor={`amount-${formId || 'new'}`} className={labelClasses}>Amount (₹)</Label>
              <Input id={`amount-${formId || 'new'}`} type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className={cn("mt-1", inputClasses)} required />
            </div>
          </div>

          <div>
            <Label htmlFor={`description-${formId || 'new'}`} className={labelClasses}>Description</Label>
            <Input id={`description-${formId || 'new'}`} placeholder="e.g., Groceries, Dinner out" value={description} onChange={(e) => setDescription(e.target.value)} className={cn("mt-1", inputClasses)} required />
          </div>

          {type === 'expense' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`category-${formId || 'new'}`} className={labelClasses}>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id={`category-${formId || 'new'}`} className={selectTriggerClasses}>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className={selectContentClasses}>
                      {expenseCategories.map(cat => <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`paymentMethod-${formId || 'new'}`} className={labelClasses}>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger id={`paymentMethod-${formId || 'new'}`} className={selectTriggerClasses}>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent className={selectContentClasses}>
                      {paymentMethods.map(pm => <SelectItem key={pm.id} value={pm.name}>{pm.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className={labelClasses}>Expense Type (Need, Want, or Investment)</Label>
                <RadioGroup value={expenseType} onValueChange={(value) => setExpenseType(value as ExpenseEnumType)} className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
                  {[
                    { value: 'need', label: 'Need' },
                    { value: 'want', label: 'Want' },
                    { value: 'investment_expense', label: 'Investment' }
                  ].map(et => (
                    <div key={et.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={et.value} id={`${et.value}-${formId || 'new'}`}
                       className={cn(
                          "border-primary text-primary focus:ring-primary",
                          expenseType === et.value && type === 'expense' ? "data-[state=checked]:border-red-600 data-[state=checked]:bg-red-500 data-[state=checked]:text-red-50"
                                            : "data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground"

                       )}
                      />
                      <Label htmlFor={`${et.value}-${formId || 'new'}`} className={cn("text-foreground dark:text-purple-200/90", expenseType === et.value && type === 'expense' ? "text-red-600 dark:text-red-300 font-medium" : "text-accent dark:text-yellow-300 font-medium" )}>{et.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </>
          )}

          {type === 'income' && (
            <div>
              <Label htmlFor={`source-${formId || 'new'}`} className={labelClasses}>Source of Income</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger id={`source-${formId || 'new'}`} className={selectTriggerClasses}>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent className={selectContentClasses}>
                  {incomeCategories.map(cat => <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-3">
            <motion.div {...buttonHoverTap} className="w-full sm:flex-1">
              <Button
                type="submit"
                disabled={isLoading}
                className={cn(
                  "w-full font-bold text-white",
                  isLoading ? "bg-muted hover:bg-muted text-muted-foreground" :
                  type === 'income' ? "bg-green-500 hover:bg-green-600" :
                  "bg-red-500 hover:bg-red-600"
                )}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus className="mr-2 h-4 w-4"/>}
                {isLoading ? (formId ? "Updating..." : "Adding...") : submitButtonText}
              </Button>
            </motion.div>
            {initialTransactionData && onCancel && (
              <motion.div {...buttonHoverTap} className="w-full sm:flex-1">
                <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading} className="w-full border-border dark:border-purple-500/70 text-foreground dark:text-purple-300 hover:bg-muted dark:hover:bg-purple-700/30 dark:hover:text-purple-100">
                  <XCircle className="mr-2 h-4 w-4"/>
                  Cancel Edit
                </Button>
              </motion.div>
            )}
          </div>
        </form>
      </CardContent>
    </FormWrapperComponent>
  );
}

