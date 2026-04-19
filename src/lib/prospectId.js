// Stable identifier for a prospect / lead.
//
// The app previously used `prospect.name`, which collides when two real
// prospects share a name. We prefer the LinkedIn profile URL (globally
// unique), then fall back to `name|company`, then `name`.
//
// The backend uses the same fallback chain in `backend/campaigns.py` so the
// frontend and backend always agree on a lead's id.

export function getProspectId(prospect) {
  if (!prospect) return '';
  if (prospect.profile_url) return prospect.profile_url;
  if (prospect.prospectId) return prospect.prospectId;
  if (prospect.name && prospect.company) return `${prospect.name}|${prospect.company}`;
  return prospect.name || '';
}
