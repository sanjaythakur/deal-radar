import { NextResponse } from 'next/server';
import { addLeads } from '../../../../../lib/campaigns.js';
import { handleError } from '../../../../../lib/server/errors.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const leads = Array.isArray(body?.leads) ? body.leads : [];
    const result = await addLeads(id, leads);
    return NextResponse.json(result);
  } catch (e) {
    return handleError(e);
  }
}
