// pages/api/odoo-sync.js
// POST { secret: 'sync2026' }  — bulk push all Redis leads to Odoo CRM
import { Redis } from '@upstash/redis';
import { odooAuth, odooCall, buildLeadVals } from '../../lib/odoo';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KEY = 'callsheet:data';

async function findOdooLead(uid, phone, email) {
  if (!phone && !email) return null;
  const domain = phone && email
    ? ['|', ['phone', '=', phone], ['email_from', '=', email]]
    : phone ? [['phone', '=', phone]] : [['email_from', '=', email]];
  const result = await odooCall(uid, 'crm.lead', 'search', [domain], { limit: 1 });
  // result is raw XML for arrays — check for an int inside
  if (typeof result === 'string') {
    const m = result.match(/<int>(\d+)<\/int>/);
    return m ? parseInt(m[1]) : null;
  }
  return null;
}

async function createOdooLead(uid, lead, state) {
  const vals = buildLeadVals(lead, state);
  return odooCall(uid, 'crm.lead', 'create', [vals], {});
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

  // Authenticate ONCE
  let uid;
  try {
    uid = await odooAuth();
  } catch (e) {
    return res.status(500).json({ error: 'Odoo auth failed', detail: e.message });
  }

  const results = { pushed: 0, skipped: 0, errors: [] };

  for (const lead of data.leads) {
    try {
      const existing = await findOdooLead(uid, lead.phone, lead.email);
      if (existing) { results.skipped++; continue; }
      const state = data.state[lead._key] || {};
      await createOdooLead(uid, lead, state);
      results.pushed++;
    } catch (e) {
      results.errors.push({ key: lead._key, org: lead.org, error: e.message });
    }
  }

  return res.status(200).json(results);
}
