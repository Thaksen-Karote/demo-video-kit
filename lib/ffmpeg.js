/**
 * The ffmpeg binary that ships with the `ffmpeg-static` package (H.264, AAC, libass subtitles),
 * so users install nothing themselves.
 */
const { spawnSync } = require('child_process');
const FFMPEG = require('ffmpeg-static');

/** Runs ffmpeg and returns { status, stdout, stderr } without throwing. */
function ffmpegRaw(args, opts = {}) {
  return spawnSync(FFMPEG, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
}

/** Runs ffmpeg quietly; throws with ffmpeg's own error text when it fails. */
function ffmpeg(args, opts = {}) {
  const r = ffmpegRaw(['-y', '-hide_banner', '-loglevel', 'error', ...args], opts);
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr}`);
  return r;
}

/** ffmpeg's description of a media file (streams, duration), as printed on stderr. */
function probe(file) {
  return ffmpegRaw(['-hide_banner', '-i', file]).stderr;
}

/** Length of a media file in seconds. */
function duration(file) {
  const m = probe(file).match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error(`Cannot read the duration of ${file}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

module.exports = { FFMPEG, ffmpeg, ffmpegRaw, probe, duration };
