// api/gemini.js - VERSIÓN MÍNIMA Y DIRECTA
export default async function handler(req, res) {
    // CORS básico
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    // 🔑 Tu API Key (la primera configurada)
    const apiKey = process.env.GEMINI_KEY_1;
    
    if (!apiKey) {
        return res.status(500).json({ error: "NO_API_KEY", message: "Configura GEMINI_KEY_1 en Vercel" });
    }

    // 📦 Body mínimo
    const { contents } = req.body || {};
    const prompt = contents?.[0]?.parts?.[0]?.text || "Hola";

    // 🎯 Solo gemini-1.5-flash (el que SÍ existe y funciona)
    const model = "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const raw = await response.text();
        
        // ❌ Si no es 200, devolver el error EXACTO de Gemini
        if (!response.ok) {
            console.error("❌ Gemini error:", raw);
            return res.status(response.status).json({
                error: "GEMINI_API_ERROR",
                status: response.status,
                message: raw
            });
        }

        // ✅ Parsear respuesta exitosa
        const data = JSON.parse(raw);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
            return res.status(500).json({ error: "EMPTY_RESPONSE", raw: data });
        }

        return res.status(200).json({ success: true, text, model });

    } catch (err) {
        console.error("💥 Network error:", err.message);
        return res.status(500).json({ error: "NETWORK_ERROR", message: err.message });
    }
}