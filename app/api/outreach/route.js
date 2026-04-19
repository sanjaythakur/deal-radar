import { NextResponse } from 'next/server';
import { generateOutreach } from '../../../lib/llm.js';
import { handleError } from '../../../lib/server/errors.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const prospect = body?.prospect || {};
    const result = await generateOutreach(prospect);
    return NextResponse.json(result);
  } catch (e) {
    return handleError(e);
  }
}
