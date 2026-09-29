// pages/api/webhook.js
import { Redis } from '@upstash/redis';
import defaultLeads from '../../lib/leads';
import { odooAuth, odooCall, buildLeadVals } from '../../lib/odoo';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KEY = 'callsheet:data';

export const config = { api: { bodyParser: { type: '*/*' } } };

async function readData() {
  try {
    const data = await redis.get(KEY);
    if (data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (parsed?.leads?.length > 0) return parsed;
    }
  } catch (e) {}
  const fresh = { leads: defaultLeads.map(l => ({ ...l, _key: l._key || (l.phone + '|' + l.org) })), state: {} };
  await redis.set(KEY, JSON.stringify(fresh));
  return fresh;
}

async function writeData(data) {
  await redis.set(KEY, JSON.stringify(data));
}

function parseQuoterPayload(req) {
  try {
    let b = req.body;
    if (typeof b === 'string') {
      const params = new URLSearchParams(b);
      b = Object.fromEntries(params.entries());
    }
    req._rawWebhook = b;
    if (b?.data) b = JSON.parse(b.data);

    const person = b?.person || {};
    const phones = person.telephone_numbers || {};
    const phone = (phones.work || phones.mobile || '').replace(/\D/g, '');
    const email = person.email_address || '';
    const org = person.organization || '';
    const firstName = person.first_name || '';
    const lastName = person.last_name || '';
    const title = person.title || '';

    const monthly = parseFloat(String(b?.total?.recurring || '0').replace(/,/g, '')) || 0;
    const upfront = parseFloat(String(b?.total?.upfront || '0').replace(/,/g, '')) || 0;

    const uuid = b?.uuid || '';
    const quoteUrl = uuid ? `https://conectacloudconsultants.quoter.com/quote/webview/${uuid}` : '';

    return {
      firstName, lastName, title, org,
      phone: phone ? '+1' + phone : '',
      email,
      quoteName: b?.name || b?.form?.title || '',
      quoteNum: b?.number || '',
      uuid,
      quoteUrl,
      monthly: monthly.toFixed(2),
      upfront: upfront.toFixed(2),
      status: b?.status || 'pending',
      created: b?.created_at ? b.created_at.split(' ')[0] : new Date().toISOString().split('T')[0],
      expiry: b?.expiry_date ? b.expiry_date.split(' ')[0] : '',
      notes: '',
    };
  } catch (e) {
    console.error('parseQuoterPayload error:', e);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    await redis.set('callsheet:last_webhook', raw, { ex: 86400 });
  } catch (_) {}

  const lead = parseQuoterPayload(req);
  if (!lead) return res.status(400).json({ error: 'Bad payload' });
  if (!lead.phone && !lead.email && !lead.org) return res.status(200).json({ ok: true, skipped: 'no contact' });

  const key = (lead.phone || lead.email) + '|' + (lead.org || lead.email);
  lead._key = key;

  const data = await readData();
  const idx = data.leads.findIndex(l =>
    l._key === key || (l.phone === lead.phone && l.org === lead.org)
  );
  if (idx >= 0) {
    data.leads[idx] = { ...data.leads[idx], ...lead, _key: key };
  } else {
    data.leads.unshift(lead);
    if (!data.state[key]) data.state[key] = { result: 'pending', note: '' };
  }
  await writeData(data);

  // Push to Odoo (non-blocking)
  let odooId = null;
  let odooError = null;
  try {
    const uid = await odooAuth();

    const domain = lead.phone && lead.email
      ? ['|', ['phone', '=', lead.phone], ['email_from', '=', lead.email]]
      : lead.phone ? [['phone', '=', lead.phone]] : [['email_from', '=', lead.email]];

    const searchResult = await odooCall(uid, 'crm.lead', 'search', [domain], { limit: 1 });
    const existingId = typeof searchResult === 'string'
      ? (searchResult.match(/<int>(\d+)<\/int>/)?.[1] ? parseInt(searchResult.match(/<int>(\d+)<\/int>/)[1]) : null)
      : null;

    if (!existingId) {
      const vals = buildLeadVals(lead, data.state[key] || {});
      odooId = await odooCall(uid, 'crm.lead', 'create', [vals], {});
    } else {
      odooId = existingId;
    }
  } catch (e) {
    odooError = e.message;
    console.error('Odoo push failed:', e);
  }

  return res.status(200).json({ ok: true, lead, odooId, odooError });
}
