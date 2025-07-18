
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CalendarIcon, FilePlus, Loader2, XCircle, Wand2, ListChecks, AlertTriangle, FileImage, Paperclip, HandCoins } from "lucide-react";
import { format, parse as parseDateFns } from "date-fns";
import type { TransactionType as AppTransactionTypeEnum, ExpenseType as AppExpenseTypeEnum, TransactionInput, Category, PaymentMethod, AppTransaction, ParsedAITransaction, ParsedReceiptTransaction } from "@/lib/types";
import { getCategories, getPaymentMethods, addTransaction, updateTransaction } from '@/lib/actions/transactions';
import { useToast } from "@/hooks/use-toast";
import { parseTransactionsFromText } from '@/ai/flows/parse-transactions-flow';
import { parseReceiptImage } from '@/ai/flows/parse-receipt-flow';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { TransactionInputSchema, ParsedAITransactionSchema, ParsedReceiptTransactionSchema } from '@/lib/types';
import Image from 'next/image';


interface TransactionFormProps {
  onTransactionAdded?: () => void;
  initialTransactionData?: AppTransaction | null;
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

type BulkParsedTransaction = Partial<TransactionInput> & {
  originalRow: string;
  rowIndex: number;
  errors?: string[];
  categoryName?: string;
  paymentMethodName?: string;
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";


export function TransactionForm({ onTransactionAdded, initialTransactionData, onCancel }: TransactionFormProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'ai_text' | 'ai_receipt'>('ai_text');

  // Single Transaction State
  const [type, setType] = useState<AppTransactionTypeEnum>('expense');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | undefined>(undefined);
  const [expenseType, setExpenseType] = useState<AppExpenseTypeEnum | undefined>('need');
  const [source, setSource] = useState<string | undefined>(undefined);
  const [formId, setFormId] = useState<string | null>(null);

  // Dropdown Data State
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Bulk Add State
  const [bulkText, setBulkText] = useState<string>('');
  const [parsedBulkTransactions, setParsedBulkTransactions] = useState<BulkParsedTransaction[]>([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  // AI Text Input State
  const [aiText, setAiText] = useState<string>('');
  const [parsedAITransactions, setParsedAITransactions] = useState<ParsedAITransaction[]>([]);
  const [aiReviewTransactions, setAiReviewTransactions] = useState<TransactionInput[]>([]);
  const [isProcessingAIText, setIsProcessingAIText] = useState(false);
  const [aiProcessingError, setAiProcessingError] = useState<string | null>(null);

  // AI Receipt Input State
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [parsedReceiptTransaction, setParsedReceiptTransaction] = useState<ParsedReceiptTransaction | null>(null);
  const [aiReceiptReviewTransaction, setAiReceiptReviewTransaction] = useState<TransactionInput | null>(null);
  const [isProcessingAIReceipt, setIsProcessingAIReceipt] = useState(false);
  const [aiReceiptError, setAiReceiptError] = useState<string | null>(null);


  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingDropdowns, setIsFetchingDropdowns] = useState(true);


  const fetchDropdownData = useCallback(async () => {
    setIsFetchingDropdowns(true);
    try {
      const [fetchedAllCategories, fetchedPaymentMethods] = await Promise.all([
        getCategories(),
        getPaymentMethods()
      ]);

      setAllCategories(fetchedAllCategories);
      setExpenseCategories(fetchedAllCategories.filter(c => c.type === 'expense'));
      setIncomeCategories(fetchedAllCategories.filter(c => c.type === 'income'));
      setPaymentMethods(fetchedPaymentMethods);

      if (!initialTransactionData && activeTab === 'single') {
        const currentTypeCategories = type === 'expense' ? fetchedAllCategories.filter(c => c.type === 'expense') : fetchedAllCategories.filter(c => c.type === 'income');
        setSelectedCategoryId(currentTypeCategories.length > 0 ? currentTypeCategories[0].id : undefined);
        setSelectedPaymentMethodId(type === 'expense' && fetchedPaymentMethods.length > 0 ? fetchedPaymentMethods[0].id : undefined);
      }
    } catch (error) {
      console.error("Failed to fetch dropdown data:", error);
      toast({ title: "Error Loading Options", description: "Could not load categories or payment methods. Please refresh or try again later.", variant: "destructive" });
    } finally {
      setIsFetchingDropdowns(false);
    }
  }, [toast, initialTransactionData, activeTab, type]);


  useEffect(() => {
    setIsClient(true);
    fetchDropdownData();
  }, [fetchDropdownData]);


  useEffect(() => {
    if (initialTransactionData) {
      setActiveTab('single');
      setFormId(initialTransactionData.id);
      setType(initialTransactionData.type as AppTransactionTypeEnum);
      setDate(new Date(initialTransactionData.date));
      setAmount(initialTransactionData.amount.toString());
      setDescription(initialTransactionData.description || '');
      if (initialTransactionData.type === 'expense') {
        setSelectedCategoryId(initialTransactionData.category?.id || undefined);
        setSelectedPaymentMethodId(initialTransactionData.paymentMethod?.id || undefined);
        setExpenseType(initialTransactionData.expenseType as AppExpenseTypeEnum || 'need');
        setSource(undefined);
      } else { // income
        setSelectedCategoryId(initialTransactionData.category?.id || undefined);
        setSource(initialTransactionData.source || '');
        setSelectedPaymentMethodId(undefined);
        setExpenseType(undefined);
      }
    } else {
      if (activeTab === 'single') {
        setFormId(null);
        setDate(new Date());
        setAmount('');
        setDescription('');

        if (type === 'expense') {
            setSelectedCategoryId(expenseCategories.length > 0 ? expenseCategories[0].id : undefined);
            setSelectedPaymentMethodId(paymentMethods.length > 0 ? paymentMethods[0].id : undefined);
            setExpenseType('need');
            setSource('');
        } else if (type === 'income') {
            setSelectedCategoryId(incomeCategories.length > 0 ? incomeCategories[0].id : undefined);
            setSelectedPaymentMethodId(undefined);
            setExpenseType(undefined);
             setSource('');
        }
      }
    }
  }, [initialTransactionData, expenseCategories, incomeCategories, paymentMethods, activeTab, type]);

  useEffect(() => {
    if (activeTab === 'single' && !initialTransactionData) {
        if (type === 'expense') {
            setSelectedCategoryId(expenseCategories.length > 0 ? expenseCategories[0].id : undefined);
            setSelectedPaymentMethodId(paymentMethods.length > 0 ? paymentMethods[0].id : undefined);
            setExpenseType('need');
            setSource('');
        } else if (type === 'income') {
            setSelectedCategoryId(incomeCategories.length > 0 ? incomeCategories[0].id : undefined);
            setSelectedPaymentMethodId(undefined);
            setExpenseType(undefined);
            setSource('');
        }
    }
  }, [type, activeTab, initialTransactionData, expenseCategories, incomeCategories, paymentMethods]);

  const resetSingleFormFields = () => {
    setDate(new Date());
    setAmount('');
    setDescription('');
    if (type === 'expense') {
        setSelectedCategoryId(expenseCategories.length > 0 ? expenseCategories[0].id : undefined);
        setSelectedPaymentMethodId(paymentMethods.length > 0 ? paymentMethods[0].id : undefined);
        setExpenseType('need');
        setSource('');
    } else {
        setSelectedCategoryId(incomeCategories.length > 0 ? incomeCategories[0].id : undefined);
        setSource('');
        setSelectedPaymentMethodId(undefined);
        setExpenseType(undefined);
    }
  };


  const handleSingleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const transactionPayload: Partial<TransactionInput> = {
      type: type as 'income' | 'expense',
      date,
      amount: parseFloat(amount),
      description: description || undefined,
    };
    if (type === 'expense') {
      transactionPayload.categoryId = selectedCategoryId;
      transactionPayload.paymentMethodId = selectedPaymentMethodId;
      transactionPayload.expenseType = expenseType;
    } else { // income
      transactionPayload.categoryId = selectedCategoryId;
      transactionPayload.source = source;
    }

    const validation = TransactionInputSchema.safeParse(transactionPayload);

    if (!validation.success) {
      const errorMessages = validation.error.flatten().fieldErrors;
      const readableErrors = Object.entries(errorMessages)
        .map(([field, messages]) => `${field}: ${messages?.join(', ')}`)
        .join('; ');
      toast({
        title: "Validation Error!",
        description: readableErrors || "Please check the form fields.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }


    try {
      if (formId) {
        await updateTransaction(formId, validation.data);
        toast({ title: "Transaction Updated!", description: "Your transaction has been successfully modified." });
      } else {
        await addTransaction(validation.data);
        toast({ title: "Transaction Added!", description: "New transaction recorded successfully." });
      }

      onTransactionAdded?.();

      if (!initialTransactionData) {
        resetSingleFormFields();
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

 const handleProcessBulk = () => {
    setIsProcessingBulk(true);
    const lines = bulkText.trim().split('\n');
    const parsed: BulkParsedTransaction[] = lines.map((line, index) => {
      const values = line.split('\t');
      const errors: string[] = [];

      if (values.length < 7) {
        errors.push("Row has fewer than 7 columns. Expected: Description, Category, Amount, Ignored Total, Date (DD/MM/YYYY), Expense Type, Payment Method.");
        return { originalRow: line, rowIndex: index, errors, type: 'expense' };
      }

      const desc = values[0] ? values[0].trim() : "";
      const catNameRaw = values[1];
      const catName = catNameRaw ? catNameRaw.trim() : undefined;

      const amountStrRaw = values[2];
      const amountStr = amountStrRaw ? amountStrRaw.trim() : undefined;
      
      const dateStrRaw = values[4];
      const dateStr = dateStrRaw ? dateStrRaw.trim() : undefined;

      const expTypeRaw = values[5];
      let expTypeStr: string | undefined = undefined;
      if (expTypeRaw && typeof expTypeRaw === 'string') {
        const trimmed = expTypeRaw.trim();
        if (trimmed) {
          expTypeStr = trimmed.toLowerCase();
        }
      }
      
      const pmNameRaw = values[6];
      const pmName = pmNameRaw ? pmNameRaw.trim() : undefined;

      let parsedDate: Date | undefined;
      try {
        if (dateStr) {
            parsedDate = parseDateFns(dateStr, 'dd/MM/yyyy', new Date());
            if (isNaN(parsedDate.getTime())) {
                parsedDate = undefined; // Ensure it's undefined if invalid
                throw new Error("Invalid date format. Use DD/MM/YYYY.");
            }
        } else { 
            errors.push("Date is missing or invalid."); 
            parsedDate = undefined;
        }
      } catch (e: any) { 
          errors.push(e.message); 
          parsedDate = undefined;
      }

      let amt: number | undefined;
      try {
          if (amountStr) {
            const cleanedAmountStr = amountStr.replace(/[₹,]/g, '');
            amt = parseFloat(cleanedAmountStr);
            if (isNaN(amt) || amt <= 0) {
                amt = undefined; // Ensure it's undefined if invalid
                throw new Error("Amount must be a positive number.");
            }
          } else { 
              errors.push("Amount is missing or invalid."); 
              amt = undefined;
          }
      } catch (e: any) { 
          errors.push(e.message); 
          amt = undefined;
      }

      if (!desc) errors.push("Description is missing.");
      if (!catName) errors.push("Category Name is missing.");
      
      const validExpenseTypes = ['need', 'want', 'investment_expense'];
      if (!expTypeStr) {
          errors.push("Expense Type is required.");
      } else if (!validExpenseTypes.includes(expTypeStr)) {
          errors.push(`Invalid Expense Type. Use 'Need', 'Want', or 'Investment'. Found: '${values[5] || "empty"}'`);
      }
      
      if (!pmName) errors.push("Payment Method Name is missing.");

      const result: BulkParsedTransaction = {
        date: parsedDate,
        description: desc,
        amount: amt,
        type: 'expense', 
        categoryName: catName,
        paymentMethodName: pmName,
        expenseType: expTypeStr as AppExpenseTypeEnum,
        originalRow: line,
        rowIndex: index,
      };

      result.errors = errors.length > 0 ? errors : undefined;
      return result;
    });
    setParsedBulkTransactions(parsed);
    setIsProcessingBulk(false);
    if (parsed.length > 0) {
        toast({ title: "Bulk Data Processed", description: `Review ${parsed.length} potential transactions below.` });
    } else {
        toast({ title: "No Data Processed", description: "The input area was empty or no lines were found.", variant: "destructive" });
    }
  };


  const handleSubmitBulk = async () => {
    setIsLoading(true);
    let successCount = 0;
    let errorCount = 0;
    const newParsedBulkTransactions = [...parsedBulkTransactions]; 

    const transactionsToSubmit: TransactionInput[] = [];
    for (const pt of newParsedBulkTransactions) {
        if (pt.errors && pt.errors.length > 0) {
            continue;
        }
        if (!pt.date || pt.amount === undefined || pt.type !== 'expense' || !pt.description || !pt.categoryName || !pt.paymentMethodName || !pt.expenseType) {
            pt.errors = [...(pt.errors || []), "Missing critical parsed information for submission."];
            errorCount++;
            continue;
        }

        const category = expenseCategories.find(c => c.name.toLowerCase() === pt.categoryName?.toLowerCase());
        const paymentMethod = paymentMethods.find(pm => pm.name.toLowerCase() === pt.paymentMethodName?.toLowerCase());

        if (!category) { pt.errors = [...(pt.errors || []), `Unknown category "${pt.categoryName}"`]; errorCount++; continue; }
        if (!paymentMethod) { pt.errors = [...(pt.errors || []), `Unknown payment method "${pt.paymentMethodName}"`]; errorCount++; continue; }

        const transactionInput: TransactionInput = {
            date: pt.date,
            amount: pt.amount,
            type: 'expense',
            description: pt.description,
            categoryId: category.id,
            paymentMethodId: paymentMethod.id,
            expenseType: pt.expenseType,
        };

        const validation = TransactionInputSchema.safeParse(transactionInput);
        if(!validation.success) {
            const readableErrors = Object.entries(validation.error.flatten().fieldErrors)
              .map(([field, messages]) => `${field}: ${messages?.join(', ')}`)
              .join('; ');
            pt.errors = [...(pt.errors || []), `Validation: ${readableErrors || "Invalid data."}`];
            errorCount++;
            continue;
        }
        transactionsToSubmit.push(validation.data);
    }

    setParsedBulkTransactions(newParsedBulkTransactions);

    if(transactionsToSubmit.length === 0 && errorCount > 0) {
        toast({ title: "Submission Failed", description: "No valid transactions to submit after review. Check errors in the table.", variant: "destructive" });
        setIsLoading(false);
        return;
    }
    if (transactionsToSubmit.length === 0 && errorCount === 0) {
        toast({ title: "Nothing to Submit", description: "No transactions were parsed or selected for submission.", variant: "default" });
        setIsLoading(false);
        return;
    }


    const results = await Promise.allSettled(transactionsToSubmit.map(tx => addTransaction(tx)));
    results.forEach((result, idx) => {
        const originalParsedTx = newParsedBulkTransactions.find(pt => 
            !pt.errors && 
            transactionsToSubmit[idx] && 
            pt.description === transactionsToSubmit[idx].description && 
            pt.amount === transactionsToSubmit[idx].amount
        );

        if (result.status === 'fulfilled') {
            successCount++;
        } else {
            errorCount++;
            console.error("Bulk addTransaction error:", result.reason);
            const errorMessage = result.reason instanceof Error ? result.reason.message : "Unknown save error";
            if (originalParsedTx) {
                originalParsedTx.errors = [...(originalParsedTx.errors || []), `Save Error: ${errorMessage}`];
            } else {
                toast({ title: "Save Error (Bulk)", description: `An item failed to save: ${errorMessage}`, variant: "destructive"});
            }
        }
    });
     setParsedBulkTransactions(newParsedBulkTransactions); 

    toast({
      title: "Bulk Submission Complete",
      description: `${successCount} transactions added successfully. ${errorCount > 0 ? `${errorCount} failed.` : ''}`,
    });

    if (successCount > 0) {
      onTransactionAdded?.();
    }
    setIsLoading(false);
  };

  const handleProcessAIText = async () => {
    if (!aiText.trim()) {
      toast({ title: "Input Required", description: "Please enter some text for the AI to process.", variant: "destructive"});
      return;
    }
    setIsProcessingAIText(true);
    setParsedAITransactions([]);
    setAiReviewTransactions([]);
    setAiProcessingError(null);
    try {
      const categoryNamesForAI = allCategories.map(c => ({id: c.id, name: c.name, type: c.type as 'income' | 'expense'}));
      const paymentMethodNamesForAI = paymentMethods.map(p => ({id: p.id, name: p.name }));

      const result = await parseTransactionsFromText({
        naturalLanguageText: aiText,
        categories: categoryNamesForAI,
        paymentMethods: paymentMethodNamesForAI,
      });
      
      if (result.summaryMessage && result.parsedTransactions.length === 0) {
        setAiProcessingError(result.summaryMessage);
        toast({ title: "AI Processing Note", description: result.summaryMessage, variant: "default" });
      } else if(result.parsedTransactions.length > 0){
        setParsedAITransactions(result.parsedTransactions);
        toast({ title: "AI Processing Complete", description: `Found ${result.parsedTransactions.length} potential transactions. Please review.` });
      } else {
        setAiProcessingError(result.summaryMessage || "The AI could not identify any clear transactions in the text.");
        toast({ title: "AI Processing Complete", description: result.summaryMessage || "The AI could not identify any clear transactions in the text." });
      }

    } catch (error: any) {
      console.error("AI text processing error in component:", error);
      const message = error.message || "Failed to process text with AI due to an unexpected error.";
      setAiProcessingError(message);
      toast({ title: "AI Error", description: message, variant: "destructive" });
    } finally {
      setIsProcessingAIText(false);
    }
  };

  const handleAIReviewChange = (index: number, field: keyof TransactionInput, value: any) => {
    const updated = [...aiReviewTransactions];
    if (!updated[index]) updated[index] = {} as TransactionInput; 
    
    const currentItem = { ...updated[index] };

    if (field === 'type') {
        currentItem.type = value as AppTransactionTypeEnum;
        if (value === 'income') {
            currentItem.paymentMethodId = undefined;
            currentItem.expenseType = undefined;
            const incomeCat = incomeCategories.find(c => c.name.toLowerCase() === parsedAITransactions[index]?.categoryNameGuess?.toLowerCase()) || (incomeCategories.length > 0 ? incomeCategories[0] : undefined);
            currentItem.categoryId = incomeCat?.id;
        } else { 
            currentItem.source = undefined;
            const expenseCat = expenseCategories.find(c => c.name.toLowerCase() === parsedAITransactions[index]?.categoryNameGuess?.toLowerCase()) || (expenseCategories.length > 0 ? expenseCategories[0] : undefined);
            currentItem.categoryId = expenseCat?.id;

            const pm = paymentMethods.find(p => p.name.toLowerCase() === parsedAITransactions[index]?.paymentMethodNameGuess?.toLowerCase()) || (paymentMethods.length > 0 ? paymentMethods[0] : undefined);
            currentItem.paymentMethodId = pm?.id;
            currentItem.expenseType = (parsedAITransactions[index]?.expenseTypeNameGuess as AppExpenseTypeEnum) || 'need';
        }
    } else if (field === 'date' && value instanceof Date) {
      currentItem.date = value;
    } else {
       (currentItem as any)[field] = value;
    }
    updated[index] = currentItem;
    setAiReviewTransactions(updated);
  };

  useEffect(() => {
    if (parsedAITransactions.length > 0) {
      const initialReviewItems: TransactionInput[] = parsedAITransactions.map(aiTx => {
        let catId, pmId;
        let transactionDate = new Date(); 
        try {
            if(aiTx.date) { 
                const parsed = parseDateFns(aiTx.date, 'yyyy-MM-dd', new Date());
                if(!isNaN(parsed.getTime())) transactionDate = parsed;
            }
        } catch (e) { console.warn("AI returned invalid date string:", aiTx.date); }


        if (aiTx.type === 'expense') {
          catId = expenseCategories.find(c => c.name.toLowerCase() === aiTx.categoryNameGuess?.toLowerCase())?.id;
          pmId = paymentMethods.find(p => p.name.toLowerCase() === aiTx.paymentMethodNameGuess?.toLowerCase())?.id;
        } else { 
          catId = incomeCategories.find(c => c.name.toLowerCase() === aiTx.categoryNameGuess?.toLowerCase())?.id;
        }

        return {
          date: transactionDate, 
          description: aiTx.description || "AI Parsed Transaction",
          amount: aiTx.amount || 0,
          type: aiTx.type || 'expense',
          categoryId: catId, 
          paymentMethodId: aiTx.type === 'expense' ? pmId : undefined, 
          expenseType: aiTx.type === 'expense' ? ((aiTx.expenseTypeNameGuess as AppExpenseTypeEnum) || 'need') : undefined,
          source: aiTx.type === 'income' ? (aiTx.sourceGuess || '') : undefined,
        };
      }).filter(tx => tx.amount && tx.amount > 0 && tx.description); 
      setAiReviewTransactions(initialReviewItems);
    } else {
      setAiReviewTransactions([]);
    }
  }, [parsedAITransactions, expenseCategories, incomeCategories, paymentMethods]);

  const handleSubmitAIText = async () => {
    setIsLoading(true);
    let successCount = 0;
    let errorCount = 0;
    const submissionErrors: { description: string, error: string }[] = [];

    const transactionsToSubmit: TransactionInput[] = [];
    for(const [index, reviewItem] of aiReviewTransactions.entries()) {
        const validation = TransactionInputSchema.safeParse(reviewItem);
        if (validation.success) {
            transactionsToSubmit.push(validation.data);
        } else {
            errorCount++;
            const readableErrors = Object.entries(validation.error.flatten().fieldErrors)
                .map(([field, messages]) => `${field}: ${messages?.join(', ')}`)
                .join('; ');
            const itemDescription = reviewItem.description || `Item ${index + 1}`;
            const errorMsg = `Validation failed for "${itemDescription.substring(0,30)}...": ${readableErrors}`;
            submissionErrors.push({description: itemDescription, error: errorMsg});
            toast({title: "AI Review Item Invalid", description: errorMsg, variant: "destructive"});
        }
    }

    if (transactionsToSubmit.length === 0 && errorCount > 0) {
        toast({ title: "No Valid Transactions to Submit", description: "Please review and correct AI suggestions, ensuring all required fields are valid.", variant: "destructive"});
        setIsLoading(false);
        return;
    }
     if (transactionsToSubmit.length === 0 && errorCount === 0) {
        toast({ title: "Nothing to Submit", description: "No transactions were parsed or selected for submission.", variant: "default" });
        setIsLoading(false);
        return;
    }


    const results = await Promise.allSettled(transactionsToSubmit.map(tx => addTransaction(tx)));
    results.forEach((result, idx) => {
        const originalTxDescription = transactionsToSubmit[idx]?.description || `Transaction ${idx + 1}`;
        if (result.status === 'fulfilled') {
            successCount++;
        } else {
            errorCount++;
            const errorMessage = result.reason instanceof Error ? result.reason.message : "Unknown error saving transaction.";
            console.error(`AI submission error for "${originalTxDescription}":`, result.reason);
            submissionErrors.push({ description: originalTxDescription, error: `Failed to save: ${errorMessage}`});
            toast({ title: "Save Error", description: `Could not save transaction "${originalTxDescription.substring(0,30)}...": ${errorMessage}`, variant: "destructive" });
        }
    });

    if (submissionErrors.length > 0 && successCount < transactionsToSubmit.length) {
         toast({
            title: "Partial AI Submission",
            description: `${successCount} transactions added. ${errorCount} failed. Check individual error messages.`,
            variant: successCount > 0 ? "default" : "destructive",
        });
    } else if (successCount === transactionsToSubmit.length) {
        toast({
            title: "AI Submission Complete",
            description: `${successCount} transactions added successfully.`,
        });
    }


    if (successCount > 0) {
      onTransactionAdded?.();
      setAiText('');
      setParsedAITransactions([]);
      setAiReviewTransactions([]);
      setAiProcessingError(null);
    }
    setIsLoading(false);
  };

  const handleReceiptFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setParsedReceiptTransaction(null); 
      setAiReceiptReviewTransaction(null);
      setAiReceiptError(null);
    }
  };

  const handleProcessAIReceipt = async () => {
    if (!receiptFile) {
      toast({ title: "No Receipt File", description: "Please upload a receipt image first.", variant: "destructive" });
      return;
    }
    if (!receiptPreview) { 
        toast({ title: "File Error", description: "Could not read the receipt file for preview.", variant: "destructive"});
        return;
    }
    setIsProcessingAIReceipt(true);
    setParsedReceiptTransaction(null);
    setAiReceiptReviewTransaction(null);
    setAiReceiptError(null);

    try {
      const categoryNamesForAI = expenseCategories.map(c => ({ id: c.id, name: c.name, type: c.type as 'income' | 'expense'})); 
      const paymentMethodNamesForAI = paymentMethods.map(p => ({ id: p.id, name: p.name }));

      const result = await parseReceiptImage({
        receiptImageUri: receiptPreview, 
        categories: categoryNamesForAI,
        paymentMethods: paymentMethodNamesForAI,
      });
      
      if (result.parsedTransaction?.error && !result.parsedTransaction?.amount && !result.parsedTransaction?.description) {
          setAiReceiptError(result.parsedTransaction.error);
          toast({ title: "AI Receipt Scan Issue", description: result.parsedTransaction.error, variant: "default" });
      } else {
          setParsedReceiptTransaction(result.parsedTransaction);
          if (result.parsedTransaction && (result.parsedTransaction.amount || result.parsedTransaction.description)) { 
            let catId, pmId;
            let transactionDate = new Date();
            try {
                if(result.parsedTransaction.date) {
                    const parsed = parseDateFns(result.parsedTransaction.date, 'yyyy-MM-dd', new Date());
                    if(!isNaN(parsed.getTime())) transactionDate = parsed;
                }
            } catch (e) { console.warn("AI receipt returned invalid date string:", result.parsedTransaction.date); }

            catId = expenseCategories.find(c => c.name.toLowerCase() === result.parsedTransaction?.categoryNameGuess?.toLowerCase())?.id;
            pmId = paymentMethods.find(p => p.name.toLowerCase() === result.parsedTransaction?.paymentMethodNameGuess?.toLowerCase())?.id;

            setAiReceiptReviewTransaction({
              date: transactionDate,
              description: result.parsedTransaction.description || "Scanned Receipt",
              amount: result.parsedTransaction.amount || 0,
              type: 'expense', 
              categoryId: catId,
              paymentMethodId: pmId,
              expenseType: (result.parsedTransaction.expenseTypeNameGuess as AppExpenseTypeEnum) || 'need',
            });
            toast({ title: "AI Receipt Scan Complete", description: "Review the extracted details below." });
          } else {
            const errorMsg = result.parsedTransaction?.error || "AI could not extract sufficient details from the receipt.";
            setAiReceiptError(errorMsg);
            toast({ title: "AI Receipt Scan Issue", description: errorMsg, variant: "default" });
          }
      }
    } catch (error: any) {
      console.error("AI receipt processing error in component:", error);
      const message = error.message || "Failed to process receipt with AI.";
      setAiReceiptError(message);
      toast({ title: "AI Receipt Error", description: message, variant: "destructive" });
    } finally {
      setIsProcessingAIReceipt(false);
    }
  };

  const handleAIReceiptReviewChange = (field: keyof TransactionInput, value: any) => {
    setAiReceiptReviewTransaction(prev => {
      if (!prev) return null;
      const updated = { ...prev, [field]: value };
      if (field === 'date' && value instanceof Date) {
        updated.date = value;
      }
      return updated;
    });
  };

  const handleSubmitAIReceipt = async () => {
    if (!aiReceiptReviewTransaction) {
      toast({ title: "No Data", description: "No transaction data to submit.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    const validation = TransactionInputSchema.safeParse(aiReceiptReviewTransaction);
    if (!validation.success) {
      const readableErrors = Object.entries(validation.error.flatten().fieldErrors)
        .map(([field, messages]) => `${field}: ${messages?.join(', ')}`)
        .join('; ');
      toast({ title: "Validation Error", description: `Correct the details: ${readableErrors}`, variant: "destructive" });
      setIsLoading(false);
      return;
    }

    try {
      await addTransaction(validation.data);
      toast({ title: "Transaction Added!", description: "Receipt transaction recorded successfully." });
      onTransactionAdded?.();
      setReceiptFile(null);
      setReceiptPreview(null);
      setParsedReceiptTransaction(null);
      setAiReceiptReviewTransaction(null);
      setAiReceiptError(null);
    } catch (error: any) {
      console.error("AI receipt submission error:", error);
      toast({ title: "Submission Error", description: error.message || "Could not save transaction.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };


  const cardTitleText = initialTransactionData ? "Edit Transaction" : "Add New Transaction";
  const cardDescriptionText = initialTransactionData ? "Modify the details of this transaction." : "Log your income or expenses quickly using one of the methods below.";
  const submitButtonText = initialTransactionData ? "Update Transaction" : "Add Transaction";

  if (!isClient && !initialTransactionData && activeTab === 'single') {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }

  const FormWrapperComponent = initialTransactionData ? motion.div : Card;
  const formWrapperProps = initialTransactionData
    ? { variants: formCardVariants, initial: "hidden", animate: "visible" }
    : { className: cn("p-0 sm:p-0 bg-card") };

  const labelClasses = "text-foreground/90 dark:text-foreground/80";
  const inputClasses = "bg-background/70 dark:bg-input/20 border-border/70 dark:border-border/40 text-foreground placeholder:text-muted-foreground/70 focus:border-primary dark:focus:border-accent focus:ring-primary dark:focus:ring-accent";
  const popoverButtonClasses = cn("w-full justify-start text-left font-normal mt-1", inputClasses, !date && "text-muted-foreground/70");
  const popoverContentClasses = "w-auto p-0 bg-popover border-border text-popover-foreground";
  const calendarClasses = "[&_button]:text-popover-foreground [&_.rdp-button_span]:text-popover-foreground [&_.rdp-button:hover]:bg-accent/10 [&_.rdp-day_selected]:bg-primary [&_.rdp-day_selected]:text-primary-foreground";
  const selectTriggerClasses = cn("w-full mt-1", inputClasses);
  const selectContentClasses = "bg-popover border-border text-popover-foreground [&_.item]:focus:bg-accent/10";

  const renderSingleTransactionForm = () => (
    <form onSubmit={handleSingleSubmit} className="space-y-4 md:space-y-5">
      <div>
        <Label className={labelClasses}>Transaction Type</Label>
        <RadioGroup value={type} onValueChange={(value) => setType(value as 'income' | 'expense')} className="flex space-x-4 mt-1">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="income" id={`income-${formId || 'new'}`} className={cn("border-primary text-primary focus:ring-primary", type === 'income' ? "data-[state=checked]:border-green-600 data-[state=checked]:bg-green-500 data-[state=checked]:text-primary-foreground" : "")} />
            <Label htmlFor={`income-${formId || 'new'}`} className={cn("text-foreground", type === 'income' && "text-green-600 font-medium")}>Income</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="expense" id={`expense-${formId || 'new'}`} className={cn("border-primary text-primary focus:ring-primary", type === 'expense' ? "data-[state=checked]:border-red-600 data-[state=checked]:bg-red-500 data-[state=checked]:text-primary-foreground" : "")} />
            <Label htmlFor={`expense-${formId || 'new'}`} className={cn("text-foreground", type === 'expense' && "text-red-600 font-medium")}>Expense</Label>
          </div>
        </RadioGroup>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`date-${formId || 'new'}`} className={labelClasses}>Date of Transaction</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={"outline"} className={popoverButtonClasses} disabled={isFetchingDropdowns}>
                <CalendarIcon className="mr-2 h-4 w-4 text-accent" />
                {date ? format(date, "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className={popoverContentClasses}><Calendar mode="single" selected={date} onSelect={setDate} initialFocus className={calendarClasses} /></PopoverContent>
          </Popover>
        </div>
        <div>
          <Label htmlFor={`amount-${formId || 'new'}`} className={labelClasses}>Amount (₹)</Label>
          <Input id={`amount-${formId || 'new'}`} type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className={cn("mt-1", inputClasses)} required disabled={isFetchingDropdowns} />
        </div>
      </div>
      <div>
        <Label htmlFor={`description-${formId || 'new'}`} className={labelClasses}>Description</Label>
        <Input id={`description-${formId || 'new'}`} placeholder={type === 'expense' ? "e.g., Groceries, Dinner out" : "e.g., July Salary"} value={description} onChange={(e) => setDescription(e.target.value)} className={cn("mt-1", inputClasses)} disabled={isFetchingDropdowns} />
      </div>
      {type === 'expense' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor={`category-${formId || 'new'}`} className={labelClasses}>Category</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId} disabled={isFetchingDropdowns || expenseCategories.length === 0}>
                <SelectTrigger id={`category-${formId || 'new'}`} className={selectTriggerClasses}><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent className={selectContentClasses}>{expenseCategories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`paymentMethod-${formId || 'new'}`} className={labelClasses}>Payment Method</Label>
              <Select value={selectedPaymentMethodId} onValueChange={setSelectedPaymentMethodId} disabled={isFetchingDropdowns || paymentMethods.length === 0}>
                <SelectTrigger id={`paymentMethod-${formId || 'new'}`} className={selectTriggerClasses}><SelectValue placeholder="Select payment method" /></SelectTrigger>
                <SelectContent className={selectContentClasses}>{paymentMethods.map(pm => <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className={labelClasses}>Expense Type</Label>
            <RadioGroup value={expenseType} onValueChange={(value) => setExpenseType(value as AppExpenseTypeEnum)} className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
              {[{ value: 'need', label: 'Need' }, { value: 'want', label: 'Want' }, { value: 'investment_expense', label: 'Investment' }].map(et => (
                <div key={et.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={et.value} id={`${et.value}-${formId || 'new'}`} className={cn("border-primary text-primary focus:ring-primary", expenseType === et.value && type === 'expense' ? "data-[state=checked]:border-red-600 data-[state=checked]:bg-red-500 data-[state=checked]:text-primary-foreground" : "data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground")} disabled={isFetchingDropdowns} />
                  <Label htmlFor={`${et.value}-${formId || 'new'}`} className={cn("text-foreground", expenseType === et.value && type === 'expense' ? "text-red-600 font-medium" : "text-foreground")}>{et.label}</Label>
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
            <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId} disabled={isFetchingDropdowns || incomeCategories.length === 0}>
              <SelectTrigger id={`income-category-${formId || 'new'}`} className={selectTriggerClasses}><SelectValue placeholder="Select income category" /></SelectTrigger>
              <SelectContent className={selectContentClasses}>{incomeCategories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`source-${formId || 'new'}`} className={labelClasses}>Source (Optional)</Label>
            <Input id={`source-${formId || 'new'}`} placeholder="e.g., Client Project X, Bonus Q2" value={source} onChange={(e) => setSource(e.target.value)} className={cn("mt-1", inputClasses)} disabled={isFetchingDropdowns} />
          </div>
        </div>
      )}
      {isFetchingDropdowns && (<div className="flex items-center justify-center space-x-2 text-muted-foreground py-2"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading options...</span></div>)}
      <div className="flex flex-col sm:flex-row gap-3 pt-3">
        <motion.div {...buttonHoverTap} className="w-full sm:flex-1">
           <Button type="submit" disabled={isLoading || isFetchingDropdowns} className={cn("w-full font-semibold text-white",
                isLoading ? "bg-muted hover:bg-muted text-muted-foreground" :
                type === 'income' ? "bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700" :
                                   "bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700")}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus className="mr-2 h-4 w-4" />}
            {isLoading ? (formId ? "Updating..." : "Adding...") : submitButtonText}
          </Button>
        </motion.div>
        {initialTransactionData && onCancel && (<motion.div {...buttonHoverTap} className="w-full sm:flex-1"><Button type="button" variant="outline" onClick={onCancel} disabled={isLoading || isFetchingDropdowns} className="w-full border-border text-foreground hover:bg-muted"><XCircle className="mr-2 h-4 w-4" />Cancel Edit</Button></motion.div>)}
      </div>
    </form>
  );

  const renderBulkPasteForm = () => (
    <div className="space-y-4">
      <Label htmlFor="bulk-input" className={labelClasses}>Paste Excel Data (Tab-separated: Description, Category, Amount, Ignored Total Amount, Date (DD/MM/YYYY), Expense Type, Payment Method)</Label>
      <Textarea
        id="bulk-input"
        value={bulkText}
        onChange={(e) => setBulkText(e.target.value)}
        placeholder="E.g.&#10;Rent	Rent	₹32,000.00	₹32,000.00	01/05/2025	Need	UPI (HDFC)&#10;Ice cream	Food and Dining	₹94.50	₹189.00	01/05/2025	Want	Credit Card YES 2106"
        rows={8}
        className={inputClasses}
        disabled={isProcessingBulk || isLoading}
      />
      <Button onClick={handleProcessBulk} disabled={isProcessingBulk || isLoading || !bulkText.trim()} className="w-full bg-primary text-primary-foreground" withMotion>
        {isProcessingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListChecks className="mr-2 h-4 w-4" />}
        Process Pasted Data
      </Button>
      {parsedBulkTransactions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-md font-semibold text-primary">Review Parsed Transactions ({parsedBulkTransactions.filter(t => !t.errors || t.errors.length ===0).length} valid)</h4>
           <Alert variant="default" className="text-sm border-primary/30 bg-background">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <AlertTitle className="text-primary">Review Carefully!</AlertTitle>
              <AlertDescription className="text-muted-foreground">
                Ensure categories and payment methods match exactly with your existing setup. Correct any errors before submitting. Invalid rows will be skipped. All transactions here are assumed to be expenses.
              </AlertDescription>
            </Alert>
          <ScrollArea className="h-[300px] border rounded-md p-2 bg-background/50">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Date</TableHead><TableHead>Desc</TableHead><TableHead>Amt</TableHead><TableHead>Cat</TableHead><TableHead>PM</TableHead><TableHead>ExpType</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {parsedBulkTransactions.map((pt, i) => (
                  <TableRow key={i} className={pt.errors && pt.errors.length > 0 ? "bg-destructive/10" : "hover:bg-accent/5"}>
                    <TableCell className="text-xs">{pt.rowIndex + 1}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {pt.date && pt.date instanceof Date && !isNaN(pt.date.getTime()) ? format(pt.date, 'dd/MM/yy') : 'N/A'}
                    </TableCell>
                    <TableCell className="text-xs max-w-[150px] sm:max-w-[200px] truncate" title={pt.description}>{pt.description || 'N/A'}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">₹{pt.amount?.toFixed(2) || 'N/A'}</TableCell>
                    <TableCell className="text-xs max-w-[100px] truncate" title={pt.categoryName}>{pt.categoryName}</TableCell>
                    <TableCell className="text-xs max-w-[100px] truncate" title={pt.paymentMethodName}>{pt.paymentMethodName}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{pt.expenseType}</TableCell>
                    <TableCell className="text-xs">{pt.errors && pt.errors.length > 0 ? <span className="text-red-500">{pt.errors.join(', ')}</span> : <span className="text-green-500">Valid</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </ScrollArea>
          <Button onClick={handleSubmitBulk} disabled={isLoading || parsedBulkTransactions.filter(t => !t.errors || t.errors.length === 0).length === 0} className="w-full bg-green-600 hover:bg-green-700 text-white" withMotion>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus className="mr-2 h-4 w-4" />}
            Submit Valid Transactions
          </Button>
        </div>
      )}
    </div>
  );

  const renderAITextInputForm = () => (
    <div className="space-y-4">
      <Label htmlFor="ai-text-input" className={labelClasses}>Enter Transactions in Natural Language</Label>
      <Textarea
        id="ai-text-input"
        value={aiText}
        onChange={(e) => setAiText(e.target.value)}
        placeholder="e.g., Dinner with friends ₹1200 using HDFC credit card yesterday. Received ₹50000 salary last Monday. Groceries for ₹2500 via UPI two days ago."
        rows={5}
        className={inputClasses}
        disabled={isProcessingAIText || isLoading}
      />
      <Button onClick={handleProcessAIText} disabled={isProcessingAIText || isLoading || !aiText.trim()} className="w-full bg-primary text-primary-foreground" withMotion>
        {isProcessingAIText ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
        Process with AI
      </Button>

      {isProcessingAIText && (
         <div className="space-y-2 pt-4">
            <Skeleton className="h-8 w-full bg-muted/50" />
            <Skeleton className="h-8 w-full bg-muted/50" />
            <Skeleton className="h-8 w-3/4 bg-muted/50" />
            <p className="text-center text-muted-foreground text-sm">AI is thinking...</p>
        </div>
      )}
      {aiProcessingError && !isProcessingAIText && (
          <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>AI Processing Error</AlertTitle>
              <AlertDescription>{aiProcessingError}</AlertDescription>
          </Alert>
      )}

      {aiReviewTransactions.length > 0 && !isProcessingAIText && !aiProcessingError && (
        <div className="space-y-3">
          <h4 className="text-md font-semibold text-primary">Review AI Suggestions ({aiReviewTransactions.length} potential transactions)</h4>
           <Alert variant="destructive" className="text-sm">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>AI is not perfect!</AlertTitle>
              <AlertDescription>
                Carefully review each suggested transaction, especially dates, amounts, categories, and payment methods. Make corrections as needed before submitting.
              </AlertDescription>
            </Alert>
          <ScrollArea className="h-[400px] border rounded-md p-0 bg-background/50">
            <div className="space-y-4 p-3">
            {aiReviewTransactions.map((tx, index) => (
              <Card key={index} className="p-3 space-y-2 bg-card/80 shadow-sm border-border/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <Label className={cn(labelClasses, "text-xs")}>Date</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button variant={"outline"} size="sm" className={cn(popoverButtonClasses, "text-xs h-8 mt-0.5")} >
                            <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-accent" />
                            {tx.date ? format(new Date(tx.date), "PPP") : <span>Pick date</span>}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className={popoverContentClasses}><Calendar mode="single" selected={tx.date instanceof Date ? tx.date : new Date(tx.date)} onSelect={(d) => handleAIReviewChange(index, 'date', d)} initialFocus className={calendarClasses} /></PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label className={cn(labelClasses, "text-xs")}>Amount (₹)</Label>
                    <Input type="number" value={tx.amount?.toString() || ''} onChange={(e) => handleAIReviewChange(index, 'amount', parseFloat(e.target.value))} className={cn(inputClasses, "text-xs h-8 mt-0.5")} />
                  </div>
                </div>
                <div>
                  <Label className={cn(labelClasses, "text-xs")}>Description</Label>
                  <Input value={tx.description || ''} onChange={(e) => handleAIReviewChange(index, 'description', e.target.value)} className={cn(inputClasses, "text-xs h-8 mt-0.5")} />
                </div>
                 <div>
                    <Label className={cn(labelClasses, "text-xs")}>Type</Label>
                    <Select value={tx.type} onValueChange={(val) => handleAIReviewChange(index, 'type', val as AppTransactionTypeEnum)}>
                        <SelectTrigger className={cn(selectTriggerClasses, "text-xs h-8 mt-0.5")}><SelectValue /></SelectTrigger>
                        <SelectContent className={selectContentClasses}><SelectItem value="income">Income</SelectItem><SelectItem value="expense">Expense</SelectItem></SelectContent>
                    </Select>
                </div>

                {tx.type === 'expense' && (
                    <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                            <Label className={cn(labelClasses, "text-xs")}>Category</Label>
                            <Select value={tx.categoryId} onValueChange={(val) => handleAIReviewChange(index, 'categoryId', val)}>
                                <SelectTrigger className={cn(selectTriggerClasses, "text-xs h-8 mt-0.5")}><SelectValue placeholder="Category" /></SelectTrigger>
                                <SelectContent className={selectContentClasses}>{expenseCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className={cn(labelClasses, "text-xs")}>Payment Method</Label>
                            <Select value={tx.paymentMethodId} onValueChange={(val) => handleAIReviewChange(index, 'paymentMethodId', val)}>
                                <SelectTrigger className={cn(selectTriggerClasses, "text-xs h-8 mt-0.5")}><SelectValue placeholder="Payment Method" /></SelectTrigger>
                                <SelectContent className={selectContentClasses}>{paymentMethods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div>
                        <Label className={cn(labelClasses, "text-xs")}>Expense Type</Label>
                        <Select value={tx.expenseType} onValueChange={(val) => handleAIReviewChange(index, 'expenseType', val as AppExpenseTypeEnum)}>
                            <SelectTrigger className={cn(selectTriggerClasses, "text-xs h-8 mt-0.5")}><SelectValue placeholder="Expense Type" /></SelectTrigger>
                            <SelectContent className={selectContentClasses}>
                                <SelectItem value="need">Need</SelectItem><SelectItem value="want">Want</SelectItem><SelectItem value="investment_expense">Investment</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    </>
                )}
                {tx.type === 'income' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                            <Label className={cn(labelClasses, "text-xs")}>Category</Label>
                             <Select value={tx.categoryId} onValueChange={(val) => handleAIReviewChange(index, 'categoryId', val)}>
                                <SelectTrigger className={cn(selectTriggerClasses, "text-xs h-8 mt-0.5")}><SelectValue placeholder="Income Category" /></SelectTrigger>
                                <SelectContent className={selectContentClasses}>{incomeCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                         <div>
                            <Label className={cn(labelClasses, "text-xs")}>Source</Label>
                            <Input value={tx.source || ''} onChange={(e) => handleAIReviewChange(index, 'source', e.target.value)} className={cn(inputClasses, "text-xs h-8 mt-0.5")} />
                        </div>
                    </div>
                )}
                {parsedAITransactions[index]?.confidenceScore !== undefined && (
                    <p className="text-xs text-muted-foreground">AI Confidence: {(parsedAITransactions[index].confidenceScore! * 100).toFixed(0)}%</p>
                )}
                {parsedAITransactions[index]?.error && (
                    <p className="text-xs text-red-500">AI Note: {parsedAITransactions[index].error}</p>
                )}
              </Card>
            ))}
            </div>
          </ScrollArea>
          <Button onClick={handleSubmitAIText} disabled={isLoading || aiReviewTransactions.length === 0} className="w-full bg-green-600 hover:bg-green-700 text-white" withMotion>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus className="mr-2 h-4 w-4" />}
            Submit Reviewed Transactions
          </Button>
        </div>
      )}
    </div>
  );

  const renderAIReceiptForm = () => (
    <div className="space-y-4">
        <Label htmlFor="ai-receipt-input" className={labelClasses}>Upload Receipt Image</Label>
        <div className="flex flex-col sm:flex-row items-center gap-3">
            <Input
                id="ai-receipt-input"
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleReceiptFileChange}
                className={cn("block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20", inputClasses)}
                disabled={isProcessingAIReceipt || isLoading}
            />
             <Button onClick={handleProcessAIReceipt} disabled={isProcessingAIReceipt || isLoading || !receiptFile} className="bg-primary text-primary-foreground whitespace-nowrap w-full sm:w-auto" withMotion>
                {isProcessingAIReceipt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileImage className="mr-2 h-4 w-4" />}
                Scan with AI
            </Button>
        </div>

        {receiptPreview && (
            <div className="mt-2 border rounded-md p-2 bg-background/50 flex flex-col items-center">
                <p className="text-sm text-muted-foreground mb-1">Receipt Preview:</p>
                <Image src={receiptPreview} alt="Receipt preview" width={200} height={300} className="max-w-full max-h-[200px] sm:max-h-[250px] object-contain rounded-md border" data-ai-hint="receipt image" />
            </div>
        )}

        {isProcessingAIReceipt && (
            <div className="space-y-2 pt-4">
                <Skeleton className="h-8 w-full bg-muted/50" />
                <Skeleton className="h-8 w-full bg-muted/50" />
                <Skeleton className="h-8 w-3/4 bg-muted/50" />
                <p className="text-center text-muted-foreground text-sm">AI is scanning your receipt...</p>
            </div>
        )}

        {aiReceiptError && !isProcessingAIReceipt && (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>AI Receipt Processing Error</AlertTitle>
                <AlertDescription>{aiReceiptError}</AlertDescription>
            </Alert>
        )}

        {aiReceiptReviewTransaction && !isProcessingAIReceipt && !aiReceiptError && (
            <div className="space-y-3 pt-3">
                <h4 className="text-md font-semibold text-primary">Review AI Receipt Suggestion</h4>
                <Alert variant="destructive" className="text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>AI is not perfect!</AlertTitle>
                    <AlertDescription>
                        Carefully review the extracted details, especially the date, amount, and category. Make corrections as needed.
                    </AlertDescription>
                </Alert>
                <Card className="p-3 space-y-2 bg-card/80 shadow-sm border-border/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div>
                            <Label className={cn(labelClasses, "text-xs")}>Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                <Button variant={"outline"} size="sm" className={cn(popoverButtonClasses, "text-xs h-8 mt-0.5")} >
                                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-accent" />
                                    {aiReceiptReviewTransaction.date ? format(new Date(aiReceiptReviewTransaction.date), "PPP") : <span>Pick date</span>}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className={popoverContentClasses}><Calendar mode="single" selected={aiReceiptReviewTransaction.date instanceof Date ? aiReceiptReviewTransaction.date : new Date(aiReceiptReviewTransaction.date)} onSelect={(d) => handleAIReceiptReviewChange('date', d)} initialFocus className={calendarClasses} /></PopoverContent>
                            </Popover>
                        </div>
                        <div>
                            <Label className={cn(labelClasses, "text-xs")}>Amount (₹)</Label>
                            <Input type="number" value={aiReceiptReviewTransaction.amount?.toString() || ''} onChange={(e) => handleAIReceiptReviewChange('amount', parseFloat(e.target.value))} className={cn(inputClasses, "text-xs h-8 mt-0.5")} />
                        </div>
                    </div>
                    <div>
                        <Label className={cn(labelClasses, "text-xs")}>Description (Merchant)</Label>
                        <Input value={aiReceiptReviewTransaction.description || ''} onChange={(e) => handleAIReceiptReviewChange('description', e.target.value)} className={cn(inputClasses, "text-xs h-8 mt-0.5")} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                            <Label className={cn(labelClasses, "text-xs")}>Category</Label>
                            <Select value={aiReceiptReviewTransaction.categoryId} onValueChange={(val) => handleAIReceiptReviewChange('categoryId', val)}>
                                <SelectTrigger className={cn(selectTriggerClasses, "text-xs h-8 mt-0.5")}><SelectValue placeholder="Category" /></SelectTrigger>
                                <SelectContent className={selectContentClasses}>{expenseCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className={cn(labelClasses, "text-xs")}>Payment Method</Label>
                            <Select value={aiReceiptReviewTransaction.paymentMethodId} onValueChange={(val) => handleAIReceiptReviewChange('paymentMethodId', val)}>
                                <SelectTrigger className={cn(selectTriggerClasses, "text-xs h-8 mt-0.5")}><SelectValue placeholder="Payment Method" /></SelectTrigger>
                                <SelectContent className={selectContentClasses}>{paymentMethods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                     <div>
                        <Label className={cn(labelClasses, "text-xs")}>Expense Type</Label>
                        <Select value={aiReceiptReviewTransaction.expenseType} onValueChange={(val) => handleAIReceiptReviewChange('expenseType', val as AppExpenseTypeEnum)}>
                            <SelectTrigger className={cn(selectTriggerClasses, "text-xs h-8 mt-0.5")}><SelectValue placeholder="Expense Type" /></SelectTrigger>
                            <SelectContent className={selectContentClasses}>
                                <SelectItem value="need">Need</SelectItem><SelectItem value="want">Want</SelectItem><SelectItem value="investment_expense">Investment</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {parsedReceiptTransaction?.confidenceScore !== undefined && (
                        <p className="text-xs text-muted-foreground">AI Confidence: {(parsedReceiptTransaction.confidenceScore * 100).toFixed(0)}%</p>
                    )}
                    {parsedReceiptTransaction?.error && ( 
                        <p className="text-xs text-red-500">AI Note: {parsedReceiptTransaction.error}</p>
                    )}
                </Card>
                 <Button onClick={handleSubmitAIReceipt} disabled={isLoading || !aiReceiptReviewTransaction || !aiReceiptReviewTransaction.amount} className="w-full bg-green-600 hover:bg-green-700 text-white" withMotion>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus className="mr-2 h-4 w-4" />}
                    Submit Reviewed Receipt Transaction
                </Button>
            </div>
        )}
    </div>
  );


  return (
    <FormWrapperComponent {...formWrapperProps}>
      {!initialTransactionData && (
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl text-primary">
            <Paperclip className="h-5 w-5 sm:h-6 sm:w-6 text-accent" /> {cardTitleText}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm text-muted-foreground">{cardDescriptionText}</CardDescription>
        </CardHeader>
      )}
      <CardContent className={cn(initialTransactionData ? 'p-4 sm:p-6' : 'p-4 sm:p-6 pt-2 sm:pt-4', "bg-card rounded-b-xl")}>
        {initialTransactionData ? (
            renderSingleTransactionForm()
        ) : (
            <Tabs defaultValue="ai_text" value={activeTab} onValueChange={(value) => setActiveTab(value as 'single' | 'bulk' | 'ai_text' | 'ai_receipt')} className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-4 h-auto flex-wrap md:h-10">
                    <TabsTrigger value="ai_text" className="text-xs sm:text-sm">AI Text Input</TabsTrigger>
                    <TabsTrigger value="ai_receipt" className="text-xs sm:text-sm">AI Receipt Scan</TabsTrigger>
                    <TabsTrigger value="single" className="text-xs sm:text-sm">Single Entry</TabsTrigger>
                    <TabsTrigger value="bulk" className="text-xs sm:text-sm">Bulk Paste</TabsTrigger>
                </TabsList>
                <TabsContent value="single">
                    {renderSingleTransactionForm()}
                </TabsContent>
                <TabsContent value="bulk">
                    {renderBulkPasteForm()}
                </TabsContent>
                <TabsContent value="ai_text">
                    {renderAITextInputForm()}
                </TabsContent>
                 <TabsContent value="ai_receipt">
                    {renderAIReceiptForm()}
                </TabsContent>
            </Tabs>
        )}
      </CardContent>
    </FormWrapperComponent>
  );
}

