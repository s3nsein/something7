"""
Frontier Labs: a small Python server for the website.

It serves the site and passes questions to an AI for you, so your API key stays on your computer and never
goes into the page code. Only the Python standard library is needed (Python 3.9 or newer).

Pick ONE AI (or none):

  Claude (Anthropic)
      Mac/Linux:  export ANTHROPIC_API_KEY=your_key          Windows:  set ANTHROPIC_API_KEY=your_key

  Any OpenAI-compatible service (OpenAI, Groq, Together, OpenRouter, LM Studio ...)
      export OPENAI_API_KEY=your_key
      export OPENAI_BASE_URL=https://api.openai.com/v1      (the service's base URL)
      export AI_MODEL=the-model-name                         (required: the model to use)

  A free model on your own computer with Ollama (https://ollama.com), no key needed
      ollama pull llama3.1
      export OPENAI_BASE_URL=http://localhost:11434/v1
      export AI_MODEL=llama3.1

Then run   python server.py   in this folder and open http://localhost:8000
The page finds the server by itself and turns on the AI assessment, legend reading and Marvin-AI.
With no AI set, everything still works: the built-in assessment, and Marvin-AI's built-in mode.

Optional: AI_NAME=Llama   changes the name the page shows for the AI (default "Claude", or "AI" for other services).
          PORT=8000        changes the port.

Routes:
    GET  /api/health   {"ai": bool, "claude": bool, "name": str}
    POST /api/claude   {"prompt": str, "image"?: {"base64": str, "mediaType": str}}  ->  {"text": str}
    POST /api/helper   {"messages": [{"role", "content"}], "context": {...}}          ->  {"reply": str}
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8000"))
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE = os.environ.get("OPENAI_BASE_URL", "").rstrip("/")
if ANTHROPIC_KEY:
    PROVIDER, MODEL, AI_NAME = "anthropic", os.environ.get("AI_MODEL", "claude-sonnet-5-5"), os.environ.get("AI_NAME", "Claude")
elif OPENAI_BASE or OPENAI_KEY:
    PROVIDER, MODEL, AI_NAME = "openai", os.environ.get("AI_MODEL", ""), os.environ.get("AI_NAME", "AI")
    OPENAI_BASE = OPENAI_BASE or "https://api.openai.com/v1"
    if not MODEL:
        sys.exit("Set AI_MODEL to the model name for your service, for example: export AI_MODEL=llama3.1")
else:
    PROVIDER, MODEL, AI_NAME = None, "", "Claude"
MAX_BODY = 12 * 1024 * 1024          # map images can be a few MB
MAX_TURNS, MAX_CHARS = 12, 2000      # limits for the Marvin-AI chat
REFUSE = "[[REFUSE]]"                # the page turns this into "I'm afraid I can't answer that" in the chosen language

# Reuse the writing rules from the Python engine when it is next to this folder (../python/analog_engine.py).
sys.path.insert(0, os.path.join(HERE, "..", "python"))
try:
    from analog_engine import tidy_text
except ImportError:
    tidy_text = lambda t: t  # noqa: E731

# Marvin-AI never curses. Same word list as the page (js/app.js).
PROFANITY = re.compile(r"\b(f+u+c+k\w*|f+[*@#]+k\w*|wtf|stfu|fml|motherf\w*|sh[i1]+t\w*|bullsh\w*|b[i1]tch\w*|bastard\w*|a+ss+h[o0]le\w*|dumbass\w*|jackass\w*|asshat\w*|damn\w*|goddam\w*|crap\w*|hell|piss\w*|d[i1]ck(s|head\w*)?|c[o0]cks?|cunt\w*|tw[a@]t\w*|wh[o0]re\w*|slut\w*|pricks?|bollocks|wank\w*)\b", re.I)


def helper_guide():
    """Marvin-AI's instructions live in one place, js/app.js, so the page and this server always agree."""
    try:
        src = open(os.path.join(HERE, "js", "app.js"), encoding="utf-8").read()
        m = re.search(r"const HELPER_GUIDE = `([\s\S]*?)`;", src)
        if m:
            return m.group(1)
    except OSError:
        pass
    return ("You are Marvin-AI, the statistics helper inside Frontier Labs. Explain the person's results in plain, "
            "friendly words using only the numbers given. Never curse. If a message is off topic or inappropriate, reply with exactly [[REFUSE]].")


