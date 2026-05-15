import { sealData } from 'iron-session';

const COOKIE = 'callsheet_session';
const PASSWORD = process.env.CALLSHEET_PASSWORD || 'conecta2024';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { password } = req.body;
  if (password !== PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const sealed = await sealData({ ok: true }, { password: process.env.SESSION_SECRET || 'conecta-secret-key-32-chars-min!!!' });
  res.setHeader('Set-Cookie', `${COOKIE}=${sealed}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
  return res.status(200).json({ ok: true });
}
