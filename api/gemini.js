// api/gemini.js
// Backend para JARVIS - Compatible con el frontend proporcionado

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
    // ✅ CORS headers para Vercel + tu dominio
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Método no permitido' });
    }

    // 🔑 Validación de API Keys
    if (GEMINI_API_KEYS.length === 0) {
        console.error("❌ GEMINI_API_KEYS no configuradas en Vercel");
        return res.status(500).json({ 
            success: false,
            error: "Configuración incompleta: GEMINI_API_KEY no definida" 
        });
    }

    // 📦 Validación del body (formato exacto que espera tu frontend)
    const { contents } = req.body || {};
    if (!contents || !Array.isArray(contents) || contents.length === 0) {
        return res.status(400).json({ 
            success: false,
            error: "Formato inválido: se requiere un array 'contents'" 
        });
    }

    const blockedKeys = new Set();
    
    // 🔄 Intentar con cada modelo y key disponible
    for (const modelName of MODELS) {
        const keysToTry = [...GEMINI_API_KEYS].filter(k => !blockedKeys.has(k));
        if (keysToTry.length === 0) continue;

        for (const apiKey of keysToTry) {
            let keyBlocked = false;
            
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
                    catch { continue; }

                    // ✅ Respuesta exitosa - formato exacto que espera tu frontend
                    if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                        return res.status(200).json({
                            success: true,
                            text: data.candidates[0].content.parts[0].text,
                            model: modelName
                        });
                    }

                    // 🚫 Contenido bloqueado por políticas
                    if (data.promptFeedback?.blockReason) {
                        return res.status(400).json({
                            success: false,
                            error: `Contenido bloqueado: ${data.promptFeedback.blockReason}`
                        });
                    }

                    const errMsg = data.error?.message || '';
                    const status = response.status;

                    // 🔒 Key inválida
                    if (errMsg.includes('API key') || errMsg.includes('leaked') || status === 401) {
                        blockedKeys.add(apiKey);
                        keyBlocked = true;
                        break;
                    }

                    // ❌ Modelo no encontrado → siguiente
                    if (status === 404 || errMsg.includes('not found')) {
                        continue;
                    }

                    // ⏳ Rate limit
                    if (status === 429) {
                        await new Promise(r => setTimeout(r, 1000));
                        continue;
                    }

                } catch (error) {
                    continue;
                }
            }
            if (keyBlocked) continue;
        }
    }

    // ❌ Todo falló - formato que tu frontend maneja
    return res.status(500).json({
        success: false,
        error: "No se pudo obtener respuesta de Gemini. Verificá tu API key en Vercel."
    });
}