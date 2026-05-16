import { Redis } from '@upstash/redis';
import defaultLeads from '../../lib/leads';

const redis = Redis.fromEnv();
const KEY = 'callsheet:data';

async function readData() {
  try {
    const data = await redis.get(KEY);
    if (data) return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {}
  return { leads: defaultLeads, state: {} };
}

async function writeData(data) {
  await redis.set(KEY, JSON.stringify(data));
}

function parseQuoterPayload(req) {
  const b = req.body;
  if (!b) return null;
  const contact = b.billing_contact || b.contact || {};
  return {
    firstName: b.billing_first_name || contact.first_name || b.first_name || '',
    lastName:  b.billing_last_name  || contact.last_name  || b.last_name  || '',
    title:     b.billing_title      || contact.title      || b.title      || '',
    org:       b.billing_company    || b.organization     || contact.company || b.billing_organization || b.company || '',
    phone:     b.billing_phone      || contact.phone      || b.phone      || '',
    email:     b.billing_email      || contact.email      || b.email      || '',
    quoteName: b.name || b.quote_name || 'Quoter Quote',
    quoteNum:  parseInt(b.id || b.quote_number || 0) || 0,
    created:   (b.created_at || new Date().toISOString()).split('T')[0],
    expiry:    b.expiry_date ? b.expiry_date.split('T')[0] : null,
    expired:   false, daysSince: 0,
    monthly:   parseFloat(b.monthly_total || 0) || null,
    upfront:   parseFloat(b.upfront_total || b.one_time_total || 0) || null,
    status:    b.status || 'pending',
  };
}

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const hashKey = process.env.QUOTER_HASH_KEY;
  if (hashKey) {
    const crypto = require('crypto');
    const received = req.headers['x-quoter-hash'] || req.body?.hash || '';
    const expected = crypto.createHash('md5').update(hashKey).digest('hex');
    if (received && received !== hashKey && received !== expected) return res.status(401).json({ error: 'Bad hash' });
  }

  const lead = parseQuoterPayload(req);
  if (!lead) return res.status(400).json({ error: 'Bad payload' });
  if (!lead.phone && !lead.email && !lead.org) return res.status(200).json({ ok: true, skipped: 'no contact' });

  const key = (lead.phone || lead.email) + '|' + (lead.org || lead.email);
  lead._key = key;

  const data = await readData();
  const idx = data.leads.findIndex(l => l._key === key);
  if (idx >= 0) {
    data.leads[idx] = { ...data.leads[idx], ...lead, _key: key };
  } else {
    data.leads.unshift(lead);
    if (!data.state[key]) data.state[key] = { result: 'pending', note: '' };
  }
  await writeData(data);
  return res.status(200).json({ ok: true, lead });
}
