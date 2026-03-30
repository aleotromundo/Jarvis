// api/gemini.js - VERSIÓN DIAGNÓSTICO COMPLETO
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const keys = [
        process.env.GEMINI_KEY_1,
        process.env.GEMINI_KEY_2,
        process.env.GEMINI_KEY_3,
        process.env.GEMINI_KEY_4
    ].filter(k => k && k.trim() !== '');

    // 🚨 LOG CRÍTICO: ¿Hay keys?
    console.log("=== 🔍 GEMINI DEBUG START ===");
    console.log("Keys configuradas:", keys.length);
    console.log("Primera key (preview):", keys[0]?.slice(0, 12) + '...');
    console.log("VERCEL_ENV:", process.env.VERCEL_ENV);
    console.log("NODE_ENV:", process.env.NODE_ENV);

    if (keys.length === 0) {
        console.error("❌ NO HAY API KEYS CONFIGURADAS");
        return res.status(500).json({
            error: "NO_API_KEYS",
            message: "Agrega GEMINI_KEY_1 en Vercel → Settings → Environment Variables"
        });
    }

    const { contents } = req.body;
    if (!contents?.[0]?.parts?.[0]?.text) {
        return res.status(400).json({ error: "INVALID_BODY", expected: '{contents:[{parts:[{text:"..."}]}]}' });
    }

    const MODELS = [
        "gemini-3-flash-preview",
        "gemini-3-pro",
        "gemini-3-flash-8b", 
        "gemini-3-flash",
        "gemini-1.5-flash"
    ];

    const errorsLog = [];
    const key = keys[0]; // Test con la primera key

    for (let model of MODELS) {
        for (let ver of ['v1beta', 'v1']) {
            const url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${key}`;
            
            try {
                console.log(`📡 Request: POST ${url.slice(0, 80)}...`);
                const start = Date.now();
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents }),
                    signal: AbortSignal.timeout(25000)
                });
                
                const duration = Date.now() - start;
                const rawText = await response.text();
                
                console.log(`⏱️ ${duration}ms | Status: ${response.status}`);
                
                // Parsear respuesta
                let data;
                try { data = JSON.parse(rawText); } 
                catch (e) {
                    console.warn(`❌ No es JSON: ${rawText.slice(0, 200)}`);
                    errorsLog.push({ model, version: ver, status: response.status, error: 'INVALID_JSON', raw: rawText.slice(0, 100) });
                    continue;
                }

                // ✅ Éxito
                if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    console.log(`✅ SUCCESS con ${model} (${ver})`);
                    return res.status(200).json({
                        success: true,
                        text: data.candidates[0].content.parts[0].text,
                        model,
                        version: ver
                    });
                }

                // ❌ Capturar error específico de Gemini
                const geminiError = data.error || data.promptFeedback;
                const errorMsg = geminiError?.message || geminiError?.blockReason || rawText.slice(0, 150);
                
                console.warn(`⚠️ FALLÓ ${model} (${ver}):`, errorMsg);
                errorsLog.push({ model, version: ver, status: response.status, error: errorMsg });

            } catch (err) {
                console.error(`💥 EXCEPTION ${model} (${ver}):`, err.name, err.message);
                errorsLog.push({ model, version: ver, error: `${err.name}: ${err.message}` });
            }
        }
    }

    // 🚨 Si llegamos acá: TODO FALLÓ - Mostrar resumen completo
    console.error("=== ❌ ALL_ATTEMPTS_FAILED ===");
    console.error("Resumen de errores:", JSON.stringify(errorsLog, null, 2));
    
    return res.status(500).json({
        error: "ALL_ATTEMPTS_FAILED",
        message: "Todos los intentos fallaron. Revisa los logs de Vercel.",
        debug: process.env.VERCEL_ENV !== 'production' ? { errors: errorsLog } : undefined
    });
}