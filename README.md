# IMCG Sound — Qwen3-TTS Voice Generator

A web-based Text-to-Speech application powered by Qwen3-TTS (1.7B VoiceDesign model).

## Features
- Voice design: describe a voice and generate speech
- Voice cloning: clone from reference audio
- Preset voice profiles (Narrator, Teacher, Excited, etc.)
- Multi-language support (English, Chinese, Japanese, Korean, etc.)
- Robot voice filter
- Sound profile management
- Media library

## Setup

### 1. Install Python dependencies
```bash
python3 -m venv venv
source venv/bin/activate
pip install torch torchaudio soundfile numpy fastapi uvicorn pydantic
```

### 2. Download models
Download Qwen3-TTS models from ModelScope and place in `models/`:
- `models/Qwen3-TTS-12Hz-1.7B-VoiceDesign/`
- `models/Qwen3-TTS-12Hz-1.7B-Base/`
- `models/Qwen3-TTS-Tokenizer-12Hz/`

### 3. Install frontend dependencies
```bash
cd frontend
npm install
```

### 4. Run
```bash
./start.sh
```
Or manually:
```bash
# Backend (TTS server)
source venv/bin/activate
python vandi-tts-server.py --port 7861 --preload

# Frontend
cd frontend
npm run dev
```

## API Endpoints
- `POST /tts/design` — Generate speech with voice description
- `POST /tts/clone` — Generate speech with voice cloning
- `POST /tts/speak` — Quick TTS with cached voice
- `POST /voice/create` — Design and cache a voice
- `GET /voices` — List cached voices
- `GET /health` — Health check

## Cross-Machine Real Profile V2 Integration

Use these backend endpoints from another machine connected to this sound studio host.

Base URL format:
- `http://<studio-host-ip>:7862`

Discover profiles:
- `GET /api/profiles` for V1 sound profiles
- `GET /api/real-profiles` for Real Profile V2

Generate with V1 profile:
```bash
curl -X POST "http://<studio-host-ip>:7862/api/tts/generate" \
  -H "Content-Type: application/json" \
  -o out_v1.wav \
  -d '{
    "text": "Hello from remote client",
    "language": "en",
    "voice_profile_id": "<v1_profile_id>",
    "robot": false
  }'
```

Generate with Real Profile V2 (fast cached path):
```bash
curl -X POST "http://<studio-host-ip>:7862/api/tts/generate-real" \
  -H "Content-Type: application/json" \
  -o out_v2.wav \
  -d '{
    "text": "Hello from remote client",
    "language": "en",
    "real_profile_id": "<real_profile_id>",
    "robot": false
  }'
```

Preview a Real Profile V2 sample clip:
- `GET /api/real-profiles/{real_profile_id}/audio`

## CLI
```bash
# Quick CLI wrapper
python tts.py "Hello world" -i "A warm friendly voice" -o output.wav --mp3
```

## Requirements
- Python 3.12+
- ~4-5GB RAM for model inference
- macOS (MPS) or Linux (CUDA) recommended
