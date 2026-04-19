import { NextResponse } from 'next/server';
import { updateLead } from '../../../../../../lib/campaigns.js';
import { handleError } from '../../../../../../lib/server/errors.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req, { params }) {
  try {
    const { id, prospectId } = await params;
    const body = await req.json().catch(() => ({}));
    const patch = {
      status: body?.status ?? null,
      notes: body?.notes ?? null,
    };
    const result = await updateLead(id, prospectId, patch);
    return NextResponse.json(result);
  } catch (e) {
    return handleError(e);
  }
}
