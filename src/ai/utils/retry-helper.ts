
'use server';

/**
 * @fileOverview Utility for retrying Genkit AI operations on specific transient errors.
 */

/**
 * Retries an async AI generation function if it fails due to specific
 * transient errors like model overload (503).
 *
 * @param fn The async function to call (e.g., a Genkit prompt call or ai.generate).
 * @param retries The maximum number of additional retries (e.g., 2 means 1 initial try + 2 retries = 3 total attempts).
 * @param baseDelayMs The base delay in milliseconds between retries; this will increase for subsequent retries.
 * @returns The result of the successful function call.
 * @throws Throws the last error if all retries fail, or an unretryable error.
 */
export async function retryableAIGeneration<T>(
  fn: () => Promise<T>,
  retries = 2, // Total 3 attempts (1 initial + 2 retries)
  baseDelayMs = 1000
): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMessage = String(error?.message || '').toLowerCase();
      // Some SDKs might wrap HTTP errors, so check for status within nested properties if available.
      const status = error?.status || error?.cause?.status;

      if (errorMessage.includes('503') || errorMessage.includes('overloaded') || status === 503 || errorMessage.includes('service unavailable') || errorMessage.includes('model is overloaded')) {
        if (i < retries) {
          const delayMs = baseDelayMs * (i + 1); // Simple linear backoff
          console.warn(
            `AI model overloaded or unavailable. Retrying attempt ${i + 2
            } of ${retries + 1} in ${delayMs}ms... Error: ${error.message}`
          );
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          console.error(
            `AI model still overloaded or unavailable after ${retries + 1
            } attempts. Last error: ${error.message}`
          );
          // Fall through to throw lastError
        }
      } else {
        // Not a retryable error, re-throw immediately
        console.error('AI operation failed with a non-retryable error:', error.message);
        throw error;
      }
    }
  }
  // If all retries fail for a 503-like error
  console.error('AI operation failed after multiple retries due to model overload/unavailability:', lastError.message);
  throw lastError || new Error('AI operation failed after multiple retries due to model overload or unavailability.');
}
