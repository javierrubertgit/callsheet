// lib/odoo.js
const ODOO_URL = process.env.ODOO_URL || 'https://odoo.conectacloud.net:9443';
const ODOO_DB = process.env.ODOO_DB || 'conectacloudllc';
const ODOO_API_KEY = process.env.ODOO_API_KEY || '';
const ODOO_USER = process.env.ODOO_USER || 'jrubert@conectacloud.net';

async function odooRpc(path, params, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  const resp = await fetch(`${ODOO_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params }),
  });
  if (!resp.ok) throw new Error(`Odoo HTTP ${resp.status} at ${path}`);
  const data = await resp.json();
  // Return both result and the session cookie
  const setCookie = resp.headers.get('set-cookie');
  return { data, cookie: setCookie || cookie };
}

// Returns { uid, cookie } — call once, reuse for all subsequent calls
export async function odooAuth() {
  const { data, cookie } = await odooRpc('/web/session/authenticate', {
    db: ODOO_DB,
    login: ODOO_USER,
    password: ODOO_API_KEY,
  });
  if (data.error) throw new Error('Odoo auth failed: ' + JSON.stringify(data.error));
  const uid = data.result?.uid;
  if (!uid) throw new Error('Odoo auth: no uid returned');
  return { uid, cookie };
}

export async function odooCall(model, method, args = [], kwargs = {}, cookie) {
  const { data } = await odooRpc('/web/dataset/call_kw', {
    model,
    method,
    args,
    kwargs: { context: {}, ...kwargs },
  }, cookie);
  if (data.error) throw new Error(`Odoo ${model}.${method}: ` + JSON.stringify(data.error));
  return data.result;
}

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
