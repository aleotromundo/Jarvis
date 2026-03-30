// api/gemini.js
// Esta función se ejecuta en el servidor de Vercel, NO en el navegador

const GEMINI_API_KEYS = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
    process.env.GEMINI_KEY_4
].filter(Boolean);

// 🔒 Tus modelos originales - SIN CAMBIOS
const MODELS = [
    "gemini-3-flash-preview",
    "gemini-3-pro",
    "gemini-3-flash-8b",
    "gemini-3-flash",
    "gemini-1.5-flash"
];

export default async function handler(req, res) {
    // ✅ Validación de método HTTP
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // ✅ Validación crítica: API Keys configuradas
    if (GEMINI_API_KEYS.length === 0) {
        console.error("🔑 CRÍTICO: No hay API keys de Gemini configuradas en Vercel");
        return res.status(500).json({ 
            error: "Configuración incompleta: GEMINI_API_KEY no definida en variables de entorno" 
        });
    }

    // ✅ Validación del body
    const { contents } = req.body;
    if (!contents || !Array.isArray(contents) || contents.length === 0) {
        return res.status(400).json({ 
            error: 'Formato inválido: se requiere un array "contents" no vacío' 
        });
    }

    const blockedKeys = new Set();
    let lastError = null;
    let attempts = 0;

    for (let modelName of MODELS) {
        // Filtrar keys no bloqueadas y aleatorizar orden
        let keys = [...GEMINI_API_KEYS]
            .filter(k => k && !blockedKeys.has(k))
            .sort(() => Math.random() - 0.5);

        if (keys.length === 0) {
            console.warn(`⚠️ Sin keys disponibles para el modelo: ${modelName}`);
            continue;
        }

        for (let key of keys) {
            const apiVersions = ['v1beta', 'v1'];
            let keyBlocked = false;

            for (let ver of apiVersions) {
                attempts++;
                try {
                    const url = `https://generativelanguage.googleapis.com/${ver}/models/${modelName}:generateContent?key=${key}`;
                    
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'User-Agent': 'Jarvis-App/1.0'
                        },
                        body: JSON.stringify({ contents }),
                        signal: AbortSignal.timeout(30000) // ⏱️ Timeout de 30s
                    });

                    // ✅ Intentar parsear JSON de forma segura
                    let data;
                    try {
                        data = await response.json();
                    } catch (parseError) {
                        console.warn(`⚠️ No se pudo parsear JSON de respuesta: ${response.status}`);
                        lastError = { message: 'Respuesta no es JSON válido', status: response.status };
                        continue;
                    }

                    // ✅ Respuesta exitosa con validación defensiva
                    if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                        console.log(`✅ Éxito con modelo: ${modelName} (versión: ${ver})`);
                        return res.status(200).json({
                            success: true,
                            text: data.candidates[0].content.parts[0].text,
                            model: modelName,
                            attempts
                        });
                    }

                    // ✅ Manejo de bloqueos por seguridad (content policy)
                    if (data.promptFeedback?.blockReason) {
                        console.warn(`🚫 Contenido bloqueado por seguridad (${modelName}): ${data.promptFeedback.blockReason}`);
                        return res.status(400).json({
                            error: 'Contenido bloqueado por políticas de seguridad',
                            reason: data.promptFeedback.blockReason,
                            model: modelName
                        });
                    }

                    const errMsg = data.error?.message || response.statusText || 'Sin mensaje de error';
                    const status = response.status;

                    // ✅ Manejo de rate limit (429)
                    if (status === 429) {
                        console.warn(`⏳ Rate limit: clave ${key.slice(0, 8)}... modelo ${modelName}/${ver}`);
                        lastError = { status, message: 'Rate limit', model: modelName };
                        await new Promise(r => setTimeout(r, 800)); // Espera más larga para rate limit
                        continue;
                    }

                    // ✅ Keys inválidas o revocadas
                    if (errMsg.includes('leaked') || 
                        errMsg.includes('API_KEY_INVALID') || 
                        errMsg.includes('API key not valid') ||
                        status === 401) {
                        console.error(`🔒 Clave inválida/revocada: ${key.slice(0, 8)}...`);
                        blockedKeys.add(key);
                        keyBlocked = true;
                        lastError = { status, message: errMsg, model: modelName };
                        break; // Salir del loop de versiones para esta key
                    }

                    // ✅ Modelo no encontrado (404) - probar otra versión de API
                    if (status === 404) {
                        console.warn(`❌ Modelo/ruta no encontrada: ${modelName}/${ver}`);
                        lastError = { status, message: errMsg, model: modelName, version: ver };
                        continue; // Probar la otra versión (v1 si estaba en v1beta)
                    }

                    // ✅ Otros errores HTTP
                    lastError = { status, message: errMsg, model: modelName, version: ver };
                    console.warn(`⚠️ Error ${status} con ${modelName}/${ver}: ${errMsg}`);

                } catch (error) {
                    // ✅ Errores de red, timeout, etc.
                    lastError = { 
                        message: error.message || error.toString(), 
                        model: modelName,
                        type: error.name 
                    };
                    
                    if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
                        console.warn(`⏱️ Timeout con ${modelName}`);
                    } else {
                        console.error(`💥 Excepción con ${modelName}:`, error.message);
                    }
                }
            }
            if (keyBlocked) continue;
        }
    }

    // ❌ Logging detallado del fallo final (solo en servidor)
    console.error(`❌ FALLÓ TODAS LAS PETICIONES. Resumen:
  - Models intentados: ${MODELS.join(', ')}
  - Keys configuradas: ${GEMINI_API_KEYS.length}
  - Keys bloqueadas: ${blockedKeys.size}
  - Total de intentos: ${attempts}
  - Último error: ${JSON.stringify(lastError)}
  - Request preview: ${JSON.stringify(contents).slice(0, 150)}...
`);

    // ✅ Respuesta de error clara para el frontend
    return res.status(500).json({
        success: false,
        error: 'No se pudo obtener respuesta de Gemini. Intenta nuevamente o contacta al administrador.',
        debug: process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview' 
            ? { lastError, attempts, blockedKeys: blockedKeys.size } 
            : undefined
    });
}