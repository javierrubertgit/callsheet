import { Redis } from '@upstash/redis';
const redis = Redis.fromEnv();
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  await redis.del('callsheet:data');
  return res.status(200).json({ ok: true, message: 'Cache cleared' });
}
