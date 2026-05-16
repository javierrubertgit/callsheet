import { Redis } from '@upstash/redis';
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
export default async function handler(req, res) {
  const raw = await redis.get('last_webhook');
  const skip = await redis.get('last_webhook_skip');
  return res.status(200).json({ last_webhook: raw, last_skip: skip });
}
