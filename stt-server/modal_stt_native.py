# modal_stt_native.py — Docker 이미지 없이 Modal이 직접 환경 빌드
import modal

app = modal.App("silent-witness-stt")

image = (
    modal.Image.from_registry("nvidia/cuda:12.6.3-cudnn-runtime-ubuntu22.04", add_python="3.12")
    .apt_install("python3-pip", "ffmpeg")
    .pip_install(
        "fastapi>=0.110.0",
        "uvicorn[standard]>=0.27.0",
        "faster-whisper>=1.0.3",
        "python-multipart",
        "nvidia-cublas-cu12>=12,<13",
        "nvidia-cudnn-cu12>=9,<10",
    )
    .add_local_file("stt-server/main.py", "/app/main.py")
)

cache = modal.Volume.from_name("silent-witness-stt-cache", create_if_missing=True)


@app.function(
    image=image,
    gpu="L4",
    volumes={"/root/.cache/huggingface": cache},
    timeout=600,
    scaledown_window=300,
    # keep_warm=1,  # demo day에 주석 해제
)
@modal.asgi_app(label="stt")
def serve():
    import sys
    sys.path.insert(0, "/app")
    from main import app as fastapi_app
    return fastapi_app


@app.local_entrypoint()
def main():
    print("modal deploy modal_stt_native.py")
