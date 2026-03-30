// api/gemini.js
// Backend para chat con Gemini - Versión original corregida para Vercel

const GEMINI_API_KEYS = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
    process.env.GEMINI_KEY_4
].filter(k => k && k.trim() !== '');

// Tus modelos originales (gemini-1.5-flash primero para garantizar que funcione)
const MODELS = [
    "gemini-1.5-flash",
    "gemini-3-flash-preview",
    "gemini-3-pro",
    "gemini-3-flash-8b",
    "gemini-3-flash"
];

export default async function handler(req, res) {
    // ✅ CORS headers para Vercel
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // 🔑 Validación de API Keys
    if (GEMINI_API_KEYS.length === 0) {
        console.error("❌ GEMINI_API_KEYS no configuradas en Vercel");
        return res.status(500).json({ 
            success: false,
            error: "CONFIG_ERROR",
            message: "Configura GEMINI_KEY_1 en Vercel → Settings → Environment Variables" 
        });
    }

    // 📦 Validación del body
    const { contents } = req.body || {};
    if (!contents || !Array.isArray(contents) || contents.length === 0) {
        return res.status(400).json({ 
            success: false,
            error: "INVALID_REQUEST",
            message: "Formato esperado: { contents: [{ parts: [{ text: '...' }] }] }" 
        });
    }

    const blockedKeys = new Set();
    
    // 🔄 Intentar con cada modelo y key disponible
    for (const modelName of MODELS) {
        const keysToTry = [...GEMINI_API_KEYS].filter(k => !blockedKeys.has(k));
        
        if (keysToTry.length === 0) {
            console.warn(`⚠️ No hay keys disponibles para el modelo: ${modelName}`);
            continue;
        }

        for (const apiKey of keysToTry) {
            let keyBlocked = false;
            
            for (const apiVersion of ['v1beta', 'v1']) {
                try {
                    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${apiKey}`;
                    
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'User-Agent': 'Jarvis-App/1.0'
                        },
                        body: JSON.stringify({ contents }),
                        signal: AbortSignal.timeout(30000)
                    });

                    const raw = await response.text();
                    let data;
                    
                    try { 
                        data = JSON.parse(raw); 
                    } catch (parseError) {
                        console.warn(`⚠️ No se pudo parsear JSON de ${modelName}/${apiVersion}`);
                        continue;
                    }

                    // ✅ Respuesta exitosa
                    if (response.ok && data.candidates && data.candidates.length > 0) {
                        const text = data.candidates[0]?.content?.parts?.[0]?.text;
                        if (text) {
                            console.log(`✅ Éxito con modelo: ${modelName} (${apiVersion})`);
                            return res.status(200).json({
                                success: true,
                                text: text,
                                model: modelName
                            });
                        }
                    }

                    // 🚫 Contenido bloqueado por políticas de seguridad
                    if (data.promptFeedback && data.promptFeedback.blockReason) {
                        console.warn(`🚫 Contenido bloqueado: ${data.promptFeedback.blockReason}`);
                        return res.status(400).json({
                            success: false,
                            error: "CONTENT_BLOCKED",
                            reason: data.promptFeedback.blockReason
                        });
                    }

                    const errMsg = data.error?.message || '';
                    const status = response.status;

                    // 🔒 Key inválida → marcar como bloqueada
                    if (errMsg.includes('API key') || errMsg.includes('leaked') || status === 401) {
                        console.error(`🔒 Key inválida: ${apiKey.slice(0, 10)}...`);
                        blockedKeys.add(apiKey);
                        keyBlocked = true;
                        break;
                    }

                    // ❌ Modelo no encontrado → probar siguiente
                    if (status === 404 || errMsg.includes('not found')) {
                        console.warn(`⏭️ Modelo no disponible: ${modelName}/${apiVersion}`);
                        continue;
                    }

                    // ⏳ Rate limit → esperar y continuar
                    if (status === 429) {
                        console.warn(`⏳ Rate limit con ${modelName}/${apiVersion}`);
                        await new Promise(r => setTimeout(r, 1000));
                        continue;
                    }

                    // Otros errores
                    console.warn(`⚠️ Error ${status} con ${modelName}/${apiVersion}: ${errMsg}`);

                } catch (error) {
                    console.warn(`💥 Excepción con ${modelName}/${apiVersion}: ${error.message}`);
                    continue;
                }
            }
            
            if (keyBlocked) {
                continue;
            }
        }
    }

    // ❌ Si llegamos acá, todo falló
    console.error("❌ Todos los intentos a Gemini fallaron");
    return res.status(500).json({
        success: false,
        error: "GEMINI_UNAVAILABLE",
        message: "No se pudo conectar con Gemini. Verificá tu API key en Vercel."
    });
}