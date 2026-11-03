"""Generate one narration clip per segment with Edge TTS, and record each sentence's timing.

Usage: python generate_audio.py <demo-dir>
Reads <demo-dir>/narration.json: {"voice", "rate", "pronounce": {written: spoken}, "segments": [{id, scene, text}]}.
Writes <demo-dir>/audio/<id>.mp3, <demo-dir>/audio/segments.json and <demo-dir>/narration-script.txt.
Needs edge-tts and imageio-ffmpeg, and network access.
"""
import asyncio
import json
import pathlib
import re
import subprocess
import sys

import edge_tts
import imageio_ffmpeg


def duration(path):
    out = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-i", str(path)],
                         capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


async def synth(segment, spec, audio_dir):
    said = segment["text"]
    for written, spoken in spec.get("pronounce", {}).items():
        said = said.replace(written, spoken)
    path = audio_dir / f"{segment['id']}.mp3"
    communicate = edge_tts.Communicate(said, spec["voice"], rate=spec.get("rate", "+0%"), boundary="SentenceBoundary")
    sentences = []
    with open(path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "SentenceBoundary":
                sentences.append({"start": chunk["offset"] / 1e7, "end": (chunk["offset"] + chunk["duration"]) / 1e7})
    length = round(duration(path), 3)
    written = re.split(r"(?<=[.!?])\s+", segment["text"].strip())
    cues = [{"text": w, **t} for w, t in zip(written, sentences)] if len(written) == len(sentences) \
        else [{"text": segment["text"], "start": 0.0, "end": length}]
    return {"id": segment["id"], "scene": segment["scene"], "text": segment["text"],
            "file": f"audio/{path.name}", "duration": length, "cues": cues}


async def main(demo):
    spec = json.loads((demo / "narration.json").read_text(encoding="utf-8"))
    audio_dir = demo / "audio"
    audio_dir.mkdir(exist_ok=True)
    results = [await synth(s, spec, audio_dir) for s in spec["segments"]]
    (audio_dir / "segments.json").write_text(json.dumps({"voice": spec["voice"], "rate": spec.get("rate"),
                                                         "segments": results}, indent=2), encoding="utf-8")
    lines = [f"{spec.get('title', demo.name)}: narration script\nVoice: {spec['voice']}, rate {spec.get('rate', '+0%')}\n"]
    scene = None
    for r in results:
        if r["scene"] != scene:
            scene = r["scene"]
            lines.append(f"\n{scene}\n{'-' * len(str(scene))}")
        lines.append(f"[{r['id']}, {r['duration']:.1f}s] {r['text']}")
    (demo / "narration-script.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    total = sum(r["duration"] for r in results)
    for r in results:
        print(f"{r['id']:18} {r['duration']:6.2f}s  cues={len(r['cues'])}")
    print(f"total narration {total:.1f}s")


asyncio.run(main(pathlib.Path(sys.argv[1]).resolve()))
