// api/gemini.js
// Backend para chat con Gemini - Versión robusta y lista para producción

const GEMINI_API_KEYS = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
    process.env.GEMINI_KEY_4
].filter(k => k && k.trim() !== '' && k.startsWith('AIzaSy'));

// Tus modelos originales (gemini-1.5-flash primero como fallback garantizado)
const MODELS = [
    "gemini-1.5-flash",
    "gemini-3-flash-preview",
    "gemini-3-pro",
    "gemini-3-flash-8b",
    "gemini-3-flash"
];

export default async function handler(req, res) {
    // ✅ CORS headers para Vercel
    res.setHeader('Access-Control-Allow-Origin', 'https://jarvis-mu-five.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    // 🔑 Validación de API Keys
    if (GEMINI_API_KEYS.length === 0) {
        console.error("❌ GEMINI_API_KEYS no configuradas en Vercel");
        return res.status(500).json({ 
            error: "CONFIG_ERROR",
            message: "Configura GEMINI_KEY_1 en Vercel → Settings → Environment Variables" 
        });
    }

    // 📦 Validación del body
    const { contents } = req.body || {};
    if (!contents?.[0]?.parts?.[0]?.text) {
        return res.status(400).json({ 
            error: "INVALID_REQUEST",
            message: "Formato esperado: { contents: [{ parts: [{ text: '...' }] }] }" 
        });
    }

    const blockedKeys = new Set();
    
    // 🔄 Intentar con cada modelo y key disponible
    for (const modelName of MODELS) {
        for (const apiKey of GEMINI_API_KEYS) {
            if (blockedKeys.has(apiKey)) continue;
            
            for (const apiVersion of ['v1beta', 'v1']) {
                try {
                    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${apiKey}`;
                    
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents }),
                        signal: AbortSignal.timeout(30000)
                    });

                    const raw = await response.text();
                    let data;
                    
                    try { data = JSON.parse(raw); } 
                    catch { 
                        if (response.ok && raw.includes('candidates')) continue;
                        continue; 
                    }

                    // ✅ Respuesta exitosa
                    if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                        return res.status(200).json({
                            success: true,
                            text: data.candidates[0].content.parts[0].text,
                            model: modelName
                        });
                    }

                    // 🚫 Contenido bloqueado por políticas de seguridad
                    if (data.promptFeedback?.blockReason) {
                        return res.status(400).json({
                            error: "CONTENT_BLOCKED",
                            reason: data.promptFeedback.blockReason
                        });
                    }

                    const errMsg = data.error?.message || '';
                    const status = response.status;

                    // 🔒 Key inválida → marcar como bloqueada
                    if (errMsg.includes('API key') || errMsg.includes('leaked') || status === 401) {
                        blockedKeys.add(apiKey);
                        break;
                    }

                    // ❌ Modelo no encontrado → probar siguiente
                    if (status === 404 || errMsg.includes('not found')) {
                        continue;
                    }

                    // ⏳ Rate limit → esperar y continuar
                    if (status === 429) {
                        await new Promise(r => setTimeout(r, 1000));
                        continue;
                    }

                } catch (error) {
                    // Errores de red/timeout → continuar con siguiente intento
                    if (error.name !== 'AbortError') {
                        console.warn(`⚠️ Error con ${modelName}:`, error.message);
                    }
                    continue;
                }
            }
        }
    }

    // ❌ Si llegamos acá, todo falló
    console.error("❌ Todos los intentos a Gemini fallaron");
    return res.status(500).json({
        error: "GEMINI_UNAVAILABLE",
        message: "No se pudo conectar con Gemini. Intenta nuevamente en unos segundos."
    });
}