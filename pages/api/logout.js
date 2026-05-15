export default function handler(req, res) {
  res.setHeader('Set-Cookie', `callsheet_session=; Path=/; HttpOnly; Max-Age=0`);
  res.status(200).json({ ok: true });
}
