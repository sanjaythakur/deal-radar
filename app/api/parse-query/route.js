import { NextResponse } from 'next/server';
import { parseQuery } from '../../../lib/llm.js';
import { handleError } from '../../../lib/server/errors.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const filters = await parseQuery(body?.query || '');
    return NextResponse.json(filters);
  } catch (e) {
    return handleError(e);
  }
}
