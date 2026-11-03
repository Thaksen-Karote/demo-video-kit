"""Draw red boxes on a demo video that was recorded without them (fallback only).

New recordings get their boxes live from demo-kit.cjs (`highlight`). Use this only to add boxes to a
video that already exists, without recording it again.

    python annotate.py <demo-dir>

Reads <demo-dir>/annotations.json:

    { "source": "x-demo-final.mp4", "output": "x-demo-annotated.mp4",
      "boxes": [ { "label": "Submit", "box": [x, y, w, h], "from": 12.0, "to": 15.5, "scroll": 0 } ] }

`box` is the element's box at 1920x1080, measured in the running application with the page unscrolled;
`scroll` (optional) is how far the page had scrolled at that moment, read from the video. Each box shows
only between `from` and `to` (seconds). The audio is copied unchanged; the picture is re-encoded with
the same settings as render.py.
"""
import json
import pathlib
import subprocess
import sys

import imageio_ffmpeg

PAD, THICK, COLOR = 6, 4, "0xE11D48"


def main(demo_dir: pathlib.Path) -> None:
    spec = json.loads((demo_dir / "annotations.json").read_text(encoding="utf-8"))
    filters = []
    for a in spec["boxes"]:
        x, y, w, h = a["box"]
        y -= a.get("scroll", 0)
        filters.append(f"drawbox=x={x - PAD}:y={y - PAD}:w={w + 2 * PAD}:h={h + 2 * PAD}:color={COLOR}:t={THICK}"
                       f":enable='between(t,{a['from']},{a['to']})'")
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error", "-i", spec["source"],
           "-vf", ",".join(filters), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
           "-r", "30", "-c:a", "copy", "-movflags", "+faststart", spec["output"]]
    subprocess.run(cmd, cwd=demo_dir, check=True)
    print(f"Wrote {spec['output']} with {len(spec['boxes'])} boxes")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python annotate.py <demo-dir>")
    main(pathlib.Path(sys.argv[1]).resolve())
