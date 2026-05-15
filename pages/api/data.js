import fs from 'fs';
import path from 'path';
import defaultLeads from '../../lib/leads';

const DATA_FILE = path.join('/tmp', 'callsheet.json');

function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return { leads: defaultLeads, state: {} };
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

export default function handler(req, res) {
  if (req.method === 'GET') {
    const data = readData();
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const data = readData();
    const { action, payload } = req.body;

    if (action === 'updateState') {
      const { key, result, note } = payload;
      if (!data.state[key]) data.state[key] = {};
      if (result !== undefined) data.state[key].result = result;
      if (note !== undefined) data.state[key].note = note;
      writeData(data);
      return res.status(200).json({ ok: true });
    }

    if (action === 'addLead') {
      const lead = payload;
      lead._key = lead.phone + '|' + lead.org;
      data.leads.unshift(lead);
      if (!data.state[lead._key]) data.state[lead._key] = { result: 'pending', note: '' };
      writeData(data);
      return res.status(200).json({ ok: true, lead });
    }

    if (action === 'removeLead') {
      const { key } = payload;
      data.leads = data.leads.filter(l => l._key !== key && (l.phone + '|' + l.org) !== key);
      delete data.state[key];
      writeData(data);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  res.status(405).end();
}
