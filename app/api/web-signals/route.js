import { NextResponse } from 'next/server';
import { fetchWebSignals } from '../../../lib/pipeline.js';
import { handleError } from '../../../lib/server/errors.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const prospects = Array.isArray(body?.prospects) ? body.prospects : [];
    const result = await fetchWebSignals(prospects);
    return NextResponse.json(result);
  } catch (e) {
    return handleError(e);
  }
}
