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
import { CalendarIcon, PlusCircle } from "lucide-react";
import { format } from "date-fns";
import type { Transaction, TransactionEnumType, ExpenseEnumType } from "@/lib/types";
import { expenseCategories, incomeCategories, paymentMethods } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";

interface TransactionFormProps {
  onAddTransaction: (transaction: Transaction) => void;
}

export function TransactionForm({ onAddTransaction }: TransactionFormProps) {
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

  useEffect(() => {
    setIsClient(true);
  }, []);


  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!date || !amount || !description || (type === 'expense' && (!category || !paymentMethod || !expenseType)) || (type === 'income' && !source)) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const newTransaction: Transaction = {
      id: new Date().toISOString() + Math.random().toString(), // basic unique id
      type,
      date,
      amount: parseFloat(amount),
      description,
      ...(type === 'expense' && { category, paymentMethod, expenseType }),
      ...(type === 'income' && { source }),
    };

    onAddTransaction(newTransaction);
    toast({
      title: "Transaction Added",
      description: `${type === 'income' ? 'Income' : 'Expense'} of ₹${amount} for "${description}" added successfully.`,
    });

    // Reset form
    setDate(new Date());
    setAmount('');
    setDescription('');
    setCategory(undefined);
    setPaymentMethod(undefined);
    setExpenseType(undefined);
    setSource(undefined);
  };

  if (!isClient) {
    return null; // Or a loading skeleton
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <PlusCircle className="h-6 w-6 text-primary" /> Add Transaction
        </CardTitle>
        <CardDescription>Log your income or expenses quickly.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label>Type</Label>
            <RadioGroup value={type} onValueChange={(value) => setType(value as TransactionEnumType)} className="flex space-x-4 mt-1">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="income" id="income" />
                <Label htmlFor="income">Income</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="expense" id="expense" />
                <Label htmlFor="expense">Expense</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal mt-1",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
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
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input id="amount" type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" required />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Input id="description" placeholder="e.g., Coffee, Salary" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" required />
          </div>

          {type === 'expense' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category" className="w-full mt-1">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {expenseCategories.map(cat => <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="paymentMethod">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger id="paymentMethod" className="w-full mt-1">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map(pm => <SelectItem key={pm.id} value={pm.name}>{pm.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Expense Type</Label>
                <RadioGroup value={expenseType} onValueChange={(value) => setExpenseType(value as ExpenseEnumType)} className="flex space-x-4 mt-1">
                  {[
                    { value: 'need', label: 'Need' },
                    { value: 'want', label: 'Want' },
                    { value: 'investment_expense', label: 'Investment' }
                  ].map(et => (
                    <div key={et.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={et.value} id={et.value} />
                      <Label htmlFor={et.value}>{et.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </>
          )}

          {type === 'income' && (
            <div>
              <Label htmlFor="source">Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger id="source" className="w-full mt-1">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {incomeCategories.map(cat => <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
            Add Transaction
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
