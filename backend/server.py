#!/usr/bin/env python3
"""
IMCG-Sound Backend
FastAPI server wrapping Qwen3-TTS and ACE-Step
Port: 7862
"""

import os
import sys
import io
import json
import uuid
import base64
import asyncio
import logging
import binascii
from datetime import datetime
from pathlib import Path
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import httpx
import uvicorn

BASE_DIR = Path(__file__).parent
LIBRARY_DIR = BASE_DIR / "library"
LIBRARY_JSON = BASE_DIR / "library.json"
PROFILES_DIR = BASE_DIR / "profiles"
PROFILES_JSON = BASE_DIR / "profiles.json"

LIBRARY_DIR.mkdir(exist_ok=True)
PROFILES_DIR.mkdir(exist_ok=True)
if not LIBRARY_JSON.exists():
    LIBRARY_JSON.write_text("[]")
if not PROFILES_JSON.exists():
    PROFILES_JSON.write_text("[]")

ACESTEP_URL = "http://127.0.0.1:8001"
TTS_URL = "http://localhost:7861"

# Language code → full name mapping for Qwen3-TTS
LANG_MAP = {
    "en": "english", "zh": "chinese", "ja": "japanese", "ko": "korean",
    "de": "german", "fr": "french", "ru": "russian", "es": "spanish",
    "pt": "portuguese", "it": "italian",
}

app = FastAPI(title="IMCG-Sound API", version="1.0.0")
logger = logging.getLogger("imcg-sound")

if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request Models ───────────────────────────────────────────

class TTSRequest(BaseModel):
    text: str
    language: str = "en"
    instruct: Optional[str] = None
    voice_description: Optional[str] = None
    voice_name: Optional[str] = None
    robot: bool = False
    voice_profile_id: Optional[str] = None

class MusicRequest(BaseModel):
    prompt: str
    lyrics: Optional[str] = None
    duration: float = 30.0
    genre_tags: Optional[List[str]] = None
    inference_steps: int = 8
    guidance_scale: float = 7.0
    seed: int = -1

class LibrarySaveRequest(BaseModel):
    name: str
    type: str
    prompt: str
    duration: float = 0
    tags: Optional[List[str]] = None
    audio_data: str  # base64

class ProfileSaveRequest(BaseModel):
    name: str
    description: str
    audio_data: str  # base64

# ── TTS (Qwen3-TTS proxy) ───────────────────────────────────

@app.post("/api/tts/generate")
async def generate_tts(request: TTSRequest):
    try:
        language = LANG_MAP.get(request.language, request.language)

        # Priority 1: voice profile (real voice clone via ref audio)
        if request.voice_profile_id:
            profile_wav = PROFILES_DIR / f"{request.voice_profile_id}.wav"
            if not profile_wav.exists():
                raise HTTPException(status_code=404, detail=f"Profile audio not found: {request.voice_profile_id}")
            ref_audio_bytes = profile_wav.read_bytes()
            ref_audio_b64 = base64.b64encode(ref_audio_bytes).decode()
            tts_url = f"{TTS_URL}/tts/clone"
            payload = {
                "text": request.text,
                "language": language,
                "ref_audio": ref_audio_b64,
                "ref_text": "",
                "robot": request.robot,
            }
        # Priority 2: voice description (design mode)
        elif (request.instruct or request.voice_description or "").strip():
            instruct = request.instruct or request.voice_description or ""
            tts_url = f"{TTS_URL}/tts/design"
            payload = {
                "text": request.text,
                "language": language,
                "instruct": instruct,
                "robot": request.robot,
            }
        # Priority 3: preset voice name
        else:
            voice_name = request.voice_name or ""
            tts_url = f"{TTS_URL}/tts/speak"
            payload = {
                "text": request.text,
                "language": language,
                "voice_name": voice_name if voice_name else "default",
                "robot": request.robot,
            }

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(tts_url, json=payload)
            response.raise_for_status()
            return Response(
                content=response.content,
                media_type="audio/wav",
                headers={"Content-Disposition": "inline; filename=tts_output.wav"},
            )
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Qwen3-TTS server not available. Start it on port 7861.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")

# ── Music (ACE-Step proxy) ──────────────────────────────────

