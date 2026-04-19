// Postgres plumbing for the single `campaigns` table.
//
// Campaigns own a list of "leads" (each one is the full prospect payload the
// frontend already constructs in `adaptProspectToLead`). To avoid splitting
// that nested shape across multiple tables, we just store the leads list as a
// JSONB column on the campaign row.
//
// `init()` runs lazily on the first DB call and is cached for the lifetime of
// the Node process — we don't have a FastAPI-style boot lifecycle hook in
// Next.js route handlers.

import pg from 'pg';

const { Pool } = pg;

// Mirrors src/data/mockCampaigns.js — kept in sync intentionally.
export const SEED_CAMPAIGNS = [
  { id: 'camp_001', name: 'SEA Hotel Outreach Q2' },
  { id: 'camp_002', name: 'Corporate TMC AI Signal' },
  { id: 'camp_003', name: 'APAC Loyalty Partnerships' },
];

function resolveDatabaseUrl() {
  let url = (process.env.DATABASE_URL || '').trim();
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  // Strip the `+asyncpg` suffix that the FastAPI deployment injected, so the
  // existing compose env var keeps working unchanged.
  if (url.startsWith('postgresql+asyncpg://')) {
    url = 'postgres://' + url.slice('postgresql+asyncpg://'.length);
  } else if (url.startsWith('postgresql://')) {
    url = 'postgres://' + url.slice('postgresql://'.length);
  }
  return url;
}

let _pool = null;
function pool() {
  if (_pool) return _pool;
  _pool = new Pool({ connectionString: resolveDatabaseUrl() });
  return _pool;
}

let _initPromise = null;
async function ensureInit() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const p = pool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id          text PRIMARY KEY,
        name        text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        leads       jsonb NOT NULL DEFAULT '[]'::jsonb
      )
    `);
    // Seed only when the table is completely empty. Once a deployment has
    // any campaign (real or seeded), we never touch it again — users can
    // safely delete the seed campaigns.
    const { rows } = await p.query('SELECT 1 FROM campaigns LIMIT 1');
    if (rows.length === 0) {
      for (const seed of SEED_CAMPAIGNS) {
        await p.query(
          `INSERT INTO campaigns (id, name, leads) VALUES ($1, $2, '[]'::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [seed.id, seed.name],
        );
      }
      console.log('[db] seeded', SEED_CAMPAIGNS.length, 'initial campaigns');
    }
    console.log('[db] ready');
  })().catch((err) => {
    // Reset so we can retry on next request.
    _initPromise = null;
    throw err;
  });
  return _initPromise;
}

export async function query(text, params) {
  await ensureInit();
  return pool().query(text, params);
}