def post_json(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"content-type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"AI service error {e.code}: {e.read().decode(errors='replace')[:300]}")


def ask_ai(messages, system=None, max_tokens=2000, image=None):
    """messages: [{'role': 'user'|'assistant', 'content': str}]. image (optional) goes with the last message."""
    if PROVIDER == "anthropic":
        msgs = [dict(m) for m in messages]
        if image:
            msgs[-1]["content"] = [{"type": "image", "source": {"type": "base64", "media_type": image["mediaType"], "data": image["base64"]}},
                                   {"type": "text", "text": msgs[-1]["content"]}]
        body = {"model": MODEL, "max_tokens": max_tokens, "messages": msgs}
        if system:
            body["system"] = system
        j = post_json("https://api.anthropic.com/v1/messages", body, {"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01"})
        return "".join(b.get("text", "") for b in j.get("content", []) if b.get("type") == "text")
    if PROVIDER == "openai":
        msgs = ([{"role": "system", "content": system}] if system else []) + [dict(m) for m in messages]
        if image:
            msgs[-1]["content"] = [{"type": "text", "text": msgs[-1]["content"]},
                                   {"type": "image_url", "image_url": {"url": f"data:{image['mediaType']};base64,{image['base64']}"}}]
        j = post_json(f"{OPENAI_BASE}/chat/completions", {"model": MODEL, "max_tokens": max_tokens, "messages": msgs},
                      {"authorization": f"Bearer {OPENAI_KEY}"} if OPENAI_KEY else {})
        return (j.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    raise RuntimeError("No AI is set up on the server.")


def clean_history(messages):
    """Keep the last few turns, plain text only, starting with the person and alternating roles."""
    out = []
    for m in (messages or [])[-MAX_TURNS:]:
        role = m.get("role") if isinstance(m, dict) else None
        text = str(m.get("content", ""))[:MAX_CHARS].strip() if role else ""
        if role not in ("user", "assistant") or not text:
            continue
        if out and out[-1]["role"] == role:
            out[-1]["content"] += "\n\n" + text
        else:
            out.append({"role": role, "content": text})
    while out and out[0]["role"] != "user":
        out.pop(0)
    if not out or out[-1]["role"] != "user":
        raise ValueError("The last message must come from the person.")
    return out


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=HERE, **kw)

    def send_json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        route = self.path.split("?")[0]
        if route == "/api/health":
            return self.send_json(200, {"ai": bool(PROVIDER), "claude": bool(PROVIDER), "name": AI_NAME})
        if route.endswith(".py"):     # don't serve the server's own code
            return self.send_error(404)
        return super().do_GET()

    def do_POST(self):
        route = self.path.split("?")[0]
        if route not in ("/api/claude", "/api/helper"):
            return self.send_error(404)
        if not PROVIDER:
            return self.send_json(503, {"error": "No AI is set up on the server. See the top of server.py."})
        size = int(self.headers.get("content-length") or 0)
        if size > MAX_BODY:
            return self.send_json(413, {"error": "Request too large."})
        try:
            req = json.loads(self.rfile.read(size) or b"{}")
            if route == "/api/claude":
                return self.send_json(200, {"text": ask_ai([{"role": "user", "content": str(req.get("prompt", ""))}], image=req.get("image"))})
            history = clean_history(req.get("messages"))
            if PROFANITY.search(history[-1]["content"]):
                return self.send_json(200, {"reply": REFUSE})
            context = req.get("context") or {}
            language = str(context.get("language") or "English")[:40]
            system = f"{helper_guide()}\n\nReply in {language}.\n\nPAGE STATE (JSON):\n{json.dumps(context)[:60000]}"
            reply = ask_ai(history, system=system, max_tokens=800).strip()
            if REFUSE in reply:
                return self.send_json(200, {"reply": REFUSE})
            if PROFANITY.search(reply):   # a reply with a curse is thrown away: the page then uses Marvin-AI's built-in answer
                return self.send_json(200, {"reply": ""})
            return self.send_json(200, {"reply": tidy_text(reply)})
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        except Exception as e:   # network or AI problem: report it, keep the server running
            return self.send_json(502, {"error": str(e)[:400]})

    def log_message(self, fmt, *args):
        if "/api/" in str(args[0] if args else "") or fmt.startswith("code"):
            sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    print(f"Frontier Labs on http://localhost:{PORT}")
    print(f"AI: {AI_NAME} ({PROVIDER}, model {MODEL})" if PROVIDER else "AI: off. Marvin-AI uses its built-in mode. See the top of server.py to connect one.")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
