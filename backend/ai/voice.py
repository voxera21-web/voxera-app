from __future__ import annotations

import os
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "models"

def transcribe_and_translate(audio_path: str, language: str) -> dict[str,Any]:
    if language in {"English", "Pidgin"}:
        model_path=MODEL_DIR/"faster-whisper-small"
        if not model_path.exists():raise RuntimeError("Local Whisper model is missing. Run scripts/download_models.ps1 or type your message instead.")
        from faster_whisper import WhisperModel
        model=WhisperModel(str(model_path),device="cpu",compute_type="int8")
        segments,info=model.transcribe(audio_path,language="en",beam_size=1,vad_filter=True)
        transcript=" ".join(segment.text.strip() for segment in segments).strip()
        return {"transcript":transcript,"translation_en":transcript,"detected_language":language,"translation_available":True}
    model_path=MODEL_DIR/"mms-1b-all"
    if not model_path.exists():raise RuntimeError("Local MMS model is missing. Run scripts/download_models.ps1 or type your message instead.")
    import torch
    import torchaudio
    from transformers import AutoProcessor, Wav2Vec2ForCTC
    codes={"Yoruba":"yor","Hausa":"hau","Igbo":"ibo"}
    processor=AutoProcessor.from_pretrained(str(model_path),target_lang=codes[language],local_files_only=True)
    model=Wav2Vec2ForCTC.from_pretrained(str(model_path),target_lang=codes[language],ignore_mismatched_sizes=True,local_files_only=True)
    waveform,sample_rate=torchaudio.load(audio_path)
    if sample_rate!=16000:waveform=torchaudio.functional.resample(waveform,sample_rate,16000)
    with torch.inference_mode():logits=model(processor(waveform.squeeze().numpy(),sampling_rate=16000,return_tensors="pt").input_values).logits
    transcript=processor.batch_decode(logits.argmax(-1))[0].strip()
    try:
        translation=translate_to_english(transcript,language)
        return {"transcript":transcript,"translation_en":translation,"detected_language":language,"translation_available":True}
    except RuntimeError as error:
        return {"transcript":transcript,"translation_en":"","detected_language":language,"translation_available":False,"translation_error":str(error)}

def translate_to_english(text: str, language: str) -> str:
    model_path=MODEL_DIR/"nllb-200-distilled-600m"
    if not model_path.exists():raise RuntimeError("Local translation model is missing. Check the transcript and type in English instead.")
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    codes={"Yoruba":"yor_Latn","Hausa":"hau_Latn","Igbo":"ibo_Latn"}
    tokenizer=AutoTokenizer.from_pretrained(str(model_path),src_lang=codes[language],local_files_only=True)
    model=AutoModelForSeq2SeqLM.from_pretrained(str(model_path),local_files_only=True)
    inputs=tokenizer(text,return_tensors="pt",truncation=True,max_length=256)
    result=model.generate(**inputs,forced_bos_token_id=tokenizer.convert_tokens_to_ids("eng_Latn"),max_new_tokens=256,num_beams=2)
    return tokenizer.batch_decode(result,skip_special_tokens=True)[0]
