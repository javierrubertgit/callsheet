// lib/odoo.js
const ODOO_URL = process.env.ODOO_URL || 'https://odoo.conectacloud.net:9443';
const ODOO_DB = process.env.ODOO_DB || 'conectacloudllc';
const ODOO_API_KEY = process.env.ODOO_API_KEY || '';
const ODOO_USER = process.env.ODOO_USER || 'jrubert@conectacloud.net';

let _uidCache = null;

async function odooRpc(path, params) {
  const resp = await fetch(`${ODOO_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params }),
  });
  if (!resp.ok) throw new Error(`Odoo HTTP ${resp.status} at ${path}`);
  return resp.json();
}

async function getUid() {
  if (_uidCache) return _uidCache;
  const res = await odooRpc('/web/session/authenticate', {
    db: ODOO_DB,
    login: ODOO_USER,
    password: ODOO_API_KEY,
  });
  if (res.error) throw new Error('Odoo auth failed: ' + JSON.stringify(res.error));
  _uidCache = res.result?.uid;
  if (!_uidCache) throw new Error('Odoo auth: no uid returned');
  return _uidCache;
}

export async function odooCall(model, method, args = [], kwargs = {}) {
  const uid = await getUid();
  const res = await odooRpc('/web/dataset/call_kw', {
    model,
    method,
    args,
    kwargs: { context: { uid }, ...kwargs },
  });
  if (res.error) throw new Error(`Odoo ${model}.${method}: ` + JSON.stringify(res.error));
  return res.result;
}

// Build crm.lead vals from a callsheet lead
export function buildLeadVals(lead, state = {}) {
  const contactName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.org || '';
  const desc = [
    lead.quoteNum ? `Quote #: ${lead.quoteNum}` : '',
    lead.quoteName ? `Quote: ${lead.quoteName}` : '',
    lead.quoteUrl ? `Quote URL: ${lead.quoteUrl}` : '',
    lead.expiry ? `Expiry: ${lead.expiry}` : '',
    lead.title ? `Title: ${lead.title}` : '',
    state.note ? `Call notes: ${state.note}` : '',
    lead.notes ? `Notes: ${lead.notes}` : '',
  ].filter(Boolean).join('\n');

  return {
    name: `${lead.org || contactName} — ${lead.quoteName || 'Quote'}`,
    contact_name: contactName,
    partner_name: lead.org || '',
    phone: lead.phone || '',
    email_from: lead.email || '',
    description: desc,
    expected_revenue: parseFloat(String(lead.monthly || '0').replace(/,/g, '')) || 0,
  };
}

// Create a lead; returns new Odoo id
export async function createOdooLead(lead, state = {}) {
  return odooCall('crm.lead', 'create', [buildLeadVals(lead, state)]);
}

// Find existing lead by phone or email; returns id or null
export async function findOdooLead(phone, email) {
  const conditions = [];
  if (phone) conditions.push(['phone', '=', phone]);
  if (email) conditions.push(['email_from', '=', email]);
  if (!conditions.length) return null;
  const domain = conditions.length === 1
    ? [conditions[0]]
    : [['|', ...conditions[0], ...conditions[1]]];
  // Proper OR domain for Odoo
  const orDomain = conditions.length === 1
    ? conditions
    : ['|', conditions[0], conditions[1]];
  const ids = await odooCall('crm.lead', 'search', [orDomain], { limit: 1 });
  return ids?.[0] ?? null;
}
