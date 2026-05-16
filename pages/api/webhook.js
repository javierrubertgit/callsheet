import { Redis } from '@upstash/redis';
import defaultLeads from '../../lib/leads';
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KEY = 'callsheet:data';
async function readData() {
  try {
    const d = await redis.get(KEY);
    if (d) { const p = typeof d === 'string' ? JSON.parse(d) : d; if (p?.leads?.length > 0) return p; }
  } catch(e) {}
  const fresh = { leads: defaultLeads.map(l => ({ ...l, _key: l._key || (l.phone + '|' + l.org) })), state: {} };
  await redis.set(KEY, JSON.stringify(fresh));
  return fresh;
}
async function writeData(data) { await redis.set(KEY, JSON.stringify(data)); }
function toFloat(s) { return parseFloat(String(s || '0').replace(/,/g, '')) || null; }
export const config = { api: { bodyParser: true } };
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let b = req.body;
  await redis.set('last_webhook', JSON.stringify(b));
  if (b?.data) { try { b = typeof b.data === 'string' ? JSON.parse(b.data) : b.data; } catch(e) {} }
  const p = b?.person || {};
  const tel = p?.telephone_numbers || {};
  const phone = (tel.work || tel.mobile || tel.fax || '').trim();
  const email = (p.email_address || '').trim();
  const org   = (p.organization || '').trim();
  const uuid  = (b.uuid || '').trim();
  if (!phone && !email && !org) return res.status(200).json({ ok: true, skipped: 'no contact' });
  const lead = {
    firstName: (p.first_name || '').trim(),
    lastName:  (p.last_name  || '').trim(),
    title:     (p.title      || '').trim(),
    org, phone, email,
    quoteName: b.name || 'Quoter Quote',
    quoteNum:  parseInt(b.id || 0) || 0,
    uuid,
    quoteUrl:  uuid ? `https://conectacloudconsultants.quoter.com/quote/webview/${uuid}` : null,
    created:   (b.created_at || new Date().toISOString()).split('T')[0],
    expiry:    b.expiry_date ? b.expiry_date.split('T')[0] : null,
    expired: false, daysSince: 0,
    monthly: toFloat(b?.total?.recurring),
    upfront: toFloat(b?.total?.upfront),
    status: b.status || 'pending',
  };
  const key = (phone || email) + '|' + (org || email);
  lead._key = key;
  const data = await readData();
  const idx = data.leads.findIndex(l => l._key === key || (l.phone === phone && l.org === org));
  if (idx >= 0) {
    data.leads[idx] = { ...lead, _key: key };
  } else {
    data.leads.unshift(lead);
    if (!data.state[key]) data.state[key] = { result: 'pending', note: '' };
  }
  await writeData(data);
  return res.status(200).json({ ok: true, lead });
}
