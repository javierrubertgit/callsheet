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

export default function handler(req, res) {
  const { leads, state } = readData();
  const rows = [['Name','Title','Organization','Phone','Email','Quote #','Quote Name','Monthly','Upfront','Created','Expiry','Expired','Result','Notes']];
  leads.forEach(l => {
    const key = l._key || (l.phone + '|' + l.org);
    const s = state[key] || {};
    rows.push([
      `${l.firstName} ${l.lastName}`, l.title, l.org, l.phone, l.email,
      l.quoteNum || '', l.quoteName, l.monthly || '', l.upfront || '',
      l.created, l.expiry || '', l.expired ? 'Yes' : 'No',
      s.result || 'pending', s.note || ''
    ]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="call_results_${new Date().toISOString().split('T')[0]}.csv"`);
  res.status(200).send(csv);
}
