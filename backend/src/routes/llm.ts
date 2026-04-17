/**
 * AI Gateway proxy for LLM and embedding calls
 */

import { Context } from 'hono';
import { Env } from '../types.js';
import { aiGatewaySchema } from '../lib/schema.js';
import { AppError, ValidationError, ServerError, AuthError } from '../lib/errors.js';

function normalizeGeminiModel(model: string | undefined, fallback: string): string {
  const selected = (model || fallback).trim();
  return selected.startsWith('models/') ? selected : `models/${selected}`;
}

async function parseGoogleError(response: Response): Promise<never> {
  const rawText = await response.text();
  console.error('Google AI Studio error:', rawText);

  let retryAfter: number | undefined;
  let message = 'Google AI Studio request failed';

  try {
    const parsed = JSON.parse(rawText) as {
      error?: {
        code?: number;
        message?: string;
        details?: Array<{ '@type'?: string; retryDelay?: string }>;
      };
    };

    if (parsed.error?.message) {
      message = parsed.error.message;
    }

    const retryInfo = parsed.error?.details?.find(
      (detail) => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
    );
    if (retryInfo?.retryDelay) {
      const seconds = Number.parseInt(retryInfo.retryDelay, 10);
      if (Number.isFinite(seconds)) {
        retryAfter = seconds;
      }
    }
  } catch {
    // Fall back to the raw error text already logged above.
  }

  if (response.status === 429) {
    throw new AppError(429, 'GOOGLE_QUOTA_EXCEEDED', message, { retryAfter });
  }

  throw new AppError(response.status || 500, 'GOOGLE_AI_ERROR', message, { retryAfter });
}

/**
 * POST /llm/gateway
 * Forward LLM requests through Cloudflare AI Gateway to Google AI Studio
 * This route requires server-side auth (not for client use)
 */
export async function llmGateway(c: Context<{ Bindings: Env }>): Promise<Response> {
  // Verify server auth (simple shared secret for server-to-server calls)
  const authHeader = c.req.header('X-Server-Auth');
  if (!authHeader || authHeader !== c.env.JWT_SECRET) {
    throw new AuthError('Server authentication required');
  }

  const body = await c.req.json();

  // Handle Gemini API format (contents + generationConfig)
  if (body.contents && Array.isArray(body.contents) && body.generationConfig) {
    // This is a Gemini API request - call Google AI Studio directly
    try {
      console.log('LLM Gateway: Processing Gemini request');
      console.log('LLM Gateway: Google API Key exists:', !!c.env.GOOGLE_API_KEY);
      console.log('LLM Gateway: Google API Key value:', c.env.GOOGLE_API_KEY ? 'SET' : 'NOT SET');
      
      const apiKey = c.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.error('LLM Gateway: Google API key is not configured');
        throw new ServerError('Google API key not configured');
      }

      const model = normalizeGeminiModel(
        typeof body.model === 'string' ? body.model : undefined,
        'gemini-2.5-flash'
      );
      const { model: _ignoredModel, ...payload } = body;
      const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;
      console.log('LLM Gateway: Calling URL:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('LLM Gateway: Response status:', response.status);
      
      if (!response.ok) {
        await parseGoogleError(response);
      }

      const result = await response.json();
      console.log('LLM Gateway: Success, returning result');
      return c.json(result);
    } catch (error) {
      console.error('LLM gateway failed:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new ServerError('Failed to process LLM request');
    }
  }

  // Handle legacy format
  const parsed = aiGatewaySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.errors);
  }

  const { model, prompt, messages, temperature, maxTokens } = parsed.data;

  try {
    // Forward to AI Gateway
    const response = await fetch(c.env.AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        messages,
        temperature: temperature || 0.7,
        max_tokens: maxTokens || 1024,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('AI Gateway error:', error);
      throw new ServerError('AI Gateway request failed');
    }

    const result = await response.json();
    return c.json(result);
  } catch (error) {
    console.error('LLM gateway failed:', error);
    throw new ServerError('Failed to process LLM request');
  }
}

/**
 * POST /llm/embed
 * Generate embeddings through AI Gateway
 */
export async function llmEmbed(c: Context<{ Bindings: Env }>): Promise<Response> {
  // Verify server auth
  const authHeader = c.req.header('X-Server-Auth');
  if (!authHeader || authHeader !== c.env.JWT_SECRET) {
    throw new AuthError('Server authentication required');
  }

  const body = await c.req.json();

  // Handle Gemini API format (requests array)
  if (body.requests && Array.isArray(body.requests)) {
    // This is a Gemini embedding request - call Google AI Studio directly
    try {
      console.log('Embedding: Processing Gemini embedding request');
      console.log('Embedding: Google API Key exists:', !!c.env.GOOGLE_API_KEY);
      
      const apiKey = c.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.error('Embedding: Google API key is not configured');
        throw new ServerError('Google API key not configured');
      }
      
      // Convert requests to Google AI Studio format
      const googleRequests = body.requests.map(
        (req: { model?: string; content: unknown; outputDimensionality?: number }) => ({
          model: normalizeGeminiModel(req.model, 'gemini-embedding-001'),
          content: req.content,
          outputDimensionality: req.outputDimensionality ?? 768,
        })
      );
      
      const payload = {
        requests: googleRequests
      };
      
      console.log('Embedding: Calling Google AI Studio with payload:', JSON.stringify(payload));
      
      const embeddingModel = googleRequests[0]?.model || 'models/gemini-embedding-001';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${embeddingModel}:batchEmbedContents?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        await parseGoogleError(response);
      }

      const result = await response.json();
      return c.json(result);
    } catch (error) {
      console.error('Embedding failed:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new ServerError('Failed to generate embeddings');
    }
  }

  // Handle legacy format
  if (!body.texts || !Array.isArray(body.texts) || body.texts.length === 0) {
    throw new ValidationError('texts array is required');
  }

  try {
    // Forward to AI Gateway for embeddings
    const response = await fetch(`${c.env.AI_GATEWAY_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-embedding-001', // Google's embedding model
        input: body.texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Embedding error:', error);
      throw new ServerError('Embedding generation failed');
    }

    const result = await response.json();
    return c.json(result);
  } catch (error) {
    console.error('Embedding failed:', error);
    throw new ServerError('Failed to generate embeddings');
  }
}