@app.post("/api/music/generate")
async def generate_music(request: MusicRequest):
    """Submit music generation to ACE-Step and poll until complete."""
    try:
        tags = ", ".join(request.genre_tags) if request.genre_tags else ""
        prompt = f"{tags}. {request.prompt}" if tags else request.prompt

        payload = {
            "prompt": prompt,
            "lyrics": request.lyrics or "[inst]",
            "audio_duration": request.duration,
            "inference_steps": request.inference_steps,
            "guidance_scale": request.guidance_scale,
            "seed": request.seed,
            "use_random_seed": request.seed == -1,
            "task_type": "text2music",
        }

        async with httpx.AsyncClient(timeout=300.0) as client:
            # Submit task
            resp = await client.post(f"{ACESTEP_URL}/release_task", json=payload)
            resp.raise_for_status()
            result = resp.json()

            task_id = result.get("data", {}).get("task_id")
            if not task_id:
                raise HTTPException(status_code=500, detail=f"No task_id returned: {result}")

            # Poll for result (up to 5 minutes)
            for _ in range(150):
                await asyncio.sleep(2)
                poll_resp = await client.post(
                    f"{ACESTEP_URL}/query_result",
                    json={"task_id_list": [task_id]},
                )
                poll_resp.raise_for_status()
                poll_data = poll_resp.json()

                tasks = poll_data.get("data", [])
                if not tasks:
                    continue

                task = tasks[0]
                status = task.get("status", "")

                if status == "failed":
                    error = task.get("error", "Unknown error")
                    raise HTTPException(status_code=500, detail=f"Music generation failed: {error}")

                if status == "succeeded":
                    audio_url = task.get("audio_url", "")
                    if not audio_url:
                        # Try to get audio path from result
                        audio_path = task.get("audio_path", "")
                        if audio_path and Path(audio_path).exists():
                            return FileResponse(audio_path, media_type="audio/wav", filename="music_output.wav")
                        raise HTTPException(status_code=500, detail="No audio in result")

                    # Download audio from ACE-Step
                    if audio_url.startswith("http"):
                        audio_resp = await client.get(audio_url)
                    else:
                        audio_resp = await client.get(f"{ACESTEP_URL}{audio_url}")
                    audio_resp.raise_for_status()
                    return Response(
                        content=audio_resp.content,
                        media_type="audio/wav",
                        headers={"Content-Disposition": "inline; filename=music_output.wav"},
                    )

            raise HTTPException(status_code=504, detail="Music generation timed out (5 min)")

    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="ACE-Step server not available. Start it on port 8001.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Music generation failed: {str(e)}")

# ── Music task status (for frontend polling) ─────────────────

@app.post("/api/music/submit")
async def submit_music(request: MusicRequest):
    """Submit music generation task and return task_id for polling."""
    try:
        tags = ", ".join(request.genre_tags) if request.genre_tags else ""
        prompt = f"{tags}. {request.prompt}" if tags else request.prompt

        payload = {
            "prompt": prompt,
            "lyrics": request.lyrics or "[inst]",
            "audio_duration": request.duration,
            "inference_steps": request.inference_steps,
            "guidance_scale": request.guidance_scale,
            "seed": request.seed,
            "use_random_seed": request.seed == -1,
            "task_type": "text2music",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{ACESTEP_URL}/release_task", json=payload)
            resp.raise_for_status()
            result = resp.json()
            task_id = result.get("data", {}).get("task_id")
            if not task_id:
                raise HTTPException(status_code=500, detail=f"No task_id: {result}")
            return {"task_id": task_id, "status": "queued"}

    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="ACE-Step server not available. Start it on port 8001.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/music/status")
