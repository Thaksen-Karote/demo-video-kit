"""Combine the recording, the narration clips and the subtitles into the final MP4.

Usage: python render.py <demo-dir> [output-name.mp4]
Reads <demo-dir>/build/timeline-raw.json and <demo-dir>/audio/segments.json.
Writes <demo-dir>/subtitles.srt, <demo-dir>/scene-timeline.json and the MP4
(default name: <demo-dir name>-final.mp4): 1920x1080, 30 fps, H.264, AAC, subtitles burned in.
"""
import json
import pathlib
import re
import subprocess
import sys

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
LEAD_IN = 0.8
MAX_CHARS = 84


def srt_time(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def split_cue(text, start, end):
    if len(text) <= MAX_CHARS:
        return [(text, start, end)]
    parts, current = [], ""
    for word in re.split(r"\s+", text):
        if current and len(current) + 1 + len(word) > MAX_CHARS:
            parts.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    parts.append(current)
    total = sum(len(p) for p in parts)
    out, t = [], start
    for p in parts:
        d = (end - start) * len(p) / total
        out.append((p, t, t + d))
        t += d
    return out


def wrap(text, width=56):
    lines, line = [], ""
    for w in text.split():
        if line and len(line) + 1 + len(w) > width:
            lines.append(line)
            line = w
        else:
            line = f"{line} {w}".strip()
    lines.append(line)
    return "\n".join(lines)


def main(demo, name):
    raw = json.loads((demo / "build" / "timeline-raw.json").read_text(encoding="utf-8"))
    clips = {s["id"]: s for s in json.loads((demo / "audio" / "segments.json").read_text(encoding="utf-8"))["segments"]}
    trim = max(0.0, raw["segments"][0]["start"] - LEAD_IN)
    length = raw["end"] - trim
    result = raw.get("result")

    scenes, cues = [], []
    for seg in raw["segments"]:
        clip = clips[seg["id"]]
        start = seg["start"] - trim
        seg_cues = []
        for c in clip["cues"]:
            for text, a, b in split_cue(c["text"], start + c["start"], start + c["end"]):
                seg_cues.append({"text": text, "start": round(a, 3), "end": round(b, 3)})
        cues.extend(seg_cues)
        scenes.append({"id": seg["id"], "scene": seg["scene"], "narration": clip["text"], "audio": clip["file"],
                       "start": round(start, 3), "end": round(seg["end"] - trim, 3),
                       "audioStart": round(start, 3), "audioEnd": round(start + clip["duration"], 3), "subtitles": seg_cues})
    marks = [{"label": m["label"], "t": round(m["t"] - trim, 3)} for m in raw["marks"]]

    (demo / "subtitles.srt").write_text("\n".join(
        f"{i}\n{srt_time(c['start'])} --> {srt_time(c['end'])}\n{wrap(c['text'])}\n" for i, c in enumerate(cues, 1)),
        encoding="utf-8")
    (demo / "scene-timeline.json").write_text(json.dumps({
        "video": name, "duration": round(length, 3), "trimmedFromRaw": round(trim, 3), "result": result,
        "scenes": scenes, "actionMarks": marks, "recorderWarnings": raw.get("warnings", []),
    }, indent=2), encoding="utf-8")

    cmd = [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{trim:.3f}", "-i", raw["videoFile"].replace("\\", "/")]
    for s in scenes:
        cmd += ["-i", s["audio"]]
    delays = "".join(f"[{i + 1}:a]adelay={int(s['audioStart'] * 1000)}:all=1[a{i}];" for i, s in enumerate(scenes))
    mix = "".join(f"[a{i}]" for i in range(len(scenes)))
    style = "FontName=Arial,FontSize=12,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=1,Shadow=0,MarginV=22"
    graph = (f"[0:v]fps=30,scale=1920:1080:flags=lanczos,subtitles=subtitles.srt:force_style='{style}'[v];"
             f"{delays}{mix}amix=inputs={len(scenes)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]")
    cmd += ["-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-t", f"{length:.3f}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
            "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", name]
    subprocess.run(cmd, cwd=demo, check=True)
    print(f"Rendered {name}: {length:.1f}s, {len(cues)} subtitles, result {result}")


demo_dir = pathlib.Path(sys.argv[1]).resolve()
main(demo_dir, sys.argv[2] if len(sys.argv) > 2 else f"{demo_dir.name}-final.mp4")
