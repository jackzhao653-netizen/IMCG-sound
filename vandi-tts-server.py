"""
Vandi TTS API Server
Lightweight FastAPI server wrapping Qwen3-TTS for the Vandi chatbot.

Endpoints:
  POST /tts/design    - Generate speech with voice design (describe the voice)
  POST /tts/clone     - Generate speech with voice cloning (from reference audio)
  POST /tts/speak     - Quick TTS with a cached/preset voice (fastest path)
  POST /voice/create  - Design a voice and cache it for reuse
  POST /voice/clone-upload - Upload audio to create a cloneable voice
  GET  /voices        - List cached voices
  GET  /health        - Health check

Usage:
  python vandi-tts-server.py [--port 7861] [--preload] [--preload-voice vandi]
"""

import argparse
import io
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
import torch
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from pydantic import BaseModel

# ── Paths ──────────────────────────────────────────────────────────────
MODEL_DIR = Path(__file__).parent / "models"
VOICE_CACHE_DIR = Path(__file__).parent / "voices"
VOICE_CACHE_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Vandi TTS", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global state ───────────────────────────────────────────────────────
models = {"design": None, "base": None}
voice_cache = {}       # name -> metadata dict
prompt_cache = {}      # name -> precomputed voice_clone_prompt (in-memory)


# ── Request schemas ────────────────────────────────────────────────────
class TTSDesignRequest(BaseModel):
    text: str
    language: str = "Auto"
    instruct: str = "A warm, friendly voice."
    max_new_tokens: int = 2048
    robot: bool = False

class TTSCloneRequest(BaseModel):
    text: str
    language: str = "Auto"
    ref_audio: Optional[str] = None
    ref_text: Optional[str] = None
    voice_name: Optional[str] = None
    max_new_tokens: int = 2048
    robot: bool = False

class TTSSpeakRequest(BaseModel):
    text: str
    language: str = "Auto"
    voice_name: str = "default"
    max_new_tokens: int = 2048
    robot: bool = True  # default ON for Vandi

class VoiceCreateRequest(BaseModel):
    name: str
    instruct: str
    sample_text: str = "Hello, I am Vandi, your intelligent assistant."
    language: str = "English"
    robot: bool = True  # save robot preference with the voice


# ── Device & model loading ─────────────────────────────────────────────
def get_device():
    if torch.cuda.is_available():
        return "cuda:0"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"

def load_model(model_type: str):
    from qwen_tts import Qwen3TTSModel
    if models[model_type] is not None:
        return models[model_type]

    device = get_device()
    dtype = torch.bfloat16 if device != "cpu" else torch.float32
    paths = {
        "design": MODEL_DIR / "Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        "base":   MODEL_DIR / "Qwen3-TTS-12Hz-1.7B-Base",
    }
    path = paths[model_type]
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {path}")

    print(f"[model] Loading {model_type} from {path} on {device}...")
    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(str(path), device_map=device, dtype=dtype)
    print(f"[model] {model_type} loaded in {time.time() - t0:.1f}s")
    models[model_type] = model
    return model


def get_voice_prompt(voice_name: str):
    """Get or build a cached voice clone prompt (avoids recomputing every call)."""
    if voice_name in prompt_cache:
        return prompt_cache[voice_name]

    if voice_name not in voice_cache:
        raise HTTPException(404, f"Voice '{voice_name}' not found")

    meta = voice_cache[voice_name]
    model = load_model("base")

    print(f"[prompt] Building clone prompt for '{voice_name}'...")
    t0 = time.time()
    prompt = model.create_voice_clone_prompt(
        ref_audio=meta["ref_audio_path"],
        ref_text=meta.get("ref_text", ""),
    )
    prompt_cache[voice_name] = prompt
    print(f"[prompt] Built in {time.time() - t0:.1f}s (cached for future calls)")
    return prompt


# ── Audio response helpers ─────────────────────────────────────────────
def wav_to_response(wav: np.ndarray, sr: int, robot: bool = False) -> StreamingResponse:
    buf = io.BytesIO()
    sf.write(buf, wav, sr, format="WAV")
    buf.seek(0)
    if robot:
        buf = apply_robot_effect(buf, sr)
    return StreamingResponse(buf, media_type="audio/wav", headers={
        "Content-Disposition": "inline; filename=vandi_tts.wav"
    })

