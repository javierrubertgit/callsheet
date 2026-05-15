import { Redis } from '@upstash/redis';
import defaultLeads from '../../lib/leads';

const redis = Redis.fromEnv();
const KEY = 'callsheet:data';

async function readData() {
  try {
    const data = await redis.get(KEY);
    if (data) return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {}
  return { leads: defaultLeads, state: {} };
}

async function writeData(data) {
  await redis.set(KEY, JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const data = await readData();
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const data = await readData();
    const { action, payload } = req.body;

    if (action === 'updateState') {
      const { key, result, note } = payload;
      if (!data.state[key]) data.state[key] = {};
      if (result !== undefined) data.state[key].result = result;
      if (note !== undefined) data.state[key].note = note;
      await writeData(data);
      return res.status(200).json({ ok: true });
    }

    if (action === 'addLead') {
      const lead = payload;
      lead._key = lead.phone + '|' + lead.org;
      data.leads.unshift(lead);
      if (!data.state[lead._key]) data.state[lead._key] = { result: 'pending', note: '' };
      await writeData(data);
      return res.status(200).json({ ok: true, lead });
    }

    if (action === 'removeLead') {
      const { key } = payload;
      data.leads = data.leads.filter(l => l._key !== key && (l.phone + '|' + l.org) !== key);
      delete data.state[key];
      await writeData(data);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  res.status(405).end();
}
