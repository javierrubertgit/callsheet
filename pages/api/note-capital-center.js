import { Redis } from '@upstash/redis';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KEY = 'callsheet:data';

// Mismas empresas del batch de Capital Center Building
const CAPITAL_CENTER_ORGS = new Set([
  "CREACTIVA LLC",
  "Vélez-Santiago & Associates, LLC",
  "Marketing SBA Lender",
  "del Valle Rodríguez Law Offices",
  "JGMM",
  "DMR Law",
  "Vicente & Cuebas",
  "Colegio de CPA de Puerto Rico",
  "Izquierdo San Miguel",
  "Guzmán CPA",
  "Gnocchi Law",
  "Betis Products",
  "EIG PR",
  "Law Offices of Ariadne Berrios, LLC",
  "Sampol",
  "Edwin Rodríguez, CPA",
  "ESCO Group",
  "Consultorio Dental (Boada/Pagán)",
  "Vidal & Rodríguez",
  "Asociación de Farmacias de la Comunidad de PR",
]);

const NOTE_TEXT = "Contacto de la visita a Capital Center Building. Se enviará correo electrónico de seguimiento.";

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

  let updated = 0;
  const results = [];

  for (const lead of data.leads) {
    if (CAPITAL_CENTER_ORGS.has(lead.org)) {
      const key = lead._key;
      if (!data.state[key]) data.state[key] = { result: 'pending', note: '' };
      data.state[key].note = NOTE_TEXT;
      updated++;
      results.push({ org: lead.org, key });
    }
  }

  await redis.set(KEY, JSON.stringify(data));

  return res.status(200).json({
    ok: true,
    actualizados: updated,
    detalle: results,
  });
}