def apply_robot_effect(wav_buf: io.BytesIO, sr: int) -> io.BytesIO:
    """Sox effects chain: pitch down → overdrive → bandpass → flanger → echo."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as inp:
        inp.write(wav_buf.read())
        inp_path = inp.name
    out_path = inp_path.replace(".wav", "_robot.wav")
    try:
        cmd = [
            "sox", inp_path, out_path,
            "pitch", "-150",
            "overdrive", "8", "4",
            "sinc", "300-4000",
            "flanger", "0.6", "0.87", "3.0", "0.9", "sine",
            "echo", "0.8", "0.7", "12", "0.7",
            "gain", "-n", "-3",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"[robot] sox error: {result.stderr}")
            wav_buf.seek(0)
            return wav_buf
        out_buf = io.BytesIO()
        with open(out_path, "rb") as f:
            out_buf.write(f.read())
        out_buf.seek(0)
        return out_buf
    finally:
        for p in (inp_path, out_path):
            if os.path.exists(p):
                os.unlink(p)


# ── Voice cache persistence ───────────────────────────────────────────
def load_voice_cache():
    for f in VOICE_CACHE_DIR.glob("*.json"):
        meta = json.loads(f.read_text())
        voice_cache[meta["name"]] = meta
    print(f"[cache] Loaded {len(voice_cache)} cached voices: {list(voice_cache.keys())}")

load_voice_cache()


# ── Endpoints ──────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": get_device(),
        "models_loaded": {k: v is not None for k, v in models.items()},
        "cached_voices": list(voice_cache.keys()),
        "prompt_cache": list(prompt_cache.keys()),
    }

@app.get("/voices")
def list_voices():
    return {
        "voices": {
            name: {
                "instruct": meta.get("instruct", ""),
                "robot_default": meta.get("robot", False),
                "ref_audio": meta.get("ref_audio_path", ""),
                "prompt_cached": name in prompt_cache,
            }
            for name, meta in voice_cache.items()
        }
    }

@app.post("/tts/design")
def tts_design(req: TTSDesignRequest):
    """Generate speech using voice design (describe the voice you want)."""
    model = load_model("design")
    t0 = time.time()
    wavs, sr = model.generate_voice_design(
        text=req.text, language=req.language,
        instruct=req.instruct, max_new_tokens=req.max_new_tokens,
    )
    print(f"[design] Generated in {time.time() - t0:.1f}s")
    return wav_to_response(wavs[0], sr, robot=req.robot)

@app.post("/tts/clone")
def tts_clone(req: TTSCloneRequest):
    """Generate speech using voice cloning."""
    model = load_model("base")
    t0 = time.time()

    if req.voice_name and req.voice_name in voice_cache:
        prompt = get_voice_prompt(req.voice_name)
        wavs, sr = model.generate_voice_clone(
            text=req.text, language=req.language,
            voice_clone_prompt=prompt, max_new_tokens=req.max_new_tokens,
        )
    elif req.ref_audio:
        # Ensure the base64 string is prefixed with a data URI so the model's
        # _is_probably_base64() check triggers correctly.  Standard base64
        # contains '/' which otherwise makes the check return False, causing
        # the model to try to open the string as a file path and crash (500).
        ref_audio = req.ref_audio
        if not ref_audio.startswith("data:"):
            ref_audio = f"data:audio/wav;base64,{ref_audio}"
        # If no transcript provided, fall back to x-vector-only mode (speaker
        # embedding extract without ICL), which doesn't require ref_text.
        xvec_only = not bool(req.ref_text and req.ref_text.strip())
        wavs, sr = model.generate_voice_clone(
            text=req.text, language=req.language,
            ref_audio=ref_audio, ref_text=req.ref_text or "",
            x_vector_only_mode=xvec_only,
            max_new_tokens=req.max_new_tokens,
        )
    else:
        raise HTTPException(400, "Provide either voice_name or ref_audio")

    print(f"[clone] Generated in {time.time() - t0:.1f}s")
    return wav_to_response(wavs[0], sr, robot=req.robot)

@app.post("/tts/speak")
def tts_speak(req: TTSSpeakRequest):
    """Quick TTS with a cached voice. The fast path for Vandi."""
    if req.voice_name in voice_cache:
        meta = voice_cache[req.voice_name]
        # Use voice's saved robot preference if not explicitly overridden
        robot = req.robot
        return tts_clone(TTSCloneRequest(
            text=req.text, language=req.language,
            voice_name=req.voice_name, max_new_tokens=req.max_new_tokens,
            robot=robot,
        ))
    else:
        return tts_design(TTSDesignRequest(
            text=req.text, language=req.language,
            instruct="A friendly, clear, and warm assistant voice.",
            max_new_tokens=req.max_new_tokens, robot=req.robot,
        ))

@app.post("/voice/create")
def voice_create(req: VoiceCreateRequest):
    """Design a voice and cache it for reuse via /tts/speak."""
    design_model = load_model("design")
    t0 = time.time()
    wavs, sr = design_model.generate_voice_design(
        text=req.sample_text, language=req.language, instruct=req.instruct,
    )
    ref_audio_path = str(VOICE_CACHE_DIR / f"{req.name}.wav")
    sf.write(ref_audio_path, wavs[0], sr)

    meta = {
        "name": req.name,
        "instruct": req.instruct,
        "sample_text": req.sample_text,
        "language": req.language,
        "robot": req.robot,
        "ref_audio_path": ref_audio_path,
        "ref_text": req.sample_text,
        "created_at": time.time(),
    }
    (VOICE_CACHE_DIR / f"{req.name}.json").write_text(json.dumps(meta, indent=2))
    voice_cache[req.name] = meta

    # Pre-build the clone prompt so first /tts/speak is fast
    try:
        get_voice_prompt(req.name)
    except Exception as e:
        print(f"[voice/create] Warning: could not pre-cache prompt: {e}")

    elapsed = time.time() - t0
    print(f"[voice/create] Created voice '{req.name}' in {elapsed:.1f}s")
    return {"status": "created", "name": req.name, "ref_audio": ref_audio_path, "time": round(elapsed, 1)}

@app.post("/voice/clone-upload")
async def voice_clone_upload(
    name: str = Form(...),
    ref_text: str = Form(""),
    audio: UploadFile = File(...),
):
    """Upload a reference audio file to create a cloneable voice."""
    audio_bytes = await audio.read()
    ref_audio_path = str(VOICE_CACHE_DIR / f"{name}.wav")
    data, sr = sf.read(io.BytesIO(audio_bytes))
    sf.write(ref_audio_path, data, sr)

    meta = {
        "name": name,
        "instruct": "Cloned from uploaded audio",
        "ref_audio_path": ref_audio_path,
        "ref_text": ref_text,
        "robot": True,
        "created_at": time.time(),
    }
    (VOICE_CACHE_DIR / f"{name}.json").write_text(json.dumps(meta, indent=2))
    voice_cache[name] = meta

    # Pre-build clone prompt
    try:
        get_voice_prompt(name)
    except Exception as e:
        print(f"[clone-upload] Warning: could not pre-cache prompt: {e}")

    return {"status": "created", "name": name, "ref_audio": ref_audio_path}

@app.get("/")
def serve_ui():
    return FileResponse(Path(__file__).parent / "test-ui.html", media_type="text/html")


# ── Main ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Vandi TTS Server")
    parser.add_argument("--port", type=int, default=7861)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--preload", action="store_true", help="Pre-load models on startup")
    parser.add_argument("--preload-voice", type=str, default=None, help="Pre-cache a voice prompt on startup")
    args = parser.parse_args()

    print(f"Starting Vandi TTS on {args.host}:{args.port}")
    print(f"Device: {get_device()}")

    if args.preload:
        print("[startup] Pre-loading models...")
        load_model("design")
        load_model("base")

    if args.preload_voice:
        print(f"[startup] Pre-caching voice prompt: {args.preload_voice}")
        try:
            get_voice_prompt(args.preload_voice)
        except Exception as e:
            print(f"[startup] Could not pre-cache voice: {e}")

    uvicorn.run(app, host=args.host, port=args.port)
