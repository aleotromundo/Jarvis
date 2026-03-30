// api/chat.js — Vercel Serverless Function
// Mismo sistema de fallback de gemini.js que ya funciona

const GEMINI_API_KEYS = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
    process.env.GEMINI_KEY_4
].filter(Boolean);

const MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash"
];

const SYSTEM_PROMPT = `Eres Jarvis, un asistente personal inteligente.
Respondé en español rioplatense, de forma útil y concisa.
En este modo no tenés acceso a la PC del usuario (eso requiere tener el backend local corriendo).
Podés charlar, responder preguntas, ayudar con tareas, hacer cálculos, etc.`;

// Historial simple en memoria (dura lo que dure la instancia serverless)
let _history = [];

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();

    if (req.method === "DELETE") {
        _history = [];
        return res.status(200).json({ status: "ok" });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

    const text = req.body?.text?.trim();
    if (!text) return res.status(200).json({ response: "No te escuché bien, ¿podés repetir?" });

    if (GEMINI_API_KEYS.length === 0)
        return res.status(200).json({ response: "⚠️ Falta configurar GEMINI_KEY_1 en Vercel." });

    _history.push({ role: "user", parts: [{ text }] });
    const recent = _history.slice(-20);

    const payload = {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: recent,
        generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    };

    // Mismo sistema de fallback: modelos × keys (keys en orden aleatorio)
    for (const model of MODELS) {
        const keys = [...GEMINI_API_KEYS].sort(() => Math.random() - 0.5);
        for (const key of keys) {
            try {
                const r = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
                    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
                );
                const data = await r.json();
                if (r.ok && data.candidates) {
                    const reply = data.candidates[0].content.parts[0].text.trim();
                    _history.push({ role: "model", parts: [{ text: reply }] });
                    return res.status(200).json({ response: reply });
                }
            } catch (_) {}
        }
    }

    return res.status(200).json({ response: "Error: todas las claves API fallaron. Revisá las variables de entorno en Vercel." });
}
