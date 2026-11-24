"use client";

import { FinancialChatbot } from '@/components/financial-chatbot';

export default function ChatbotPage() {
  // The chatbot fetches exactly the transaction scope each query needs on demand
  // (see FinancialChatbot), so this page no longer preloads the whole table.
  return (
    // Bound the height so the chatbot's internal ScrollArea scrolls. Phone: 3.5rem header + the space left for
    // the floating dock (--dock-clear) + the top safe area. Desktop: the sticky h-16 header only.
    <div className="flex flex-col h-[calc(100svh_-_3.5rem_-_var(--dock-clear)_-_env(safe-area-inset-top))] md:h-[calc(100svh-4rem)] overflow-hidden">
      <FinancialChatbot isPage={true} />
    </div>
  );
}
