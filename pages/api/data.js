import { Redis } from '@upstash/redis';
import defaultLeads from '../../lib/leads';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KEY = 'callsheet:data';

async function readData() {
  try {
    const data = await redis.get(KEY);
    if (data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (parsed?.leads?.length > 0) return parsed;
    }
  } catch (e) { console.error('readData error:', e); }
  // Redis empty — seed from leads.js and save
  const fresh = { leads: defaultLeads.map(l => ({ ...l, _key: l._key || (l.phone + '|' + l.org) })), state: {} };
  await redis.set(KEY, JSON.stringify(fresh));
  return fresh;
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
      const { key, result, note, followup } = payload;
      if (!data.state[key]) data.state[key] = {};
      if (result !== undefined) data.state[key].result = result;
      if (note !== undefined) data.state[key].note = note;
      if (followup !== undefined) data.state[key].followup = followup;
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

    if (action === 'saveFollowupNames') {
      data.followupNames = payload.names;
      await writeData(data);
      return res.status(200).json({ ok: true });
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
// Already handled in the POST block above - just need saveFollowupNames action
