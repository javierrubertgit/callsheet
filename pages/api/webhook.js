import { Redis } from '@upstash/redis';
import defaultLeads from '../../lib/leads';

const redis = Redis.fromEnv();
const KEY = 'callsheet:data';

async function readData() {
  try {
    const data = await redis.get(KEY);
    if (data) return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) { console.error('readData error:', e); }
  return { leads: [...defaultLeads], state: {} };
}

async function writeData(data) {
  await redis.set(KEY, JSON.stringify(data));
}

function parseQuoterPayload(req) {
  const b = req.body;
  console.log('Webhook body:', JSON.stringify(b).slice(0, 500));
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
    monthly:   parseFloat(b.monthly_total || 0) || null,
    upfront:   parseFloat(b.upfront_total || b.one_time_total || 0) || null,
    status:    b.status || 'pending',
  };
}

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const lead = parseQuoterPayload(req);
  console.log('Parsed lead:', JSON.stringify(lead));

  if (!lead) return res.status(400).json({ error: 'Bad payload' });
  if (!lead.phone && !lead.email && !lead.org) {
    console.log('Skipped - no contact info');
    return res.status(200).json({ ok: true, skipped: 'no contact' });
  }

  const key = (lead.phone || lead.email) + '|' + (lead.org || lead.email);
  lead._key = key;
  console.log('Lead key:', key);

  const data = await readData();
  console.log('Current lead count:', data.leads.length);

  const idx = data.leads.findIndex(l =>
    l._key === key ||
    (l.phone + '|' + l.org) === key ||
    (l.phone === lead.phone && l.org === lead.org)
  );

  console.log('Existing index:', idx);

  if (idx >= 0) {
    data.leads[idx] = { ...data.leads[idx], ...lead, _key: key };
  } else {
    data.leads.unshift(lead);
    if (!data.state[key]) data.state[key] = { result: 'pending', note: '' };
  }

  await writeData(data);
  console.log('Saved. New count:', data.leads.length);
  return res.status(200).json({ ok: true, lead });
}
