import { Redis } from '@upstash/redis';
import defaultLeads from '../../lib/leads';
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KEY = 'callsheet:data';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { leads: newLeads, secret } = req.body;
  if (secret !== 'import2026') return res.status(401).json({ error: 'bad secret' });
  let data = await redis.get(KEY);
  data = data ? (typeof data === 'string' ? JSON.parse(data) : data) : { leads: defaultLeads.map(l => ({ ...l, _key: l._key || (l.phone + '|' + l.org) })), state: {} };
  let added = 0, skipped = 0;
  for (const lead of newLeads) {
    const key = lead._key || ((lead.phone || lead.email) + '|' + (lead.org || lead.email));
    lead._key = key;
    const exists = data.leads.findIndex(l => l._key === key || (l.phone === lead.phone && l.org === lead.org));
    if (exists >= 0) { skipped++; continue; }
    data.leads.unshift(lead);
    if (!data.state[key]) data.state[key] = { result: 'pending', note: '' };
    added++;
  }
  await redis.set(KEY, JSON.stringify(data));
  return res.status(200).json({ ok: true, added, skipped, total: data.leads.length });
}
