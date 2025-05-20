
"use client";

import { useState, type FormEvent, useEffect, useCallback } from 'react';
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
import { CalendarIcon, FilePlus, Loader2, XCircle } from "lucide-react";
import { format } from "date-fns";
import type { TransactionType as AppTransactionTypeEnum, ExpenseType as AppExpenseTypeEnum, TransactionInput, Category, PaymentMethod, AppTransaction } from "@/lib/types";
import { getCategories, getPaymentMethods, addTransaction, updateTransaction } from '@/lib/actions/transactions';
import { useToast } from "@/hooks/use-toast";

interface TransactionFormProps {
  onTransactionAdded?: () => void;
  initialTransactionData?: AppTransaction | null; // Using AppTransaction which includes 'id'
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
  const [type, setType] = useState<AppTransactionTypeEnum>('expense');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | undefined>(undefined);
  const [expenseType, setExpenseType] = useState<AppExpenseTypeEnum | undefined>('need');
  const [source, setSource] = useState<string | undefined>(undefined); 

  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingDropdowns, setIsFetchingDropdowns] = useState(true);
  const [formId, setFormId] = useState<string | null>(null); // To store ID for editing

  const fetchDropdownData = useCallback(async () => {
    setIsFetchingDropdowns(true);
    try {
      const [fetchedExpenseCategories, fetchedIncomeCategories, fetchedPaymentMethods] = await Promise.all([
        getCategories('expense'),
        getCategories('income'),
        getPaymentMethods()
      ]);
      setExpenseCategories(fetchedExpenseCategories);
      setIncomeCategories(fetchedIncomeCategories);
      setAllCategories([...fetchedExpenseCategories, ...fetchedIncomeCategories]); 
      setPaymentMethods(fetchedPaymentMethods);

      if (!initialTransactionData) {
        setSelectedCategoryId(fetchedExpenseCategories.length > 0 ? fetchedExpenseCategories[0].id : undefined);
        setSelectedPaymentMethodId(fetchedPaymentMethods.length > 0 ? fetchedPaymentMethods[0].id : undefined);
      }

    } catch (error) {
      console.error("Failed to fetch dropdown data:", error);
      toast({ title: "Error", description: "Could not load categories or payment methods.", variant: "destructive" });
    } finally {
      setIsFetchingDropdowns(false);
    }
  }, [toast, initialTransactionData]);


  useEffect(() => {
    setIsClient(true);
    fetchDropdownData();
  }, [fetchDropdownData]);
  

  useEffect(() => {
    if (initialTransactionData) {
      setFormId(initialTransactionData.id);
      setType(initialTransactionData.type);
      setDate(new Date(initialTransactionData.date)); 
      setAmount(initialTransactionData.amount.toString());
      setDescription(initialTransactionData.description || '');
      if (initialTransactionData.type === 'expense') {
        setSelectedCategoryId(initialTransactionData.category?.id || undefined);
        setSelectedPaymentMethodId(initialTransactionData.paymentMethod?.id || undefined);
        setExpenseType(initialTransactionData.expenseType || 'need');
        setSource(undefined);
      } else { 
        setSelectedCategoryId(initialTransactionData.category?.id || undefined);
        setSource(initialTransactionData.source || ''); 
        setSelectedPaymentMethodId(undefined); 
        setExpenseType(undefined); 
      }
    } else {
        setFormId(null);
        setType('expense');
        setDate(new Date());
        setAmount('');
        setDescription('');
        setExpenseType('need');
        if (expenseCategories.length > 0 && !selectedCategoryId) {
          setSelectedCategoryId(expenseCategories[0].id);
        }
        if (paymentMethods.length > 0 && !selectedPaymentMethodId) {
          setSelectedPaymentMethodId(paymentMethods[0].id);
        }
        if (type === 'income' && incomeCategories.length > 0 && !source) {
             // User types source text
        }
    }
  }, [initialTransactionData, type, incomeCategories, expenseCategories, paymentMethods, selectedCategoryId, selectedPaymentMethodId, source]);


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!date || !amount ) { 
      toast({
        title: "Missing Information!",
        description: "Please fill in all required fields (Date, Amount).",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const transactionPayload: TransactionInput = {
      type: type as 'income' | 'expense',
      date,
      amount: parseFloat(amount),
      description: description || undefined, 
      ...(type === 'expense' && {
        categoryId: selectedCategoryId,
        paymentMethodId: selectedPaymentMethodId,
        expenseType: expenseType
      }),
      ...(type === 'income' && {
        source: source, 
        categoryId: selectedCategoryId, 
      }),
    };
    
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
        setType('expense'); 
        setSelectedCategoryId(expenseCategories.length > 0 ? expenseCategories[0].id : undefined);
        setSelectedPaymentMethodId(paymentMethods.length > 0 ? paymentMethods[0].id : undefined);
        setExpenseType('need');
        setSource(''); 
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

  const FormWrapperComponent = initialTransactionData ? motion.div : Card; // No motion for wrapped Card for now
  const formWrapperProps = initialTransactionData
    ? { variants: formCardVariants, initial: "hidden", animate: "visible" } // Props for motion.div
    : {
        className: cn("shadow-xl rounded-xl p-0 sm:p-0", glowClass, "bg-card"), // Props for Card
      };
  
  const labelClasses = "text-foreground/90 dark:text-foreground/80";
  const inputClasses = "bg-background/70 dark:bg-input/20 border-border/70 dark:border-border/40 text-foreground placeholder:text-muted-foreground/70 focus:border-primary dark:focus:border-accent focus:ring-primary dark:focus:ring-accent";
  const popoverButtonClasses = cn(
    "w-full justify-start text-left font-normal mt-1",
    inputClasses,
    !date && "text-muted-foreground/70"
  );
  const popoverContentClasses = "w-auto p-0 bg-popover border-border text-popover-foreground";
  const calendarClasses = "[&_button]:text-popover-foreground [&_.rdp-button_span]:text-popover-foreground [&_.rdp-button:hover]:bg-accent/10 [&_.rdp-day_selected]:bg-primary [&_.rdp-day_selected]:text-primary-foreground";
  const selectTriggerClasses = cn("w-full mt-1", inputClasses);
  const selectContentClasses = "bg-popover border-border text-popover-foreground [&_.item]:focus:bg-accent/10";


  return (
    <FormWrapperComponent {...formWrapperProps}>
      {!initialTransactionData && ( 
        <CardHeader className="p-6 pb-4">
          <CardTitle className="flex items-center gap-2 text-xl text-primary">
            <FilePlus className="h-6 w-6 text-accent" /> {cardTitleText}
          </CardTitle>
          <CardDescription className="text-muted-foreground">{cardDescriptionText}</CardDescription>
        </CardHeader>
      )}
      <CardContent className={initialTransactionData ? 'p-0' : 'p-6'}>
        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
          <div>
            <Label className={labelClasses}>Transaction Type</Label>
            <RadioGroup value={type} onValueChange={(value) => setType(value as 'income' | 'expense')} className="flex space-x-4 mt-1">
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="income"
                  id={`income-${formId || 'new'}`}
                  className={cn(
                    "border-primary text-primary focus:ring-primary",
                    type === 'income' ? "data-[state=checked]:border-green-600 data-[state=checked]:bg-green-500 data-[state=checked]:text-primary-foreground" : ""
                  )}
                />
                <Label htmlFor={`income-${formId || 'new'}`} className={cn("text-foreground", type === 'income' && "text-green-600 font-medium")}>Income (₹)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="expense"
                  id={`expense-${formId || 'new'}`}
                  className={cn(
                    "border-primary text-primary focus:ring-primary",
                     type === 'expense' ? "data-[state=checked]:border-red-600 data-[state=checked]:bg-red-500 data-[state=checked]:text-primary-foreground" : ""
                  )}
                />
                <Label htmlFor={`expense-${formId || 'new'}`} className={cn("text-foreground", type === 'expense' && "text-red-600 font-medium")}>Expense (₹)</Label>
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
                    disabled={isFetchingDropdowns}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-accent" />
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
              <Input id={`amount-${formId || 'new'}`} type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className={cn("mt-1", inputClasses)} required disabled={isFetchingDropdowns}/>
            </div>
          </div>

          <div>
            <Label htmlFor={`description-${formId || 'new'}`} className={labelClasses}>Description</Label>
            <Input id={`description-${formId || 'new'}`} placeholder={type === 'expense' ? "e.g., Groceries, Dinner out" : "e.g., July Salary"} value={description} onChange={(e) => setDescription(e.target.value)} className={cn("mt-1", inputClasses)} disabled={isFetchingDropdowns}/>
          </div>

          {type === 'expense' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`category-${formId || 'new'}`} className={labelClasses}>Category</Label>
                  <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId} disabled={isFetchingDropdowns}>
                    <SelectTrigger id={`category-${formId || 'new'}`} className={selectTriggerClasses}>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className={selectContentClasses}>
                      {expenseCategories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`paymentMethod-${formId || 'new'}`} className={labelClasses}>Payment Method</Label>
                  <Select value={selectedPaymentMethodId} onValueChange={setSelectedPaymentMethodId} disabled={isFetchingDropdowns}>
                    <SelectTrigger id={`paymentMethod-${formId || 'new'}`} className={selectTriggerClasses}>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent className={selectContentClasses}>
                      {paymentMethods.map(pm => <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className={labelClasses}>Expense Type (Need, Want, or Investment)</Label>
                <RadioGroup value={expenseType} onValueChange={(value) => setExpenseType(value as AppExpenseTypeEnum)} className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
                  {[
                    { value: 'need', label: 'Need' },
                    { value: 'want', label: 'Want' },
                    { value: 'investment_expense', label: 'Investment' }
                  ].map(et => (
                    <div key={et.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={et.value} id={`${et.value}-${formId || 'new'}`}
                       className={cn(
                          "border-primary text-primary focus:ring-primary",
                          expenseType === et.value && type === 'expense' ? "data-[state=checked]:border-red-600 data-[state=checked]:bg-red-500 data-[state=checked]:text-primary-foreground"
                                            : "data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground"
                       )}
                       disabled={isFetchingDropdowns}
                      />
                      <Label htmlFor={`${et.value}-${formId || 'new'}`} className={cn("text-foreground", expenseType === et.value && type === 'expense' ? "text-red-600 font-medium" : "text-foreground" )}>{et.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </>
          )}

          {type === 'income' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor={`income-category-${formId || 'new'}`} className={labelClasses}>Income Category</Label>
                 <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId} disabled={isFetchingDropdowns}>
                    <SelectTrigger id={`income-category-${formId || 'new'}`} className={selectTriggerClasses}>
                      <SelectValue placeholder="Select income category" />
                    </SelectTrigger>
                    <SelectContent className={selectContentClasses}>
                      {incomeCategories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
              </div>
               <div>
                <Label htmlFor={`source-${formId || 'new'}`} className={labelClasses}>Source Description (Optional)</Label>
                <Input id={`source-${formId || 'new'}`} placeholder="e.g., Client Project X, Bonus Q2" value={source} onChange={(e) => setSource(e.target.value)} className={cn("mt-1", inputClasses)} disabled={isFetchingDropdowns}/>
              </div>
            </div>
          )}
          
          {isFetchingDropdowns && (
             <div className="flex items-center justify-center space-x-2 text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading form options...</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-3">
            <motion.div {...buttonHoverTap} className="w-full sm:flex-1">
              <Button
                type="submit"
                disabled={isLoading || isFetchingDropdowns}
                className={cn(
                  "w-full font-semibold text-white", // Ensure text is white for better contrast on colored buttons
                  isLoading ? "bg-muted hover:bg-muted text-muted-foreground" :
                  type === 'income' ? "bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700" : 
                  "bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700" 
                )}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus className="mr-2 h-4 w-4"/>}
                {isLoading ? (formId ? "Updating..." : "Adding...") : submitButtonText}
              </Button>
            </motion.div>
            {initialTransactionData && onCancel && (
              <motion.div {...buttonHoverTap} className="w-full sm:flex-1">
                <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading || isFetchingDropdowns} className="w-full border-border text-foreground hover:bg-muted">
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
