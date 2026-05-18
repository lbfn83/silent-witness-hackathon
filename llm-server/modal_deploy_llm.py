import os
import subprocess
import time

import modal

APP_NAME = "silent-witness-llm-function-calling"
MODEL = os.getenv("LLM_MODEL", "gemma4:e2b")
OLLAMA_URL = "http://127.0.0.1:11434"
ROOT = os.path.dirname(os.path.abspath(__file__))

app = modal.App(APP_NAME)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("curl", "ca-certificates", "zstd")
    .run_commands("curl -fsSL https://ollama.com/install.sh | sh")
    .pip_install(
        "fastapi==0.115.0",
        "uvicorn[standard]==0.32.0",
        "httpx==0.27.2",
        "pydantic==2.9.2",
    )
    .add_local_file(
        os.path.join(ROOT, "main.py"),
        "/app/main.py",
    )
    .add_local_dir(
        os.path.join(ROOT, "prompts"),
        "/app/prompts",
    )
)

ollama_cache = modal.Volume.from_name("silent-witness-llm-cache", create_if_missing=True)


def _wait_for_ollama(httpx):
    for _ in range(90):
        try:
            r = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=2)
            if r.status_code == 200:
                return
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError("Ollama did not become ready")


@app.function(
    image=image,
    gpu="L4",
    volumes={"/root/.ollama": ollama_cache},
    timeout=3600,
    startup_timeout=900,
    scaledown_window=300,
)
@modal.asgi_app(label="llm")
def serve():
    import httpx
    import sys

    env = os.environ.copy()
    env["OLLAMA_HOST"] = "127.0.0.1:11434"

    ollama_proc = subprocess.Popen(["ollama", "serve"], env=env)
    _wait_for_ollama(httpx)

    tags = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=5).json()
    cached = {m.get("name") for m in tags.get("models", [])}
    if MODEL not in cached:
        subprocess.run(["ollama", "pull", MODEL], check=True, env=env)
        ollama_cache.commit()

    sys.path.insert(0, "/app")
    from main import app as fastapi_app

    return fastapi_app
