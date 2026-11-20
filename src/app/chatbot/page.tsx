"use client";

import { FinancialChatbot } from '@/components/financial-chatbot';

export default function ChatbotPage() {
  // The chatbot fetches exactly the transaction scope each query needs on demand
  // (see FinancialChatbot), so this page no longer preloads the whole table.
  return (
    // Bound the height so the chatbot's internal ScrollArea scrolls. Phone: 3.5rem header + 4rem
    // bottom-nav padding + both safe areas. Desktop: the sticky h-16 header only.
    <div className="flex flex-col h-[calc(100svh_-_7.5rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] md:h-[calc(100svh-4rem)] overflow-hidden">
      <FinancialChatbot isPage={true} />
    </div>
  );
}
