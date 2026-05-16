import { Redis } from '@upstash/redis';
import defaultLeads from '../../lib/leads';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KEY = 'callsheet:data';

async function readData() {
  try {
    const data = await redis.get(KEY);
    if (data) return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {}
  return { leads: defaultLeads, state: {} };
}

export default async function handler(req, res) {
  const data = await readData();
  const rows = data.leads.map(l => {
    const s = data.state[l._key] || {};
    return [
      l.quoteNum, l.firstName, l.lastName, l.org, l.phone, l.email,
      l.monthly, l.upfront, l.created, l.expiry,
      s.result || 'pending', s.note || ''
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  });
  const csv = ['Quote#,First,Last,Org,Phone,Email,Monthly,Upfront,Created,Expiry,Result,Note', ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="callsheet.csv"');
  return res.status(200).send(csv);
}
