#!/usr/bin/env python3
"""Qwen3-TTS wrapper — generate speech from text with voice design or clone."""
import argparse, os, sys, time
os.environ["TOKENIZERS_PARALLELISM"] = "false"

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models", "Qwen3-TTS-12Hz-1.7B-VoiceDesign")

PRESETS = {
    "narrator": "A calm, professional male voice. Speak clearly and warmly with a natural pace.",
    "teacher": "A patient, encouraging teacher voice. Speak slowly and clearly, as if explaining to a student.",
    "excited": "An energetic, enthusiastic male voice. Speak with excitement and passion about technology.",
    "news": "A polished, authoritative news anchor voice. Speak with confidence and clarity.",
    "warm-female": "A warm, friendly female voice. Speak naturally with a gentle, approachable tone.",
    "storyteller": "A captivating storyteller voice. Speak with dramatic pauses and engaging intonation.",
}

def main():
    parser = argparse.ArgumentParser(description="Qwen3-TTS: text to speech")
    parser.add_argument("text", nargs="?", help="Text to speak (or use --file)")
    parser.add_argument("--file", "-f", help="Read text from file")
    parser.add_argument("--out", "-o", default="output.wav", help="Output WAV path")
    parser.add_argument("--preset", "-p", default="narrator", choices=list(PRESETS.keys()), help="Voice preset")
    parser.add_argument("--instruct", "-i", help="Custom voice description (overrides preset)")
    parser.add_argument("--lang", "-l", default="english", help="Language (english, chinese, japanese, etc.)")
    parser.add_argument("--list-presets", action="store_true", help="List available presets")
    parser.add_argument("--mp3", action="store_true", help="Also convert to MP3 via ffmpeg")
    args = parser.parse_args()

    if args.list_presets:
        for k, v in PRESETS.items():
            print(f"  {k:15s} → {v}")
        return

    text = args.text
    if args.file:
        text = open(args.file).read().strip()
    if not text:
        parser.error("Provide text as argument or via --file")

    instruct = args.instruct or PRESETS[args.preset]

    from qwen_tts import Qwen3TTSModel
    import soundfile as sf

    print(f"Loading model from {MODEL_DIR}...")
    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(MODEL_DIR)
    print(f"Model loaded in {time.time()-t0:.1f}s")

    print(f"Generating speech ({args.lang}, preset={args.preset})...")
    t0 = time.time()
    wavs, sr = model.generate_voice_design(text=text, instruct=instruct, language=args.lang)
    duration = len(wavs[0]) / sr
    print(f"Generated {duration:.1f}s of audio in {time.time()-t0:.1f}s")

    sf.write(args.out, wavs[0], sr)
    print(f"Saved: {args.out}")

    if args.mp3:
        mp3_path = args.out.rsplit(".", 1)[0] + ".mp3"
        os.system(f'ffmpeg -y -i "{args.out}" -codec:a libmp3lame -qscale:a 2 "{mp3_path}" 2>/dev/null')
        print(f"Saved: {mp3_path}")

if __name__ == "__main__":
    main()
