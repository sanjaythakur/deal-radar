import { NextResponse } from 'next/server';
import { scoreProspect } from '../../../lib/llm.js';
import { handleError } from '../../../lib/server/errors.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const prospect = body?.prospect || {};
    const signals = body?.signals || {};
    const score = await scoreProspect(prospect, signals);
    return NextResponse.json({ score });
  } catch (e) {
    return handleError(e);
  }
}
