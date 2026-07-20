"use client";

import { FinancialChatbot } from '@/components/financial-chatbot';

export default function ChatbotPage() {
  // The chatbot fetches exactly the transaction scope each query needs on demand
  // (see FinancialChatbot), so this page no longer preloads the whole table.
  return (
    // Header is sticky h-16 (4rem). Constrain this view so the chatbot's internal ScrollArea has a real bounded height.
    <div className="flex flex-col h-[calc(100svh-4rem)] overflow-hidden">
      <FinancialChatbot isPage={true} />
    </div>
  );
}
