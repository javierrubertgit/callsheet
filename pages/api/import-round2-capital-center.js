import { Redis } from '@upstash/redis';
import defaultLeads from '../../lib/leads';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KEY = 'callsheet:data';

const FOLLOWUP_NOTE = "Contacto de la visita a Capital Center Building. Se envió correo electrónico de seguimiento.";

// Nuevos contactos de la segunda ronda (todos con status "pending")
const newLeads = [
  { firstName: "Noel", lastName: "Pérez Soto", title: "Oftalmólogo / Cirujano Plástico Oncólogo Ocular", org: "Dr. Noel Pérez Soto, MD", phone: "787-721-1010", email: "noelperezmd@gmail.com" },
  { firstName: "Edgardo", lastName: "Goás", title: "Contacto", org: "Goás & Associates, LLC", phone: "787-661-7000", email: "egoas@goaspr.com" },
  { firstName: "Walisbeth", lastName: "Class Vázquez", title: "Gastroenterología & Hígado", org: "Gastro Class", phone: "939-484-2484", email: "" },
  { firstName: "Raymond L.", lastName: "Sánchez Maceira", title: "Abogado de Inmigración", org: "Sánchez Maceira Law", phone: "787-751-2510", email: "sanchezlaw.assistant@gmail.com" },
  { firstName: "Gino", lastName: "Negretti", title: "Attorney at Law", org: "Gino Negretti Law", phone: "787-725-5500", email: "ginonegretti@gmail.com" },
  { firstName: "Luis Rafael", lastName: "Rivera", title: "Attorney at Law", org: "Luis Rafael Rivera Law Offices", phone: "787-763-1780", email: "luiswichyrivera@hotmail.com" },
  { firstName: "Jesús E.", lastName: "Batista Sánchez", title: "Esq.", org: "Batista Law Group", phone: "787-620-2856", email: "jeb@batistasanchez.com" },
  { firstName: "Frank D.", lastName: "Inserni Milam", title: "Abogado-Notario", org: "Frank D. Inserni Milam", phone: "787-763-3851", email: "finserni@gmail.com" },
  { firstName: "", lastName: "", title: "Contacto", org: "Fidelis Talent Solutions", phone: "787-919-7715", email: "ysalgado@fidelisllc.co" },
];

// Contacto con reunión ya concertada — nota y status distintos
const scheduledLead = {
  firstName: "Vilma",
  lastName: "Ortega-Vidaurre",
  title: "M.D., FACOG",
  org: "Vilma Ortega-Vidaurre, M.D.",
  phone: "787-754-8333",
  email: "draortega1@yahoo.com",
  note: "Cita concertada para el martes 2:30 PM con Julie Muñiz. Se envió correo de confirmación.",
  status: "meeting_scheduled",
};

// Actualización del contacto existente Vidal y Rodríguez (antes solo email general)
const updateOrg = "Vidal & Rodríguez";
const updatedFirstName = "Rocío";
const updatedLastName = "Briñez";
const updatedPhone = "787-510-5850";

async function readData() {
  try {
    const data = await redis.get(KEY);
    if (data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (parsed?.leads?.length > 0) return parsed;
    }
  } catch (e) {
    console.error('readData error:', e);
  }
  return { leads: defaultLeads.map(l => ({ ...l, _key: l._key || (l.phone + '|' + l.org) })), state: {} };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const data = await readData();
  const results = [];
  let added = 0;
  let updated = 0;

  // 1. Agregar los 9 leads nuevos con nota de seguimiento
  for (const lead of newLeads) {
    const key = (lead.phone || '') + '|' + lead.org;
    const exists = data.leads.some(l => l._key === key);
    if (exists) {
      results.push({ org: lead.org, status: 'ya existía' });
      continue;
    }
    const fullLead = {
      ...lead,
      _key: key,
      quoteName: '', quoteNum: null, uuid: '', quoteUrl: '',
      created: new Date().toISOString().slice(0, 10),
      expiry: null, expired: false, daysSince: 0, monthly: 0, upfront: 0,
      status: 'pending',
    };
    data.leads.unshift(fullLead);
    data.state[key] = { result: 'pending', note: FOLLOWUP_NOTE };
    added++;
    results.push({ org: lead.org, status: 'agregado' });
  }

  // 2. Agregar el contacto con cita ya concertada
  {
    const key = scheduledLead.phone + '|' + scheduledLead.org;
    const exists = data.leads.some(l => l._key === key);
    if (!exists) {
      const fullLead = {
        firstName: scheduledLead.firstName,
        lastName: scheduledLead.lastName,
        title: scheduledLead.title,
        org: scheduledLead.org,
        phone: scheduledLead.phone,
        email: scheduledLead.email,
        _key: key,
        quoteName: '', quoteNum: null, uuid: '', quoteUrl: '',
        created: new Date().toISOString().slice(0, 10),
        expiry: null, expired: false, daysSince: 0, monthly: 0, upfront: 0,
        status: scheduledLead.status,
      };
      data.leads.unshift(fullLead);
      data.state[key] = { result: scheduledLead.status, note: scheduledLead.note };
      added++;
      results.push({ org: scheduledLead.org, status: 'agregado (cita concertada)' });
    } else {
      results.push({ org: scheduledLead.org, status: 'ya existía' });
    }
  }

  // 3. Actualizar el registro existente de Vidal & Rodríguez con el nombre y teléfono reales
  const existingLead = data.leads.find(l => l.org === updateOrg);
  if (existingLead) {
    const oldKey = existingLead._key;
    existingLead.firstName = updatedFirstName;
    existingLead.lastName = updatedLastName;
    existingLead.phone = updatedPhone;
    const newKey = updatedPhone + '|' + updateOrg;
    existingLead._key = newKey;
    if (data.state[oldKey]) {
      data.state[newKey] = { ...data.state[oldKey], note: FOLLOWUP_NOTE };
      if (newKey !== oldKey) delete data.state[oldKey];
    } else {
      data.state[newKey] = { result: 'pending', note: FOLLOWUP_NOTE };
    }
    updated++;
    results.push({ org: updateOrg, status: 'actualizado (nombre y teléfono)' });
  } else {
    results.push({ org: updateOrg, status: 'no encontrado — no se actualizó' });
  }

  await redis.set(KEY, JSON.stringify(data));

  return res.status(200).json({
    ok: true,
    agregados: added,
    actualizados: updated,
    total_leads: data.leads.length,
    detalle: results,
  });
}
