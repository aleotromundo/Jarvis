// api/gemini.js
// Esta función se ejecuta en el servidor de Vercel, NO en el navegador

const GEMINI_API_KEYS = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
    process.env.GEMINI_KEY_4
].filter(Boolean);

const MODELS = [
    "gemini-3-flash-preview",
    "gemini-3-pro",
    "gemini-3-flash-8b",
    "gemini-3-flash",
    "gemini-1.5-flash"
];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { contents } = req.body;

    if (!contents || !Array.isArray(contents)) {
        return res.status(400).json({ error: 'Formato inválido' });
    }

    const blockedKeys = new Set();

    for (let modelName of MODELS) {
        let keys = [...GEMINI_API_KEYS]
            .filter(k => !blockedKeys.has(k))
            .sort(() => Math.random() - 0.5);

        if (keys.length === 0) break;

        for (let key of keys) {
            const apiVersions = ['v1beta', 'v1'];
            let keyBlocked = false;

            for (let ver of apiVersions) {
                try {
                    const response = await fetch(
                        `https://generativelanguage.googleapis.com/${ver}/models/${modelName}:generateContent?key=${key}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ contents })
                        }
                    );

                    const data = await response.json();

                    if (response.ok && data.candidates) {
                        return res.status(200).json({
                            success: true,
                            text: data.candidates[0].content.parts[0].text,
                            model: modelName
                        });
                    }

                    const errMsg = data.error?.message || '';

                    if (response.status === 429) {
                        console.warn(`⏳ Rate limit: clave ${key.slice(0, 10)}... modelo ${modelName}/${ver}`);
                        await new Promise(r => setTimeout(r, 300));
                        continue; // prueba v1 si estaba en v1beta, o pasa a siguiente clave
                    }

                    if (errMsg.includes('leaked') || errMsg.includes('API_KEY_INVALID') || response.status === 400) {
                        console.error(`🔒 Clave inválida/bloqueada: ${key.slice(0, 10)}...`);
                        blockedKeys.add(key);
                        keyBlocked = true;
                        break;
                    }

                    if (response.status === 404) {
                        console.warn(`❌ Modelo no encontrado: ${modelName}/${ver}`);
                        break; // prueba v1, si ya es v1 pasa al siguiente modelo
                    }

                    console.warn(`⚠️ Error ${response.status} con ${modelName}/${ver}: ${errMsg}`);

                } catch (error) {
                    console.error(`💥 Excepción con ${modelName}/${ver}:`, error.message);
                }
            }

            if (keyBlocked) continue;
        }
    }

    return res.status(500).json({
        success: false,
        error: 'Todas las claves API están agotadas o bloqueadas'
    });
}
