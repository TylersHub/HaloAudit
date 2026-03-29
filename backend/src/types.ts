/**
 * TypeScript types for Cloudflare Workers bindings
 */

import { RunRoom } from './do/RunRoom.js';

export interface Env {
  // R2 bucket binding
  R2_BUCKET: R2Bucket;

  // D1 database binding
  DB: D1Database;

  // Vectorize binding
  VEC: VectorizeIndex;

  // Durable Object binding
  RUNROOM: DurableObjectNamespace;

  // AI binding (optional, for future use)
  AI?: any;

  // Environment variables
  AI_GATEWAY_URL: string;

  // Secrets
  TURNSTILE_SECRET: string;
  JWT_SECRET: string;
  GOOGLE_API_KEY?: string;  // Optional, for direct Gemini API calls
}

export { RunRoom };

