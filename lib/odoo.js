// lib/odoo.js
const ODOO_URL = process.env.ODOO_URL || 'https://odoo.conectacloud.net:9443';
const ODOO_DB = process.env.ODOO_DB || 'conectacloudllc';
const ODOO_API_KEY = process.env.ODOO_API_KEY || '';
const ODOO_USER = process.env.ODOO_USER || 'jrubert@conectacloud.net';

function xmlrpcCall(endpoint, method, params) {
  const toXml = (v) => {
    if (v === null || v === undefined) return '<value><boolean>0</boolean></value>';
    if (typeof v === 'boolean') return `<value><boolean>${v ? 1 : 0}</boolean></value>`;
    if (typeof v === 'number') return Number.isInteger(v) ? `<value><int>${v}</int></value>` : `<value><double>${v}</double></value>`;
    if (typeof v === 'string') return `<value><string>${v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</string></value>`;
    if (Array.isArray(v)) return `<value><array><data>${v.map(toXml).join('')}</data></array></value>`;
    if (typeof v === 'object') {
      const members = Object.entries(v).map(([k, val]) =>
        `<member><name>${k}</name>${toXml(val)}</member>`
      ).join('');
      return `<value><struct>${members}</struct></value>`;
    }
    return `<value><string>${String(v)}</string></value>`;
  };

  const body = `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${
    params.map(p => `<param>${toXml(p)}</param>`).join('')
  }</params></methodCall>`;

  return fetch(`${ODOO_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body,
  }).then(async r => {
    if (!r.ok) throw new Error(`Odoo HTTP ${r.status} at ${endpoint}`);
    const text = await r.text();
    // Parse fault
    if (text.includes('<fault>')) {
      const msg = text.match(/<name>faultString<\/name>\s*<value><string>([\s\S]*?)<\/string>/)?.[1] || 'XML-RPC fault';
      throw new Error(`Odoo fault: ${msg}`);
    }
    // Parse result value
    return parseXmlValue(text);
  });
}

function parseXmlValue(xml) {
  // int
  let m = xml.match(/<value><int>(\d+)<\/int><\/value>/);
  if (m) return parseInt(m[1]);
  // boolean
  m = xml.match(/<value><boolean>([01])<\/boolean><\/value>/);
  if (m) return m[1] === '1';
  // double
  m = xml.match(/<value><double>([\d.]+)<\/double><\/value>/);
  if (m) return parseFloat(m[1]);
  // string
  m = xml.match(/<value><string>([\s\S]*?)<\/string><\/value>/);
  if (m) return m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  // array — return raw xml for complex types (we only need int results for create/search)
  return xml;
}

// Returns uid (number)
export async function odooAuth() {
  const uid = await xmlrpcCall('/xmlrpc/2/common', 'authenticate', [
    ODOO_DB, ODOO_USER, ODOO_API_KEY, {}
  ]);
  if (!uid || typeof uid !== 'number') throw new Error('Odoo auth failed: no uid');
  return uid;
}

// Execute a model method via XML-RPC
export async function odooCall(uid, model, method, args = [], kwargs = {}) {
  return xmlrpcCall('/xmlrpc/2/object', 'execute_kw', [
    ODOO_DB, uid, ODOO_API_KEY,
    model, method, args, kwargs
  ]);
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
