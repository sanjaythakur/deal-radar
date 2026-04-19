// Error translation for route handlers. Mirrors the FastAPI shape so the
// existing client error parser in lib/client/scaffold.js keeps working:
//
//   detail?.detail?.crustdata || detail?.detail || JSON.stringify(detail)

import { NextResponse } from 'next/server';
import { CrustdataError } from '../crustdata.js';
import { HttpError } from '../campaigns.js';

export function jsonError(status, detail) {
  return NextResponse.json({ detail }, { status });
}

export function handleError(err) {
  if (err instanceof CrustdataError) {
    console.error('Crustdata error:', err.message);
    return jsonError(502, { crustdata: err.message, body: err.body });
  }
  if (err instanceof HttpError) {
    return jsonError(err.status, err.message);
  }
  console.error('Internal error:', err);
  const msg = err?.message || String(err) || 'internal error';
  return jsonError(500, msg);
}
