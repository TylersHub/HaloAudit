/**
 * Upload routes - R2 signed URL generation
 */

import { Context } from 'hono';
import { Env } from '../types.js';
import { createUploadSchema } from '../lib/schema.js';
import { generateObjectKey } from '../lib/r2.js';
import { AppError, ValidationError } from '../lib/errors.js';

/**
 * POST /uploads/create
 * Generate signed R2 upload URL and create run record
 */
export async function createUpload(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json();
  
  // Validate input
  const parsed = createUploadSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.errors);
  }

  const { contentType, filename, tenantId } = parsed.data;

  // Generate unique run ID
  const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Generate R2 object key
  const r2Key = generateObjectKey(tenantId, runId, filename);

  // Create a direct upload endpoint URL
  const putUrl = `${c.req.url.split('/uploads')[0]}/uploads/direct/${runId}`;

  // Create run record in D1
  await c.env.DB.prepare(
    'INSERT INTO runs (id, tenant_id, status, r2_key) VALUES (?, ?, ?, ?)'
  )
    .bind(runId, tenantId, 'pending', r2Key)
    .run();

  // Create Durable Object instance for this run
  const doId = c.env.RUNROOM.idFromName(runId);
  const doStub = c.env.RUNROOM.get(doId);
  
  // Initialize the DO state
  await doStub.fetch('http://do/update', {
    method: 'POST',
    body: JSON.stringify({
      phase: 'uploading',
      percent: 0,
      message: 'Ready for upload',
    }),
  });

  return c.json({
    runId,
    r2PutUrl: putUrl,
    r2Key,
  }, 201);
}

/**
 * POST /uploads/direct/:runId
 * Direct file upload endpoint that stores files in R2
 */
export async function directUpload(c: Context<{ Bindings: Env }>): Promise<Response> {
  const runId = c.req.param('runId');
  
  try {
    // Get the file from the request body
    const fileData = await c.req.arrayBuffer();
    
    if (!fileData || fileData.byteLength === 0) {
      throw new AppError(400, 'INVALID_REQUEST', 'No file data provided');
    }
    
    // Get the run record to find the R2 key
    const run = await c.env.DB.prepare('SELECT r2_key FROM runs WHERE id = ?')
      .bind(runId)
      .first();
    
    if (!run) {
      throw new AppError(404, 'RUN_NOT_FOUND', 'Run not found');
    }
    
    const r2Key = run.r2_key as string;
    
    // Store the file in R2
    await c.env.R2_BUCKET.put(r2Key, fileData, {
      httpMetadata: {
        contentType: c.req.header('content-type') || 'application/octet-stream',
      },
    });
    
    // Update run status
    await c.env.DB.prepare('UPDATE runs SET status = ? WHERE id = ?')
      .bind('uploaded', runId)
      .run();
    
    return c.json({
      success: true,
      message: 'File uploaded successfully',
      runId,
      r2Key,
    });
    
  } catch (error) {
    console.error('Direct upload failed:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'UPLOAD_ERROR', 'Failed to upload file');
  }
}

