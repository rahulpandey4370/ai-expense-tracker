
'use server';

import { AzureOpenAI } from 'openai';
import { z, ZodSchema } from 'zod';
import { ChatCompletionMessageParam } from 'openai/resources/chat';

// Configuration from Environment Variables
const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
const apiKey = process.env.AZURE_OPENAI_API_KEY!;
const apiVersion = "2024-02-01"; 
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME!;

if (!endpoint || !apiKey || !deployment) {
    console.error("Azure OpenAI environment variables (AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT_NAME) are not set.");
}


// Initialize the Azure-specific client
const client = new AzureOpenAI({
  endpoint,
  apiKey,
  apiVersion,
});

// Basic Handlebars-like replacer
function simpleTemplateRender(template: string, data: Record<string, any>): string {
    let output = template;

    // This will now just remove the media tag, as the URL is handled separately.
    output = output.replace(/{{media\s+url=([^}]+)}}/g, '');

    // Replace {{{json ...}}}
    output = output.replace(/{{{json\s+([^}]+)}}}/g, (match, key) => {
        const value = data[key.trim()];
        return JSON.stringify(value, null, 2);
    });

    // Replace {{...}}
    output = output.replace(/{{#each\s+([^}]+)}}([\s\S]*?){{\/each}}/g, (match, arrayKey, content) => {
        const array = data[arrayKey.trim()];
        if (!Array.isArray(array)) return '';
        return array.map(item => {
            return content.replace(/{{this\.([\w]+)}}/g, (m, prop) => item[prop] || '');
        }).join('');
    });

    // Replace {{{...}}} and {{...}}
    output = output.replace(/{{{\s*([\w.]+)\s*}}}/g, (match, key) => {
        const keys = key.trim().split('.');
        let current: any = data;
        for(const k of keys) {
            if(current && typeof current === 'object' && k in current) {
                current = current[k];
            } else {
                return ''; 
            }
        }
        return String(current);
    });
     output = output.replace(/{{([\w.]+)}}/g, (match, key) => {
        const keys = key.trim().split('.');
        let current: any = data;
        for (const k of keys) {
            if (current && typeof current === 'object' && k in current) {
                current = current[k];
            } else {
                return ''; // Return empty if path not found
            }
        }
        return String(current);
    });
    
    // Replace {{#if ...}} ... {{/if}}
    output = output.replace(/{{#if\s+([^}]+)}}([\s\S]*?){{\/if}}/g, (match, key, content) => {
        return data[key.trim()] ? content : '';
    });

    return output.trim();
}

/**
 * Structured Output Helper for Vision Models
 */
export async function callAzureOpenAI<T extends ZodSchema>(
  promptTemplate: string,
  input: z.infer<any>,
  outputSchema: T
): Promise<z.infer<T>> {
  
  const textPrompt = simpleTemplateRender(promptTemplate, input);
  
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: textPrompt },
      ],
    },
  ];

  // If there's an image URI, add it to the message content
  if (input.receiptImageUri && typeof messages[0].content === 'object') {
     (messages[0].content as any[]).push({
      type: 'image_url',
      image_url: {
        url: input.receiptImageUri,
      },
    });
  }

  try {
    const response = await client.chat.completions.create({
      model: deployment, 
      messages: messages,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Azure OpenAI returned an empty response.');
    }

    const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanedContent);
    return outputSchema.parse(parsed);
  } catch (error: any) {
    console.error("Error calling Azure OpenAI:", error);
    if (error instanceof z.ZodError) {
      throw new Error(`Azure OpenAI response failed Zod validation: ${error.message}`);
    }
    throw new Error(`Failed to get a valid response from Azure OpenAI: ${error.message}`);
  }
}

/**
 * Chat Style Helper
 */
export async function callAzureOpenAIChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: deployment,
      messages: messages,
    });
    return response.choices[0]?.message?.content || '';
  } catch (error: any) {
    console.error("Error calling Azure OpenAI Chat:", error);
    throw new Error(`Failed to get a valid chat response from Azure OpenAI: ${error.message}`);
  }
}
