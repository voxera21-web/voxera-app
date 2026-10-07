from __future__ import annotations

import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from backend.ai.voice import transcribe_and_translate
from backend.main import classify

EXPECTED={"sick":"sick","transport":"financial_hardship","recording":"will_watch_recording","human":"wants_human","family":"family","work":"work_schedule"}
LANGUAGES={"en":"English","pcm":"Pidgin","yo":"Yoruba","ha":"Hausa","ig":"Igbo"}
files=sorted((ROOT/"demo"/"audio").glob("*"))
audio=[path for path in files if path.suffix.lower() in {".wav",".mp3",".ogg",".webm",".m4a"}]
if not audio:
    print("No demo recordings found. Add reviewed, presenter-recorded audio files to demo/audio/.")
    raise SystemExit(0)

passed=0
for path in audio:
    pieces=path.stem.lower().split("-")
    language=LANGUAGES.get(pieces[0],"English")
    expected=EXPECTED.get(pieces[1] if len(pieces)>1 else "", "other")
    try:
        result=transcribe_and_translate(str(path),language)
        outcome=classify(result["translation_en"],language)
        match=outcome["category"]==expected
        print(f"{path.name}: transcript={result['transcript']!r}; translation={result['translation_en']!r}; intent={outcome['category']}; expected={expected}; {'PASS' if match else 'CHECK'}")
        passed+=int(match)
    except Exception as error:
        print(f"{path.name}: transcription unavailable: {error}")

print(f"Matched {passed}/{len(audio)} recordings.")
raise SystemExit(0 if passed==len(audio) else 1)
