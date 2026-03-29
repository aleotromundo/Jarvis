"""
api/chat.py  —  Vercel Serverless Function
Maneja el chat cloud-only (sin acciones de PC).
Las acciones de PC las sigue manejando main.py local vía ngrok.
"""
from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.error

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
)

SYSTEM_PROMPT = """Eres Jarvis, un asistente personal inteligente.
Respondé en español rioplatense, de forma útil y concisa.
En este modo no tenés acceso a la PC del usuario (eso requiere tener el backend local corriendo).
Podés charlar, responder preguntas, ayudar con tareas, hacer cálculos, etc."""

# Historial en memoria (dura lo que dure el proceso serverless — Vercel puede reiniciarlo)
_history = []


class handler(BaseHTTPRequestHandler):

    def log_message(self, *args):
        pass  # silenciar logs de acceso

    def _send(self, status: int, body: dict):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_DELETE(self):
        global _history
        _history = []
        self._send(200, {"status": "ok"})

    def do_POST(self):
        global _history
        length = int(self.headers.get("Content-Length", 0))
        body   = json.loads(self.rfile.read(length) or b"{}")
        text   = body.get("text", "").strip()

        if not text:
            self._send(200, {"response": "No te escuché bien, ¿podés repetir?"})
            return

        if not GEMINI_API_KEY:
            self._send(200, {"response": "⚠️ Falta configurar GEMINI_API_KEY en Vercel."})
            return

        _history.append({"role": "user", "parts": [{"text": text}]})
        recent = _history[-20:]

        payload = json.dumps({
            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": recent,
            "generationConfig": {"temperature": 0.7, "maxOutputTokens": 500}
        }).encode()

        req = urllib.request.Request(
            GEMINI_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                data  = json.loads(r.read())
            reply = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except urllib.error.HTTPError as e:
            err = e.read().decode()
            reply = f"Error de Gemini ({e.code}): {err[:200]}"
        except Exception as e:
            reply = f"Error inesperado: {e}"

        _history.append({"role": "model", "parts": [{"text": reply}]})
        self._send(200, {"response": reply})
