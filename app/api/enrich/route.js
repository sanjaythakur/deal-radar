import { NextResponse } from 'next/server';
import { runEnrich } from '../../../lib/pipeline.js';
import { handleError } from '../../../lib/server/errors.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const filters = body?.filters || {};
    const result = await runEnrich(filters);
    return NextResponse.json(result);
  } catch (e) {
    return handleError(e);
  }
}
