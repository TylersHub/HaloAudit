/**
 * WebSocket routes for real-time run updates
 */

import { Context } from 'hono';
import { Env } from '../types.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

/**
 * GET /ws/run/:runId
 * Upgrade to WebSocket connection for run updates
 */
export async function wsRunConnection(c: Context<{ Bindings: Env }>): Promise<Response> {
  const runId = c.req.param('runId');
  if (!runId) {
    throw new ValidationError('runId is required');
  }

  // Verify run exists
  const run = await c.env.DB.prepare(
    'SELECT id FROM runs WHERE id = ?'
  )
    .bind(runId)
    .first();

  if (!run) {
    throw new NotFoundError('Run');
  }

  // Get Durable Object for this run
  const doId = c.env.RUNROOM.idFromName(runId);
  const doStub = c.env.RUNROOM.get(doId);

  // Forward WebSocket upgrade to the Durable Object
  return doStub.fetch('http://do/ws', c.req.raw);
}

