import { Redis } from '@upstash/redis';
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  await redis.del('callsheet:data');
  return res.status(200).json({ ok: true, message: 'Cache cleared' });
}
