import { AnchoredContextCompactor, LlmSummarizer, isCompactedEvent, type BaseContextCompactor, type BaseLlm, type Event } from '@google/adk';

/*
 * Auto-compacts a chat once it has 12 back-and-forths in the model's context:
 * everything except the last few exchanges is summarised by ADK's LlmSummarizer
 * into one compacted event. The full transcript stays saved for the user to
 * scroll; only what the model is sent gets shorter.
 */

const COMPACT_AFTER_EXCHANGES = 12;
const KEEP_RECENT_EXCHANGES = 4;

const SUMMARY_PROMPT =
  'Condense the start of this conversation between a user and their personal-finance assistant, so the chat can continue without it. ' +
  'Write a numbered list of the user\'s messages in the order they were sent, each followed by the key answer with its numbers and period. ' +
  'Then list any changes made, confirmed or cancelled, and anything left open. Plain text, under 250 words.';

type Ctx = Parameters<BaseContextCompactor['shouldCompact']>[0];

const isUserText = (e: Event) =>
  e.author === 'user' && (e.content?.parts ?? []).some(p => typeof p.text === 'string' && p.text.trim());

/** Events after the latest summary, the same view ADK builds the model's context from. */
function activeRawEvents(events: Event[]): Event[] {
  const latest = events.filter(isCompactedEvent).pop();
  return latest ? events.filter(e => !isCompactedEvent(e) && e.timestamp > latest.endTime) : events;
}

export class ExchangeCountCompactor implements BaseContextCompactor {
  private readonly summarizer: LlmSummarizer;
  constructor(llm: BaseLlm) {
    this.summarizer = new LlmSummarizer({ llm, prompt: SUMMARY_PROMPT });
  }

  shouldCompact(ctx: Ctx): boolean {
    // The question being asked now is already in the session, so >12 means 12 finished exchanges plus this one.
    return activeRawEvents(ctx.session.events).filter(isUserText).length > COMPACT_AFTER_EXCHANGES;
  }

  async compact(ctx: Ctx): Promise<void> {
    const raw = activeRawEvents(ctx.session.events);
    const userTurns = raw.map((e, i) => (isUserText(e) ? i : -1)).filter(i => i >= 0);
    const keepFrom = userTurns[userTurns.length - KEEP_RECENT_EXCHANGES];
    // ADK's anchored compactor does the summarise-and-splice; with a zero token
    // threshold it compacts exactly the events before the kept exchanges.
    await new AnchoredContextCompactor({
      tokenThreshold: 0,
      eventRetentionSize: raw.length - keepFrom,
      summarizer: this.summarizer,
    }).compact(ctx);
  }
}
