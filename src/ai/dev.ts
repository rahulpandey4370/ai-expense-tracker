
import { config } from 'dotenv';
config();

import '@/ai/flows/spending-insights.ts';
import '@/ai/flows/comparative-expense-analysis.ts';
import '@/ai/flows/financial-chatbot-flow.ts';
import '@/ai/flows/parse-transactions-flow.ts';
import '@/ai/flows/parse-receipt-flow.ts'; // Ensure this is imported
    
