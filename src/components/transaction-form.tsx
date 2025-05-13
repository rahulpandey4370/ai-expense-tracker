
"use client";

import { useState, type FormEvent, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CalendarIcon, PlusCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import type { Transaction, TransactionEnumType, ExpenseEnumType } from "@/lib/types";
import { expenseCategories, incomeCategories, paymentMethods } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";

interface TransactionFormProps {
  onAddTransaction: (transaction: Transaction) => void;
  initialTransactionData?: Transaction | null; // For editing
  onCancel?: () => void; // For closing edit modal
}

export function TransactionForm({ onAddTransaction, initialTransactionData, onCancel }: TransactionFormProps) {
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
  const [id, setId] = useState<string | null>(null); // For editing

  useEffect(() => {
    setIsClient(true);
    if (initialTransactionData) {
      setId(initialTransactionData.id);
      setType(initialTransactionData.type);
      setDate(initialTransactionData.date);
      setAmount(initialTransactionData.amount.toString());
      setDescription(initialTransactionData.description);
      if (initialTransactionData.type === 'expense') {
        setCategory(initialTransactionData.category);
        setPaymentMethod(initialTransactionData.paymentMethod);
        setExpenseType(initialTransactionData.expenseType);
      } else {
        setSource(initialTransactionData.source);
      }
    } else {
        // Reset form for new transaction
        setId(null);
        setType('expense');
        setDate(new Date());
        setAmount('');
        setDescription('');
        setCategory(undefined);
        setPaymentMethod(undefined);
        setExpenseType(undefined);
        setSource(undefined);
    }
  }, [initialTransactionData]);


  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!date || !amount || !description || (type === 'expense' && (!category || !paymentMethod || !expenseType)) || (type === 'income' && !source)) {
      toast({
        title: "Missing Spell Ingredients",
        description: "Please fill in all required fields for your financial charm.",
        variant: "destructive",
      });
      return;
    }

    const transactionData: Transaction = {
      id: id || new Date().toISOString() + Math.random().toString(), // Use existing id if editing
      type,
      date,
      amount: parseFloat(amount),
      description,
      ...(type === 'expense' && { category, paymentMethod, expenseType }),
      ...(type === 'income' && { source }),
    };

    onAddTransaction(transactionData); // This will be handleAddTransaction or handleEditTransaction
    
    if (!initialTransactionData) { // Only reset for new transactions
        setDate(new Date());
        setAmount('');
        setDescription('');
        setCategory(undefined);
        setPaymentMethod(undefined);
        setExpenseType(undefined);
        setSource(undefined);
    }
  };
  
  const cardTitle = initialTransactionData ? "Revise Your Spell (Edit Transaction)" : "Cast a New Spell (Add Transaction)";
  const cardDescription = initialTransactionData ? "Modify the details of this financial enchantment." : "Log your income or expenses quickly.";
  const submitButtonText = initialTransactionData ? "Update Enchantment" : "Add Financial Charm";


  if (!isClient && !initialTransactionData) { // Don't hide if it's part of a modal for editing
    return null; 
  }
  
  // If this form is used in a modal (like for editing), Card wrapper might be redundant
  // For the main page, it's fine. We can make it conditional or remove if always in modal.
  const FormWrapper = initialTransactionData ? React.Fragment : Card;
  const formWrapperProps = initialTransactionData ? {} : { className: "shadow-lg border-primary/20 border rounded-xl bg-card/80" };


  return (
    <FormWrapper {...formWrapperProps}>
      {!initialTransactionData && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl text-primary">
            <PlusCircle className="h-6 w-6 text-yellow-500" /> {cardTitle}
          </CardTitle>
          <CardDescription className="text-muted-foreground/80">{cardDescription}</CardDescription>
        </CardHeader>
      )}
      <CardContent className={initialTransactionData ? 'pt-0' : ''}> {/* Adjust padding if no header */}
        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
          <div>
            <Label className="text-foreground/80">Transaction Type (Charm or Curse?)</Label>
            <RadioGroup value={type} onValueChange={(value) => setType(value as TransactionEnumType)} className="flex space-x-4 mt-1">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="income" id={`income-${id || 'new'}`} />
                <Label htmlFor={`income-${id || 'new'}`}>Income (Galleons In)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="expense" id={`expense-${id || 'new'}`} />
                <Label htmlFor={`expense-${id || 'new'}`}>Expense (Galleons Out)</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor={`date-${id || 'new'}`} className="text-foreground/80">Date of Enchantment</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-background border-primary/30">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor={`amount-${id || 'new'}`} className="text-foreground/80">Amount (Galleons, Sickles, Knuts)</Label>
              <Input id={`amount-${id || 'new'}`} type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent" required />
            </div>
          </div>

          <div>
            <Label htmlFor={`description-${id || 'new'}`} className="text-foreground/80">Description (Spell Incantation)</Label>
            <Input id={`description-${id || 'new'}`} placeholder="e.g., Potion Ingredients, Owl Post Delivery" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent" required />
          </div>

          {type === 'expense' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`category-${id || 'new'}`} className="text-foreground/80">Category (Department of Magical Expenses)</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id={`category-${id || 'new'}`} className="w-full mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-primary/30">
                      {expenseCategories.map(cat => <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`paymentMethod-${id || 'new'}`} className="text-foreground/80">Payment Method (Mode of Magical Exchange)</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger id={`paymentMethod-${id || 'new'}`} className="w-full mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-primary/30">
                      {paymentMethods.map(pm => <SelectItem key={pm.id} value={pm.name}>{pm.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-foreground/80">Expense Type (Reason for Spell)</Label>
                <RadioGroup value={expenseType} onValueChange={(value) => setExpenseType(value as ExpenseEnumType)} className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
                  {[
                    { value: 'need', label: 'Need (Essential Charm)' },
                    { value: 'want', label: 'Want (Desirable Hex)' },
                    { value: 'investment_expense', label: 'Investment (Future Fortune Potion)' }
                  ].map(et => (
                    <div key={et.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={et.value} id={`${et.value}-${id || 'new'}`} />
                      <Label htmlFor={`${et.value}-${id || 'new'}`}>{et.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </>
          )}

          {type === 'income' && (
            <div>
              <Label htmlFor={`source-${id || 'new'}`} className="text-foreground/80">Source (Origin of Galleons)</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger id={`source-${id || 'new'}`} className="w-full mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent className="bg-background border-primary/30">
                  {incomeCategories.map(cat => <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button type="submit" className="w-full sm:flex-1 bg-yellow-500 hover:bg-yellow-600 text-primary-foreground">
              {submitButtonText}
            </Button>
            {initialTransactionData && onCancel && (
              <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:flex-1 border-primary/50 hover:bg-primary/10">
                <XCircle className="mr-2 h-4 w-4"/>
                Cancel Revision
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </FormWrapper>
  );
}

