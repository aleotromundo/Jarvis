// api/gemini.js - VERSIÓN DEBUG (solo para diagnosticar)
export default async function handler(req, res) {
    // Solo POST
    if (req.method !== 'POST') return res.status(405).end();

    // 🔑 VERIFICAR KEYS
    const keys = [
        process.env.GEMINI_KEY_1,
        process.env.GEMINI_KEY_2,
        process.env.GEMINI_KEY_3,
        process.env.GEMINI_KEY_4
    ].filter(Boolean);

    console.log("🔍 DEBUG:", {
        keysCount: keys.length,
        firstKeyPreview: keys[0]?.slice(0, 10) + '...',
        vercelEnv: process.env.VERCEL_ENV,
        bodyReceived: !!req.body
    });

    if (keys.length === 0) {
        return res.status(500).json({
            error: "NO_API_KEYS",
            message: "Configura GEMINI_KEY_1 en Vercel → Settings → Environment Variables"
        });
    }

    const { contents } = req.body;
    if (!contents?.length) {
        return res.status(400).json({ error: "BODY_INVALID" });
    }

    // 🎯 Tus modelos (sin cambios)
    const MODELS = [
        "gemini-3-flash-preview",
        "gemini-3-pro", 
        "gemini-3-flash-8b",
        "gemini-3-flash",
        "gemini-1.5-flash"
    ];

    const key = keys[0]; // Usamos la primera para test

    for (let model of MODELS) {
        for (let ver of ['v1beta', 'v1']) {
            try {
                console.log(`📡 Probando: ${model} (${ver})`);
                
                const start = Date.now();
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${key}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents }),
                        signal: AbortSignal.timeout(20000)
                    }
                );
                const duration = Date.now() - start;
                
                const raw = await response.text();
                console.log(`⏱️ ${duration}ms | Status: ${response.status}`);

                // Intentar parsear
                let data;
                try { data = JSON.parse(raw); } 
                catch { 
                    console.warn("❌ Respuesta no es JSON:", raw.slice(0, 200));
                    continue; 
                }

                // ✅ Éxito
                if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    console.log("✅ Éxito con", model);
                    return res.status(200).json({
                        success: true,
                        text: data.candidates[0].content.parts[0].text,
                        model,
                        debug: { duration, version: ver }
                    });
                }

                // ❌ Error específico
                console.warn(`⚠️ ${model} (${ver}):`, data.error?.message || raw.slice(0, 150));
                
            } catch (err) {
                console.error(`💥 Excepción ${model}:`, err.message);
            }
        }
    }

    // Si llegamos acá, todo falló
    return res.status(500).json({
        error: "ALL_ATTEMPTS_FAILED",
        message: "Revisa los logs de Vercel para más detalles"
    });
}