async def music_status(task_id: str):
    """Poll task status."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{ACESTEP_URL}/query_result",
                json={"task_id_list": [task_id]},
            )
            resp.raise_for_status()
            data = resp.json()
            tasks = data.get("data", [])
            if not tasks:
                return {"task_id": task_id, "status": "queued"}
            task = tasks[0]
            return {
                "task_id": task_id,
                "status": task.get("status", "unknown"),
                "audio_url": task.get("audio_url", ""),
                "audio_path": task.get("audio_path", ""),
                "error": task.get("error", ""),
            }
    except Exception as e:
        return {"task_id": task_id, "status": "error", "error": str(e)}

# ── Media Library ────────────────────────────────────────────

def load_library():
    try:
        return json.loads(LIBRARY_JSON.read_text())
    except:
        return []

def save_library(library):
    LIBRARY_JSON.write_text(json.dumps(library, indent=2))

@app.get("/api/library")
async def list_library():
    return {"items": load_library()}

@app.post("/api/library/save")
async def save_to_library(request: LibrarySaveRequest):
    try:
        item_id = str(uuid.uuid4())[:8]
        ext = "wav"
        file_path = LIBRARY_DIR / f"{item_id}.{ext}"

        audio_bytes = base64.b64decode(request.audio_data)
        file_path.write_bytes(audio_bytes)

        entry = {
            "id": item_id,
            "name": request.name,
            "type": request.type,
            "prompt": request.prompt,
            "duration": request.duration,
            "created_at": datetime.now().isoformat(),
            "tags": request.tags or [],
            "file_path": str(file_path),
        }

        library = load_library()
        library.insert(0, entry)
        save_library(library)
        return {"status": "ok", "id": item_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Save failed: {str(e)}")

@app.delete("/api/library/{item_id}")
async def delete_from_library(item_id: str):
    library = load_library()
    item = next((i for i in library if i["id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    file_path = Path(item["file_path"])
    if file_path.exists():
        file_path.unlink()
    library = [i for i in library if i["id"] != item_id]
    save_library(library)
    return {"status": "ok"}

@app.get("/api/library/{item_id}/audio")
async def stream_audio(item_id: str):
    library = load_library()
    item = next((i for i in library if i["id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    file_path = Path(item["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(file_path, media_type="audio/wav", filename=f"{item['name']}.wav")

# ── Voice Profiles ────────────────────────────────────────────

def load_profiles():
    try:
        return json.loads(PROFILES_JSON.read_text())
    except Exception as e:
        logger.exception("Failed to load profiles.json from %s: %s", PROFILES_JSON, e)
        return []

def save_profiles(profiles):
    PROFILES_JSON.write_text(json.dumps(profiles, indent=2))

@app.get("/api/profiles")
async def list_profiles():
    return {"profiles": load_profiles()}

@app.post("/api/profiles/save")
async def save_profile(request: ProfileSaveRequest):
    try:
        PROFILES_DIR.mkdir(exist_ok=True)
        if not PROFILES_JSON.exists():
            PROFILES_JSON.write_text("[]")

        profile_id = str(uuid.uuid4())[:8]
        file_path = PROFILES_DIR / f"{profile_id}.wav"

        audio_data = request.audio_data.strip()
        if "," in audio_data:
            audio_data = audio_data.split(",", 1)[1]

        try:
            audio_bytes = base64.b64decode(audio_data, validate=True)
        except binascii.Error as decode_error:
            logger.error("Invalid base64 audio payload for profile '%s': %s", request.name, decode_error)
            raise HTTPException(status_code=400, detail="Invalid audio data format")

        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Audio payload is empty")

        file_path.write_bytes(audio_bytes)

        entry = {
            "id": profile_id,
            "name": request.name,
            "description": request.description,
            "created": datetime.now().isoformat(),
            "sample_audio": f"profiles/{profile_id}.wav",
        }

        profiles = load_profiles()
        profiles.insert(0, entry)
        save_profiles(profiles)
        return {"status": "ok", "id": profile_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Profile save failed (name=%s, profiles_json=%s, profiles_dir=%s): %s",
            request.name,
            PROFILES_JSON,
            PROFILES_DIR,
            e,
        )
        raise HTTPException(status_code=500, detail=f"Save failed: {str(e)}")

class ProfileRenameRequest(BaseModel):
    name: str

@app.patch("/api/profiles/{profile_id}")
async def rename_profile(profile_id: str, request: ProfileRenameRequest):
    profiles = load_profiles()
    profile = next((p for p in profiles if p["id"] == profile_id), None)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile["name"] = request.name.strip()
    save_profiles(profiles)
    return {"status": "ok", "id": profile_id, "name": profile["name"]}

@app.delete("/api/profiles/{profile_id}")
async def delete_profile(profile_id: str):
    profiles = load_profiles()
    profile = next((p for p in profiles if p["id"] == profile_id), None)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    file_path = PROFILES_DIR / f"{profile_id}.wav"
    if file_path.exists():
        file_path.unlink()
    profiles = [p for p in profiles if p["id"] != profile_id]
    save_profiles(profiles)
    return {"status": "ok"}

@app.get("/api/profiles/{profile_id}/audio")
async def stream_profile_audio(profile_id: str):
    profiles = load_profiles()
    profile = next((p for p in profiles if p["id"] == profile_id), None)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    file_path = PROFILES_DIR / f"{profile_id}.wav"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(file_path, media_type="audio/wav", filename=f"{profile['name']}.wav")

# ── Health ───────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    health = {"server": "ok", "qwen3_tts": "unknown", "ace_step": "unknown"}
    async with httpx.AsyncClient(timeout=3.0) as client:
        try:
            resp = await client.get(f"{TTS_URL}/health")
            health["qwen3_tts"] = "ok" if resp.status_code == 200 else "error"
        except:
            health["qwen3_tts"] = "offline"
        try:
            resp = await client.get(f"{ACESTEP_URL}/health")
            if resp.status_code == 200:
                data = resp.json().get("data", {})
                health["ace_step"] = "ok" if data.get("status") == "ok" else "error"
            else:
                health["ace_step"] = "error"
        except:
            health["ace_step"] = "offline"
    return health

if __name__ == "__main__":
    print("=" * 50)
    print("IMCG-Sound API Server")
    print("http://localhost:7862")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=7862)
