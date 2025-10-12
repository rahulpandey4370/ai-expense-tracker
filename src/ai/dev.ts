
import { config } from 'dotenv';
config();

import '@/ai/flows/spending-insights.ts';
import '@/ai/flows/comparative-expense-analysis.ts';
import '@/ai/flows/financial-chatbot-flow.ts';
import '@/ai_flows/parse-transactions-flow.ts';
import '@/ai_flows/parse-receipt-flow.ts';
import '@/ai_flows/goal-forecaster-flow.ts';
import '@/ai_flows/budgeting-assistant-flow.ts';
import '@/ai_flows/financial-health-check-flow.ts'; // Ensure this is imported

    