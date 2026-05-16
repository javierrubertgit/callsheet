import { Redis } from '@upstash/redis';
import defaultLeads from '../../lib/leads';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KEY = 'callsheet:data';

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
  let b = req.body;
  
  // Quoter wraps data in a 'data' field as JSON string
  if (b?.data) {
    try { b = JSON.parse(b.data); } catch(e) { console.error('Failed to parse data field:', e); }
  }
  
  console.log('Parsed body keys:', Object.keys(b || {}).join(', '));
  console.log('Sample:', JSON.stringify(b).slice(0, 300));

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
    uuid:      b.uuid || '',
    quoteUrl:  b.uuid ? `https://conectacloudconsultants.quoter.com/quote/webview/${b.uuid}` : null,
    created:   (b.created_at || new Date().toISOString()).split('T')[0],
    expiry:    b.expiry_date ? b.expiry_date.split('T')[0] : null,
    expired:   false, daysSince: 0,
    monthly:   parseFloat(b.monthly_total || b.total?.recurring || 0) || null,
    upfront:   parseFloat(b.upfront_total || b.one_time_total || b.total?.upfront || 0) || null,
    status:    b.status || 'pending',
  };
}

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const lead = parseQuoterPayload(req);
  console.log('Lead org:', lead?.org, 'phone:', lead?.phone);

  if (!lead) return res.status(400).json({ error: 'Bad payload' });
  if (!lead.phone && !lead.email && !lead.org) {
    console.log('Skipped - no contact info');
    return res.status(200).json({ ok: true, skipped: 'no contact' });
  }

  const key = (lead.phone || lead.email) + '|' + (lead.org || lead.email);
  lead._key = key;

  const data = await readData();
  const idx = data.leads.findIndex(l =>
    l._key === key ||
    (l.phone + '|' + l.org) === key ||
    (l.phone === lead.phone && l.org === lead.org)
  );

  if (idx >= 0) {
    data.leads[idx] = { ...data.leads[idx], ...lead, _key: key };
    console.log('Updated existing lead at index', idx);
  } else {
    data.leads.unshift(lead);
    if (!data.state[key]) data.state[key] = { result: 'pending', note: '' };
    console.log('Added new lead, total now:', data.leads.length);
  }

  await writeData(data);
  return res.status(200).json({ ok: true, lead });
}
