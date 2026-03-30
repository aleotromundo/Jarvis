// api/gemini.js
// Esta función se ejecuta en el servidor de Vercel, NO en el navegador

const GEMINI_API_KEYS = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3
].filter(Boolean); // Elimina undefined

const MODELS = [
    "gemini-3-flash-preview",
    "gemini-3-pro",
    "gemini-3-flash-8b",
    "gemini-3-flash",
    "gemini-1.5-flash"
];

const SYSTEM_PROMPT = `Eres Jarvis, un asistente personal inteligente que corre en la PC del usuario.
Tu trabajo es entender lo que el usuario quiere en lenguaje natural y responder de forma útil y concisa.
Respondé siempre en español rioplatense. Sé directo, amigable y preciso.`;

export default async function handler(req, res) {
    // Solo permitir POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { contents } = req.body;

    if (!contents || !Array.isArray(contents)) {
        return res.status(400).json({ error: 'Formato inválido' });
    }

    // Intentar con cada modelo y cada clave
    for (let modelName of MODELS) {
        let keys = [...GEMINI_API_KEYS].sort(() => Math.random() - 0.5);
        
        for (let key of keys) {
            const apiVersions = ['v1beta', 'v1'];
            
            for (let ver of apiVersions) {
                try {
                    const response = await fetch(
                        `https://generativelanguage.googleapis.com/${ver}/models/${modelName}:generateContent?key=${key}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
                                contents
                            })
                        }
                    );

                    const data = await response.json();

                    if (response.ok && data.candidates) {
                        return res.status(200).json({
                            success: true,
                            text: data.candidates[0].content.parts[0].text,
                            model: modelName
                        });
                    } else if (data.error?.message.includes("leaked")) {
                        console.error(`🔒 Clave bloqueada: ${key.slice(0, 10)}...`);
                        break; // Saltar a la siguiente clave
                    }
                } catch (error) {
                    console.error(`Error con ${modelName}:`, error.message);
                }
            }
        }
    }

    // Si llegamos aquí, todas las claves fallaron
    return res.status(500).json({ 
        success: false, 
        error: 'Todas las claves API están agotadas o bloqueadas' 
    });
}