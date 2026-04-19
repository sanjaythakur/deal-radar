import { NextResponse } from 'next/server';
import { createCampaign, listCampaigns } from '../../../lib/campaigns.js';
import { handleError } from '../../../lib/server/errors.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await listCampaigns();
    return NextResponse.json(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const created = await createCampaign({ id: body?.id, name: body?.name });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
