import { Redis } from '@upstash/redis';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KEY = 'callsheet:data';

const ORG = "Frank D. Inserni Milam";
const NOTE = "Contestó la llamada. Cita concertada para el 8 de septiembre.";

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  let data;
  try {
    const raw = await redis.get(KEY);
    data = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
  } catch (e) {
    return res.status(500).json({ error: 'Redis read failed', detail: e.message });
  }
  if (!data || !data.leads) {
    return res.status(404).json({ error: 'No hay datos en Redis todavía' });
  }

  const lead = data.leads.find(l => l.org === ORG);
  if (!lead) {
    return res.status(404).json({ error: `No se encontró el lead: ${ORG}` });
  }

  const key = lead._key;
  lead.status = 'meeting_scheduled';
  data.state[key] = { ...(data.state[key] || {}), result: 'reached', note: NOTE };

  await redis.set(KEY, JSON.stringify(data));

  return res.status(200).json({ ok: true, org: ORG, key, note: NOTE });
}
