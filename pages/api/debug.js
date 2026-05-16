import { Redis } from '@upstash/redis';

export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  
  if (!url || !token) {
    return res.status(200).json({ error: 'Missing env vars', url: !!url, token: !!token });
  }

  try {
    const redis = new Redis({ url, token });
    const data = await redis.get('callsheet:data');
    if (!data) return res.status(200).json({ status: 'connected but empty', url: url.slice(0,30) });
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return res.status(200).json({ total: parsed?.leads?.length, top3: parsed?.leads?.slice(0,3).map(l => l.org) });
  } catch(e) {
    return res.status(200).json({ error: e.message });
  }
}
