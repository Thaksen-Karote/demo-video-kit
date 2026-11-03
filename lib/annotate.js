/**
 * Fallback: draws red boxes on a video that was recorded without them. New recordings get their
 * boxes live from the recorder (`highlight`); use this only when recording again is not wanted.
 *
 * Reads <demo>/annotations.json:
 *   { "source": "x.mp4", "output": "x-annotated.mp4",
 *     "boxes": [ { "label": "Submit", "box": [x, y, w, h], "from": 12.0, "to": 15.5, "scroll": 0 } ] }
 * `box` is measured at 1920x1080 with the page unscrolled; `scroll` is how far the page had
 * scrolled at that moment. The audio is copied unchanged.
 */
const fs = require('fs');
const path = require('path');
const { ffmpeg } = require('./ffmpeg');

const PAD = 6, THICK = 4, COLOR = '0xE11D48';

function annotate(demoDir, { log = console.log } = {}) {
  const file = path.join(demoDir, 'annotations.json');
  if (!fs.existsSync(file)) throw new Error(`No annotations.json in ${demoDir}`);
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const filters = spec.boxes.map((b) => {
    const [x, y0, w, h] = b.box;
    const y = y0 - (b.scroll || 0);
    return `drawbox=x=${x - PAD}:y=${y - PAD}:w=${w + 2 * PAD}:h=${h + 2 * PAD}:color=${COLOR}:t=${THICK}:enable='between(t,${b.from},${b.to})'`;
  });
  ffmpeg(['-i', spec.source, '-vf', filters.join(','), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'copy', '-movflags', '+faststart', spec.output], { cwd: demoDir });
  log(`  wrote ${spec.output} with ${spec.boxes.length} boxes`);
  return { file: path.join(demoDir, spec.output) };
}

module.exports = { annotate };
