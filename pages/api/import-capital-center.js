import { Redis } from '@upstash/redis';
import defaultLeads from '../../lib/leads';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KEY = 'callsheet:data';

// Los 21 contactos de la visita a Capital Center Building
const newLeads = [
  { firstName: "Eliane", lastName: "Otero Vázquez", title: "Psicóloga Clínica", org: "CREACTIVA LLC", phone: "787-517-9282", email: "dra.oterovazquez@gmail.com" },
  { firstName: "Rosendo", lastName: "Jiménez", title: "Contacto", org: "Vélez-Santiago & Associates, LLC", phone: "787-771-5025", email: "rosendo.jimenez@vsacpa.com" },
  { firstName: "Francisco", lastName: "Rivera", title: "President", org: "Marketing SBA Lender", phone: "787-765-0801", email: "francisco.rivera@marketingsba.com" },
  { firstName: "José Rafael", lastName: "del Valle Rodríguez", title: "Attorney at Law", org: "del Valle Rodríguez Law Offices", phone: "787-754-8420", email: "delvalle@dvrlaw.com" },
  { firstName: "José Gabriel", lastName: "Matos Malavé", title: "Ophthalmology", org: "JGMM", phone: "787-281-0030", email: "" },
  { firstName: "María A.", lastName: "Domínguez Victoriano", title: "Founding Partner", org: "DMR Law", phone: "787-331-9970", email: "m.dominguez@dmrpr.com" },
  { firstName: "Harold D.", lastName: "Vicente González", title: "Attorney at Law", org: "Vicente & Cuebas", phone: "787-751-8000", email: "hvicente@vc-law.net" },
  { firstName: "Eunice O.", lastName: "Arroyo", title: "Contacto", org: "Colegio de CPA de Puerto Rico", phone: "787-368-2679", email: "earroyo@colegiocpa.com" },
  { firstName: "Karen", lastName: "Bibiloni", title: "Contacto", org: "Izquierdo San Miguel", phone: "", email: "kbibiloni@izquierdosanmiguel.com" },
  { firstName: "", lastName: "", title: "Servicio al Cliente", org: "Guzmán CPA", phone: "", email: "customerservice@guzman-cpa.com" },
  { firstName: "Antonio", lastName: "Gnocchi Franco", title: "Attorney", org: "Gnocchi Law", phone: "", email: "info@gnocchilaw.com" },
  { firstName: "Naomi", lastName: "Sánchez", title: "Contacto", org: "Betis Products", phone: "", email: "administracion@betisproducts.com" },
  { firstName: "Margarita", lastName: "Buenaga", title: "Contacto", org: "EIG PR", phone: "", email: "mbuenaga@eigpr.com" },
  { firstName: "", lastName: "", title: "Oficina General", org: "Law Offices of Ariadne Berrios, LLC", phone: "939-360-3000", email: "info@aberrioslaw.com" },
  { firstName: "Adrián", lastName: "Jiménez", title: "Contacto", org: "Sampol", phone: "787-504-4012", email: "ajcipreni@sampol.com" },
  { firstName: "Edwin", lastName: "Rodríguez", title: "CPA", org: "Edwin Rodríguez, CPA", phone: "", email: "edwinrodriguezcpa@gmail.com" },
  { firstName: "", lastName: "", title: "Oficina General", org: "ESCO Group", phone: "", email: "irios@escogroup.net" },
  { firstName: "", lastName: "Boada", title: "Dentista", org: "Consultorio Dental (Boada/Pagán)", phone: "", email: "boadaliana@gmail.com" },
  { firstName: "Luis", lastName: "Pagán", title: "Dentista", org: "Consultorio Dental (Boada/Pagán)", phone: "", email: "drluispagan@gmail.com" },
  { firstName: "", lastName: "", title: "Oficina General", org: "Vidal & Rodríguez", phone: "787-751-7610", email: "rocio@vyrmailpr.com" },
  { firstName: "", lastName: "", title: "Oficina General", org: "Asociación de Farmacias de la Comunidad de PR", phone: "787-758-6101", email: "afcpr@afcpr.net" },
];

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
  const fresh = { leads: defaultLeads.map(l => ({ ...l, _key: l._key || (l.phone + '|' + l.org) })), state: {} };
  return fresh;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const data = await readData();
  const results = [];
  let added = 0;

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
      quoteName: '',
      quoteNum: null,
      uuid: '',
      quoteUrl: '',
      created: new Date().toISOString().slice(0, 10),
      expiry: null,
      expired: false,
      daysSince: 0,
      monthly: 0,
      upfront: 0,
      status: 'pending',
    };
    data.leads.unshift(fullLead);
    if (!data.state[key]) data.state[key] = { result: 'pending', note: '' };
    added++;
    results.push({ org: lead.org, status: 'agregado' });
  }

  await redis.set(KEY, JSON.stringify(data));

  return res.status(200).json({
    ok: true,
    agregados: added,
    total_leads: data.leads.length,
    detalle: results,
  });
}
