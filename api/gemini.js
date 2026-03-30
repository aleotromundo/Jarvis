// api/gemini.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const key = process.env.GEMINI_KEY_1;
  if (!key) return res.status(500).json({ error: 'Sin API key' });

  const { contents } = req.body || {};
  
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: contents || [{ parts: [{ text: 'Hola' }] }] })
      }
    );
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(500).json({ error: 'Sin respuesta', raw: data });
    
    return res.status(200).json({ success: true, text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}