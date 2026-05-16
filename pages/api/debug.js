import { Redis } from '@upstash/redis';
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
export default async function handler(req, res) {
  const data = await redis.get('callsheet:data');
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  const top5 = parsed?.leads?.slice(0, 5).map(l => ({
    name: l.firstName + ' ' + l.lastName,
    org: l.org,
    phone: l.phone,
    key: l._key
  }));
  return res.status(200).json({ total: parsed?.leads?.length, top5 });
}
