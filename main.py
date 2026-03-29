from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import pyautogui
import subprocess
import pyttsx3
from datetime import datetime
import httpx
import json
import os
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── TTS ────────────────────────────────────────────────────────────────────────
engine = pyttsx3.init()

# ── GEMINI CONFIG ──────────────────────────────────────────────────────────────
# Leemos la clave desde el archivo api_key.txt para evitar bugs de Windows
GEMINI_API_KEY = ""
if os.path.exists("api_key.txt"):
    with open("api_key.txt", "r") as f:
        # .strip() elimina cualquier salto de línea, espacio o basura
        GEMINI_API_KEY = f.read().replace('"', '').replace("'", "").strip()

# Modelo oficial de Google
MODEL_NAME = "gemini-1.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent?key={GEMINI_API_KEY}"

SYSTEM_PROMPT = """Eres Jarvis, un asistente personal inteligente que corre en la PC del usuario.
Tu trabajo es entender lo que el usuario quiere en lenguaje natural y responder de forma útil y concisa.

Además, tienes acceso a acciones reales en la PC. Si el usuario quiere ejecutar alguna de estas acciones,
responde ÚNICAMENTE con un JSON válido y completo con este formato EXACTO:
{"action": "NOMBRE_ACCION", "response": "Lo que le dirás al usuario"}

Acciones disponibles:
- OPEN_CHROME: abrir Chrome o el navegador
- OPEN_SPOTIFY: abrir Spotify
- OPEN_VSCODE: abrir Visual Studio Code
- OPEN_NOTEPAD: abrir el bloc de notas
- OPEN_EXPLORER: abrir el explorador de archivos
- VOLUME_UP: subir el volumen
- VOLUME_DOWN: bajar el volumen
- VOLUME_MUTE: silenciar/desilenciar
- SCREENSHOT: tomar una captura de pantalla
- SHUTDOWN: apagar la PC
- SEARCH_GOOGLE: buscar en Google (incluye el término en search_query)
- SEARCH_YOUTUBE: buscar en YouTube (incluye el término en search_query)

Para SEARCH_GOOGLE y SEARCH_YOUTUBE el formato es:
{"action": "SEARCH_GOOGLE", "search_query": "lo que buscar", "response": "Buscando en Google..."}

IMPORTANTE: El JSON debe estar siempre completo y bien cerrado con }
Si la petición NO requiere ninguna acción de PC (es una pregunta, conversación, etc.),
responde SOLO con texto normal, sin JSON. Sé útil, conciso y amigable.
Habla siempre en español rioplatense."""

conversation_history = []

# ── GEMINI CALL ────────────────────────────────────────────────────────────────
async def ask_gemini(user_message: str) -> str:
    global conversation_history

    conversation_history.append({
        "role": "user",
        "parts": [{"text": user_message}]
    })

    recent = conversation_history[-20:]

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": recent,
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 500
        }
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.post(GEMINI_URL, json=payload)
        res.raise_for_status()
        data = res.json()

    reply = data["candidates"][0]["content"]["parts"][0]["text"].strip()

    conversation_history.append({
        "role": "model",
        "parts": [{"text": reply}]
    })

    return reply

# ── PARSE JSON ROBUSTO ────────────────────────────────────────────────────────
def try_parse_action(raw: str):
    clean = raw.strip()
    clean = re.sub(r'^```json\s*', '', clean)
    clean = re.sub(r'^```\s*', '', clean)
    clean = re.sub(r'\s*```$', '', clean)
    clean = clean.strip()

    if not clean.startswith("{"):
        return None

    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        pass

    match = re.search(r'\{.*?\}', clean, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    action_match   = re.search(r'"action"\s*:\s*"([^"]+)"', clean)
    response_match = re.search(r'"response"\s*:\s*"([^"]+)"', clean)
    query_match    = re.search(r'"search_query"\s*:\s*"([^"]+)"', clean)

    if action_match:
        result = {"action": action_match.group(1)}
        result["response"] = response_match.group(1) if response_match else "Ejecutando..."
        if query_match:
            result["search_query"] = query_match.group(1)
        return result

    return None

# ── PC ACTIONS ────────────────────────────────────────────────────────────────
def execute_action(action: str, search_query: str = "") -> None:
    if action == "OPEN_CHROME":
        subprocess.Popen(["start", "chrome"], shell=True)
    elif action == "OPEN_SPOTIFY":
        subprocess.Popen(["start", "spotify"], shell=True)
    elif action == "OPEN_VSCODE":
        subprocess.Popen(["code"], shell=True)
    elif action == "OPEN_NOTEPAD":
        subprocess.Popen(["notepad"], shell=True)
    elif action == "OPEN_EXPLORER":
        subprocess.Popen(["explorer"], shell=True)
    elif action == "VOLUME_UP":
        pyautogui.press("volumeup", presses=8)
    elif action == "VOLUME_DOWN":
        pyautogui.press("volumedown", presses=8)
    elif action == "VOLUME_MUTE":
        pyautogui.press("volumemute")
    elif action == "SCREENSHOT":
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        pyautogui.screenshot(f"screenshot_{ts}.png")
    elif action == "SHUTDOWN":
        subprocess.Popen("shutdown /s /t 10", shell=True)
    elif action == "SEARCH_GOOGLE":
        q = search_query.replace(" ", "+")
        subprocess.Popen(["start", f"https://www.google.com/search?q={q}"], shell=True)
    elif action == "SEARCH_YOUTUBE":
        q = search_query.replace(" ", "+")
        subprocess.Popen(["start", f"https://www.youtube.com/results?search_query={q}"], shell=True)

# ── ENDPOINTS ─────────────────────────────────────────────────────────────────

@app.get("/ping")
async def ping():
    return JSONResponse({"status": "ok"})

@app.post("/command")
async def command(request: Request):
    data = await request.json()
    text = data.get("text", "").strip()
    if not text:
        return JSONResponse({"response": "No te escuché bien, ¿podés repetir?"})

    try:
        raw = await ask_gemini(text)
    except Exception as e:
        return JSONResponse({"response": f"Error conectando con la IA: {e}"})

    response_text = raw
    parsed = try_parse_action(raw)
    action_executed = False
    if parsed:
        action        = parsed.get("action", "")
        response_text = parsed.get("response", "Ejecutando...")
        search_query  = parsed.get("search_query", "")
        if action:
            execute_action(action, search_query)
            action_executed = True

    try:
        engine.say(response_text)
        engine.runAndWait()
    except Exception:
        pass

    return JSONResponse({"response": response_text, "action_executed": action_executed})

@app.delete("/conversation")
async def clear_conversation():
    global conversation_history
    conversation_history = []
    return JSONResponse({"status": "Conversación reiniciada"})

@app.get("/")
async def serve_index():
    return FileResponse("index.html")

@app.get("/manifest.json")
async def serve_manifest():
    return FileResponse("manifest.json")

@app.get("/{filename}")
async def serve_file(filename: str):
    if os.path.exists(filename):
        return FileResponse(filename)
    return JSONResponse({"error": "Not found"}, status_code=404)

# ── MAIN ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 55)
    print("🤖  JARVIS AI  —  Powered by Gemini")
    print("=" * 55)
    print()
    if not GEMINI_API_KEY:
        print("⚠️  ATENCION: No se encontro la API KEY en api_key.txt.")
        print("   Por favor, ejecuta el archivo .bat para configurarla.")
        print()
    print("🚀  Backend local: http://127.0.0.1:8000")
    print()
    print("   Presioná Ctrl+C para detener")
    print()
    uvicorn.run(app, host="127.0.0.1", port=8000)