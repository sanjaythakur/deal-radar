// OpenAI wrappers for the four LLM-shaped pipeline steps.
//
// All calls use JSON mode + tight prompts so we can JSON.parse the response
// directly into the shapes the UI expects.

import OpenAI from 'openai';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

let _client = null;
function client() {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  _client = new OpenAI({ apiKey });
  return _client;
}

async function chatJson(system, user, { model } = {}) {
  const modelId = model || DEFAULT_MODEL;
  const resp = await client().chat.completions.create({
    model: modelId,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const content = resp.choices?.[0]?.message?.content || '{}';
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// 1. Parse natural-language query into structured ICP filters
// ---------------------------------------------------------------------------

const PARSE_SYSTEM = `You convert a sales user's natural-language prospect query
into a structured ICP filter object for a B2B search API. Always respond with
valid JSON. Only include fields that the user's query actually constrains.`;

const PARSE_USER_TEMPLATE = (query) => `Query: ${query}

The downstream search is Crustdata. Match its constraints exactly.

Respond with a JSON object with these keys (omit / leave empty if not implied):

- title_keyword: SINGLE regex/contains pattern for the role's *noun* (no
  seniority words). Pipes mean OR. Examples:
    "VP Revenue at hotels"      -> "Revenue"
    "Head of Marketing"          -> "Marketing"
    "Director of Pricing"        -> "Pricing|Yield"
    "VP of Sales or RevOps"      -> "Sales|Revenue Operations|RevOps"
  Keep it short and high-recall — broader is better.

- seniority_levels: array drawn ONLY from this Crustdata enum:
    ["CXO", "Vice President", "Director", "Owner / Partner",
     "Experienced Manager", "Strategic", "Senior",
     "Entry Level Manager", "Entry Level", "In Training"]
  Map intelligently. Examples: "VP" -> ["Vice President","Director","CXO"],
  "C-suite" -> ["CXO","Vice President"], "Director" -> ["Director","Vice President"].
  Default to ["Vice President","Director","CXO"] if unspecified but the role
  sounds senior.

- industries: array of 1-3 Crustdata industry labels. Use canonical LinkedIn
  industry names. Examples:
    hotels / hospitality       -> ["Hospitality"]
    fintech                    -> ["Financial Services"]
    SaaS / software            -> ["Software Development"]
    e-commerce / retail        -> ["Retail","Consumer Services"]

- countries_iso3: ISO-3 codes for any country / region. Examples:
    "Southeast Asia" -> ["THA","SGP","MYS","IDN","PHL","VNM"]
    "DACH"           -> ["DEU","AUT","CHE"]
    "US"             -> ["USA"]
  Empty array if no geo is implied.

- companies: array of specific company names if the user named any, else [].

- keywords: array of 1-5 short topical keywords (used for web-signal
  searches, not for filtering).

Return JSON only. No prose.`;

export async function parseQuery(query) {
  const data = await chatJson(PARSE_SYSTEM, PARSE_USER_TEMPLATE(query));
  return {
    title_keyword: data.title_keyword ?? '',
    seniority_levels: data.seniority_levels ?? [],
    industries: data.industries ?? [],
    keywords: data.keywords ?? [],
    companies: data.companies ?? [],
    countries_iso3: data.countries_iso3 ?? [],
    raw: query,
  };
}

// ---------------------------------------------------------------------------
// 2. Briefing — pain point + talking points from real signals
// ---------------------------------------------------------------------------

const BRIEFING_SYSTEM = `You are a senior B2B sales strategist preparing a 30-second
pre-call briefing. Be specific, evidence-based, and concise. Always reference
the supplied signals — never invent facts. Always respond with valid JSON.`;

const BRIEFING_USER_TEMPLATE = ({ name, title, company, location, query, signalsJson, recentPost }) => `Prospect: ${name}, ${title} at ${company} (${location})

Original ICP query:
"${query}"

Recent company signals (news, hiring, funding) — use these as evidence:
${signalsJson}

Recent web/post signal (may be empty):
${recentPost}

Respond with a JSON object:
{
  "painPoint": "1-2 sentences naming the *specific* pain implied by the signals",
  "talkingPoints": ["3 short bullets, each citing a concrete signal or angle"]
}

Return JSON only.`;

export async function generateBriefing(prospect, signals, query) {
  const signalsJson = JSON.stringify(signals, null, 2).slice(0, 3000);
  const data = await chatJson(
    BRIEFING_SYSTEM,
    BRIEFING_USER_TEMPLATE({
      name: prospect.name || '',
      title: prospect.title || '',
      company: prospect.company || '',
      location: prospect.location || '',
      query: query || '(no original query)',
      signalsJson,
      recentPost: prospect.recentPost || prospect.recent_post || '(none)',
    }),
  );
  return {
    painPoint: data.painPoint || '',
    talkingPoints: data.talkingPoints || [],
  };
}

// ---------------------------------------------------------------------------
// 3. Why-Now score
// ---------------------------------------------------------------------------

const SCORE_SYSTEM = `You are a strict B2B intent-scoring model. Given a prospect
and their signals, output a single integer Why-Now score from 0-100. Higher
means stronger active intent right now. Always respond with JSON.`;

const SCORE_USER_TEMPLATE = ({ name, title, company, signalsJson }) => `Prospect: ${name}, ${title} at ${company}.

Signals:
${signalsJson}

Scoring guide:
- 0-39 cold: no active signals.
- 40-69 warm: stale or indirect signals.
- 70-89 hot: a recent, on-topic signal (news, post, hiring) within the last ~60 days.
- 90-100 burning: prospect has *publicly* expressed the exact pain or is hiring for it now.

Return JSON: {"score": <int>}`;

export async function scoreProspect(prospect, signals) {
  const signalsJson = JSON.stringify(signals, null, 2).slice(0, 2000);
  const data = await chatJson(
    SCORE_SYSTEM,
    SCORE_USER_TEMPLATE({
      name: prospect.name || '',
      title: prospect.title || '',
      company: prospect.company || '',
      signalsJson,
    }),
  );
  let score = 0;
  const raw = data.score;
  if (typeof raw === 'number') score = Math.trunc(raw);
  else if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) score = Math.trunc(n);
  }
  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// 4. Outreach email
// ---------------------------------------------------------------------------

const OUTREACH_SYSTEM = `You are a senior B2B SDR known for warm, specific cold
emails that get replies. Style: human, direct, no jargon, no hype, no emojis.
Always respond with JSON.`;

const OUTREACH_USER_TEMPLATE = ({
  name,
  title,
  company,
  location,
  score,
  hook,
  companyNews,
  recentPost,
  painPoint,
  talkingPoints,
}) => `Write a cold email to this prospect.

Prospect: ${name}, ${title} at ${company} (${location})
Why-Now score: ${score}
Signal hook: ${hook}
Company news: ${companyNews}
Their recent post: ${recentPost}
Inferred pain point: ${painPoint}
Talking points (use 1-2):
${talkingPoints}

Constraints:
- Subject: <= 60 characters, references the actual signal or pain.
- Body: 80-130 words, plain text with newlines, opens by name, references the
  signal directly, ends with a soft 20-minute call ask.
- No "I hope this email finds you well" or other filler.
- Sign off as "Alex".

Return JSON: {"subject": "...", "body": "..."}`;

export async function generateOutreach(prospect) {
  const tps = prospect.talkingPoints || prospect.talking_points || [];
  const talkingPoints = tps.length ? tps.map((tp) => `- ${tp}`).join('\n') : '(none)';
  const data = await chatJson(
    OUTREACH_SYSTEM,
    OUTREACH_USER_TEMPLATE({
      name: prospect.name || '',
      title: prospect.title || '',
      company: prospect.company || '',
      location: prospect.location || '',
      score: prospect.score ?? 0,
      hook: prospect.hook || '',
      companyNews: prospect.companyNews || prospect.company_news || '',
      recentPost: prospect.recentPost || prospect.recent_post || '',
      painPoint: prospect.painPoint || prospect.pain_point || '',
      talkingPoints,
    }),
  );
  return {
    subject: String(data.subject || '').trim(),
    body: String(data.body || '').trim(),
  };
}
