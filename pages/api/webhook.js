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

function parseQuoterPayload(req) {
  const body = req.body;
  if (!body) return null;
  const quoteNum   = body.id || body.quote_number || body.number || '';
  const quoteName  = body.name || body.quote_name || '';
  const status     = body.status || 'pending';
  const expiryDate = body.expiry_date || body.expires_at || null;
  const createdAt  = body.created_at || new Date().toISOString();
  const contact    = body.billing_contact || body.contact || {};
  const firstName  = body.billing_first_name || contact.first_name || body.first_name || '';
  const lastName   = body.billing_last_name  || contact.last_name  || body.last_name  || '';
  const title      = body.billing_title      || contact.title      || body.title      || '';
  const org        = body.billing_company    || body.company       || contact.company || body.billing_organization || body.organization || '';
  const phone      = body.billing_phone      || contact.phone      || body.phone      || '';
  const email      = body.billing_email      || contact.email      || body.email      || '';
  const monthly    = parseFloat(body.monthly_total  || body.monthly_subtotal  || 0) || null;
  const upfront    = parseFloat(body.upfront_total  || body.one_time_total    || 0) || null;
  return {
    firstName, lastName, title, org, phone, email,
    quoteName: quoteName || 'Quoter Quote',
    quoteNum:  parseInt(quoteNum) || 0,
    created:   createdAt ? createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
    expiry:    expiryDate ? expiryDate.split('T')[0] : null,
    expired:   false,
    daysSince: 0,
    monthly,
    upfront,
    status,
  };
}

export const config = {
  api: {
    bodyParser: {
      type: ['application/json', 'application/x-www-form-urlencoded'],
    },
  },
};

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const hashKey = process.env.QUOTER_HASH_KEY;
  if (hashKey) {
    const crypto = require('crypto');
    const receivedHash = req.headers['x-quoter-hash'] || req.body?.hash || '';
    const expectedHash = crypto.createHash('md5').update(hashKey).digest('hex');
    if (receivedHash && receivedHash !== expectedHash) {
      return res.status(401).json({ error: 'Invalid hash' });
    }
  }
  const lead = parseQuoterPayload(req);
  if (!lead) return res.status(400).json({ error: 'Could not parse payload' });
  if (!lead.phone && !lead.email && !lead.org) {
    return res.status(200).json({ ok: true, skipped: 'No contact info' });
  }
  const key = (lead.phone || lead.email) + '|' + (lead.org || lead.email);
  lead._key = key;
  const data = readData();
  const existingIdx = data.leads.findIndex(l => l._key === key);
  if (existingIdx >= 0) {
    data.leads[existingIdx] = { ...data.leads[existingIdx], ...lead, _key: key };
  } else {
    data.leads.unshift(lead);
    if (!data.state[key]) data.state[key] = { result: 'pending', note: '' };
  }
  writeData(data);
  return res.status(200).json({ ok: true, lead });
}
