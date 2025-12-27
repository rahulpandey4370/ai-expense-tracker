
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

// This is the single, global genkit instance for defining flows, prompts, etc.
export const ai = genkit({
  plugins: [googleAI()],
});
