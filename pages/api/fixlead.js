import { Redis } from '@upstash/redis';
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KEY = 'callsheet:data';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const data = await redis.get(KEY);
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  // Remove the bad New Company lead so next webhook creates it fresh
  parsed.leads = parsed.leads.filter(l => l.org !== 'New Company');
  await redis.set(KEY, JSON.stringify(parsed));
  return res.status(200).json({ ok: true, total: parsed.leads.length });
}
