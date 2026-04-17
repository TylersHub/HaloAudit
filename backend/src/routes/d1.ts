/**
 * D1 database proxy with whitelisted queries
 */

import { Context } from 'hono';
import { Env } from '../types.js';
import { d1QuerySchema } from '../lib/schema.js';
import { ValidationError, ServerError } from '../lib/errors.js';

/**
 * Whitelisted query definitions
 */
const QUERIES = {
  insert_run: {
    sql: 'INSERT INTO runs (id, tenant_id, status, r2_key) VALUES (?, ?, ?, ?)',
    paramCount: 4,
  },
  update_status: {
    sql: 'UPDATE runs SET status = ? WHERE id = ?',
    paramCount: 2,
  },
  insert_finding: {
    sql: 'INSERT INTO findings (id, run_id, code, severity, title, detail, evidence_r2_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
    paramCount: 7,
  },
  get_run: {
    sql: 'SELECT * FROM runs WHERE id = ?',
    paramCount: 1,
  },
  get_findings: {
    sql: 'SELECT * FROM findings WHERE run_id = ? ORDER BY created_at DESC',
    paramCount: 1,
  },
  insert_event: {
    sql: 'INSERT INTO events (id, run_id, level, message, data) VALUES (?, ?, ?, ?, ?)',
    paramCount: 5,
  },
};

function mapEventToProgress(message: string, level: string): { phase: string; percent: number; message: string } | null {
  if (level === 'error') {
    return {
      phase: 'error',
      percent: 100,
      message,
    };
  }

  const progressMap: Record<string, { phase: string; percent: number }> = {
    'Downloading file from R2': { phase: 'ingest', percent: 15 },
    'Extracting text with Gemini AI': { phase: 'extract', percent: 30 },
    'Chunking text': { phase: 'chunk', percent: 45 },
    'Generating embeddings': { phase: 'embed', percent: 60 },
    'Indexing vectors': { phase: 'index', percent: 72 },
    'Running audit checks': { phase: 'checks', percent: 82 },
    'Analyzing with Gemini AI': { phase: 'analyze', percent: 90 },
    'Generating report': { phase: 'report', percent: 96 },
    'Saving results to database': { phase: 'persist', percent: 98 },
  };

  const mapped = progressMap[message];
  if (!mapped) {
    return null;
  }

  return {
    ...mapped,
    message,
  };
}

/**
 * POST /d1/query
 * Execute whitelisted parameterized query
 */
export async function d1Query(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json();

  // Validate input
  const parsed = d1QuerySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.errors);
  }

  const { name, params } = parsed.data;

  // Get whitelisted query
  const query = QUERIES[name];
  if (!query) {
    throw new ValidationError(`Query '${name}' is not whitelisted`);
  }

  // Validate parameter count
  if (params.length !== query.paramCount) {
    throw new ValidationError(
      `Query '${name}' expects ${query.paramCount} parameters, got ${params.length}`
    );
  }

  try {
    // Execute query
    const stmt = c.env.DB.prepare(query.sql);
    const result = await stmt.bind(...params).run();

    // Handle different query types
    if (name.startsWith('get_')) {
      // SELECT queries - return results
      const data = await stmt.bind(...params).all();
      return c.json({
        success: true,
        results: data.results,
        count: data.results?.length || 0,
      });
    } else {
      // INSERT/UPDATE queries - return metadata
      
      // Special handling for insert_event: check if it's the final event with report_key
      if (name === 'insert_event' && params.length >= 5) {
        const [eventId, runId, level, message, dataJson] = params;
        
        // Parse the data field to check for report_key
        try {
          const eventData = dataJson ? JSON.parse(dataJson as string) : {};
          const doId = c.env.RUNROOM.idFromName(runId as string);
          const doStub = c.env.RUNROOM.get(doId);

          const progressUpdate = mapEventToProgress(message as string, level as string);
          if (progressUpdate) {
            await doStub.fetch('http://do/update', {
              method: 'POST',
              body: JSON.stringify(progressUpdate),
            });
          }
          
          // If this is the final event with a report_key, update the DO with the report URL
          if (eventData.report_key && message === 'Audit complete') {
            await doStub.fetch('http://do/update', {
              method: 'POST',
              body: JSON.stringify({
                phase: 'done',
                percent: 100,
                message: 'Audit complete',
                reportKey: eventData.report_key,
                summary: eventData.summary || '',
                findingsCount: eventData.findings_count || 0,
              }),
            });
          }
        } catch (parseError) {
          // If parsing fails, just continue - don't fail the event insert
          console.warn('Failed to parse event data:', parseError);
        }
      }
      
      return c.json({
        success: result.success,
        meta: result.meta,
      });
    }
  } catch (error) {
    console.error('D1 query failed:', error);
    throw new ServerError('Database query failed');
  }
}

