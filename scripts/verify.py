"""Check a rendered demo against the skill's rules, and make a contact sheet for a visual check.

Usage: python verify.py <demo-dir> [video-name.mp4]
Fails (exit 1) when: not 1920x1080, not 30 fps, not H.264 + AAC, or any stretch without
narration reaches MAX_SILENCE seconds. Writes <demo-dir>/build/check/contact-sheet.png: one
frame from the middle of every segment, to be looked at before the video is handed over.
"""
import json
import pathlib
import re
import subprocess
import sys

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
MAX_SILENCE = 7.0


def main(demo, name):
    video = demo / name
    problems = []
    info = subprocess.run([FFMPEG, "-hide_banner", "-i", str(video)], capture_output=True, text=True).stderr
    v = re.search(r"Video: (\w+).*?(\d{3,4})x(\d{3,4}).*?(\d+(?:\.\d+)?) fps", info)
    a = re.search(r"Audio: (\w+)", info)
    dur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info)
    if not v or v.group(1) != "h264" or (v.group(2), v.group(3)) != ("1920", "1080") or float(v.group(4)) != 30:
        problems.append(f"video stream is not 1920x1080 H.264 at 30 fps: {v.groups() if v else 'none'}")
    if not a or a.group(1) != "aac":
        problems.append(f"audio stream is not AAC: {a.group(1) if a else 'none'}")

    sil = subprocess.run([FFMPEG, "-hide_banner", "-i", str(video), "-af",
                          f"silencedetect=noise=-40dB:d={MAX_SILENCE}", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    for end, length in re.findall(r"silence_end: ([\d.]+) \| silence_duration: ([\d.]+)", sil):
        problems.append(f"{float(length):.1f}s without narration, ending at {float(end):.1f}s")
    longest = subprocess.run([FFMPEG, "-hide_banner", "-i", str(video), "-af",
                              "silencedetect=noise=-40dB:d=2", "-f", "null", "-"], capture_output=True, text=True).stderr
    gaps = [float(x) for x in re.findall(r"silence_duration: ([\d.]+)", longest)]

    timeline = json.loads((demo / "scene-timeline.json").read_text(encoding="utf-8"))
    check = demo / "build" / "check"
    check.mkdir(parents=True, exist_ok=True)
    for old in check.glob("*.png"):
        old.unlink()
    for i, s in enumerate(timeline["scenes"]):
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-ss", f"{(s['start'] + s['end']) / 2:.2f}", "-i", str(video),
                        "-frames:v", "1", "-vf", "scale=480:270", str(check / f"{i:02d}.png")], check=True)
    cols = 4
    rows = -(-len(timeline["scenes"]) // cols)
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-framerate", "1", "-i", str(check / "%02d.png"),
                    "-vf", f"tile={cols}x{rows}", "-frames:v", "1", str(check / "contact-sheet.png")], check=True)

    h, m, s = dur.groups() if dur else (0, 0, 0)
    print(f"{name}: {int(h) * 3600 + int(m) * 60 + float(s):.1f}s, {v.groups() if v else '?'}, audio {a.group(1) if a else '?'}")
    print(f"longest stretch without narration: {max(gaps, default=0):.1f}s (limit {MAX_SILENCE:.0f}s)")
    print(f"contact sheet: {check / 'contact-sheet.png'}")
    for p in problems:
        print(f"FAIL {p}")
    sys.exit(1 if problems else 0)


demo_dir = pathlib.Path(sys.argv[1]).resolve()
main(demo_dir, sys.argv[2] if len(sys.argv) > 2 else f"{demo_dir.name}-final.mp4")
