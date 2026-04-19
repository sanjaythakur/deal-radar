import { NextResponse } from 'next/server';
import { bulkStatus } from '../../../../../../lib/campaigns.js';
import { handleError } from '../../../../../../lib/server/errors.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const prospectIds = Array.isArray(body?.prospectIds) ? body.prospectIds : [];
    const status = body?.status;
    const result = await bulkStatus(id, prospectIds, status);
    return NextResponse.json(result);
  } catch (e) {
    return handleError(e);
  }
}
