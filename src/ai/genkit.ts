
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import type { AIModel } from '@/contexts/AIModelContext'; // Import AIModel type

// The default ai object can be removed or kept as a fallback.
// We are moving to a dynamic function based on model selection.
const defaultModel: AIModel = 'gemini-2.5-flash';

export const ai = (model: AIModel = defaultModel) => {
  return genkit({
    plugins: [googleAI()],
    model: `googleai/${model}`, // Use the passed model dynamically
  });
};
