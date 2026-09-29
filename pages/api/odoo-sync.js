// pages/api/odoo-sync.js
// POST { secret: 'sync2026' }  — bulk push all Redis leads to Odoo CRM
import { Redis } from '@upstash/redis';
import { odooAuth, odooCall, buildLeadVals } from '../../lib/odoo';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KEY = 'callsheet:data';

async function findOdooLead(phone, email, cookie) {
  const domain = [];
  if (phone) domain.push(['phone', '=', phone]);
  if (email) {
    if (domain.length) domain.push('|');
    domain.push(['email_from', '=', email]);
  }
  if (!domain.length) return null;
  // Odoo domain with OR: [['phone','=',p], '|', ['email_from','=',e]] — needs reorder
  const searchDomain = phone && email
    ? ['|', ['phone', '=', phone], ['email_from', '=', email]]
    : domain;
  const ids = await odooCall('crm.lead', 'search', [searchDomain], { limit: 1 }, cookie);
  return ids?.length ? ids[0] : null;
}

async function createOdooLead(lead, state, cookie) {
  const vals = buildLeadVals(lead, state);
  const id = await odooCall('crm.lead', 'create', [vals], {}, cookie);
  return id;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.body?.secret !== 'sync2026') return res.status(403).json({ error: 'Forbidden' });

  let data;
  try {
    const raw = await redis.get(KEY);
    data = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { leads: [], state: {} };
  } catch (e) {
    return res.status(500).json({ error: 'Redis read failed', detail: e.message });
  }

  // Authenticate ONCE — reuse cookie for all leads
  let cookie;
  try {
    const auth = await odooAuth();
    cookie = auth.cookie;
  } catch (e) {
    return res.status(500).json({ error: 'Odoo auth failed', detail: e.message });
  }

  const results = { pushed: 0, skipped: 0, errors: [] };

  for (const lead of data.leads) {
    try {
      const existing = await findOdooLead(lead.phone, lead.email, cookie);
      if (existing) { results.skipped++; continue; }
      const state = data.state[lead._key] || {};
      await createOdooLead(lead, state, cookie);
      results.pushed++;
    } catch (e) {
      results.errors.push({ key: lead._key, org: lead.org, error: e.message });
    }
  }

  return res.status(200).json(results);
}
