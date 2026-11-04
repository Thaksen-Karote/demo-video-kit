# demo-video-kit

Turn a web app workflow into a narrated, subtitled 1080p demo video. You describe it in plain words in one YAML file, and one command makes the video.

```bash
npx demo-video-kit init demos/clock --url https://thaksen-karote.github.io/analog-clock/
npx demo-video-kit run demos/clock --open
```

```yaml
steps:
  - say: The stopwatch measures time. We press Start, wait a few seconds, then press Pause.
    do:
      - click: Start
        within: Stopwatch
        highlight: true
      - wait: 4
      - click: Pause
        within: Stopwatch
```

The kit records the real app in headless Chrome with a visible cursor, click ripples and red highlight boxes. It voices each `say:` with free Edge neural voices, runs the `do:` actions while that sentence plays, burns in subtitles, renders an MP4 and checks it.

It's only Node: no Python, no ffmpeg install, no API key, no JavaScript to write. It also ships as a [Claude Code](https://claude.com/claude-code) **skill**, so an AI agent can write the demo for you.

## Features

- **Plain-words demos:** `click: Sign in` finds the button, link, label, placeholder, tooltip or text you can see
- True 1920x1080, 30 fps, H.264 + AAC, recorded headless so nothing gets cut off
- A smooth, visible cursor with click ripples, and live red boxes that follow scrolling
- 300+ neural voices in many languages, with a pronunciation map
- Actions synced to each sentence of the narration; clips never overlap
- A built-in check: fails any video with 7 s or more of silence, and makes a contact sheet to look at
- Clear errors: `demo.yaml step 4, action 1: nothing on the page matches "Strat" inside "Stopwatch"`

## Install

You need **Node 18+** and **Google Chrome** (or Microsoft Edge). Everything else comes with the package.

```bash
# in your project
npm install --save-dev github:Thaksen-Karote/demo-video-kit

# check the machine
npx demo-video-kit doctor
```

Pin a release so a later change can't break your demos: `github:Thaksen-Karote/demo-video-kit#v0.3.0`.

## Commands

| Command | Does |
|---|---|
| `init <demo> [--url <url>] [--js]` | Makes a starter demo that already works on that page (`--js`: the JavaScript form) |
| `run <demo> [--from <step>] [--open]` | Makes the video: audio → record → render → verify |
| `audio` / `record` / `render` / `verify <demo>` | One step on its own |
| `voices [filter]` | Lists voices, e.g. `voices hi-IN` |
| `doctor` | Checks Node, ffmpeg, the browser and the voices |
| `annotate <demo>` | Draws boxes on an already-made video from `annotations.json` (fallback) |

`--from record` skips making the voice again (when you changed only the actions); `--from render` reuses the recording. The video is `<demo>/<demo>.mp4`.

## Write a demo: `demo.yaml`

```yaml
title: Analog Clock tour
url: https://thaksen-karote.github.io/analog-clock/
voice: en-IN-NeerjaNeural     # any from "demo-video-kit voices"
rate: -4%                     # speaking speed
pronounce: { InfraX: Infra X }  # written → spoken (optional)

steps:
  - scene: Themes             # optional name, shown in the timeline
    say: >
      The Themes panel changes the look of the clock.
      Let's try the dark theme, then ocean.
    do:
      - wait: { sentence: 1 }   # until the first sentence has been said
      - click: Dark             # a theme button found by its tooltip
        highlight: true
      - wait: 1.5
      - click: Ocean
        highlight: true
```

### Actions

| Action | Example | Does |
|---|---|---|
| `click` | `click: Sign in` | Moves the cursor there and clicks |
| `point` | `point: Total` | Moves the cursor there |
| `type` | `type: { Email: $DEMO_EMAIL }` | Types into the field with that label or placeholder |
| `press` | `press: Enter` | Presses a key |
| `check` | `check: Remember me` | Ticks a checkbox, found by its label or by the row's text |
| `select` | `select: { Country: India }` or `select: "05"` | Chooses from a dropdown, found by label or by the option it offers |
| `scroll` | `scroll: down` | `down`, `up`, `top`, `bottom`, pixels, or text to scroll to |
| `wait` | `wait: 2` | Seconds, text to wait for, or `{ sentence: N }` |
| `expect` | `expect: Welcome back` | That text must appear, or the run fails |
| `open` | `open: /settings` | Goes to another page |

### Options (on any action)

| Option | Example | Does |
|---|---|---|
| `highlight` | `highlight: true` | A red box on the target; `block` boxes the whole `within` block |
| `within` | `within: Stopwatch` | Looks only inside the block that shows this text (for two "Start" buttons) |
| `nth` | `nth: 3` | Picks the 3rd match |
| `optional` | `optional: true` | Skips the action if nothing matches, instead of failing |
| `keep` | `keep: true` | Keeps earlier boxes on screen |
| `delay` | `delay: 60` | `type` only: milliseconds per key |

When the wording isn't enough, target the element exactly: `click: { css: "#save" }`, `{ testid: save }` or `{ role: button, name: Save }`.

**Credentials:** write `$DEMO_PASSWORD` (any `$NAME`). The value is read from the environment when the demo runs, and it's never written to a file.

A full example is [`examples/analog-clock/demo.yaml`](examples/analog-clock/demo.yaml).

## Or write it in JavaScript: `flow.cjs`

For conditions, loops or reading values from the page, use `init --js`. You get `narration.json` (one segment per step) and `flow.cjs` (code for each segment):

```js
const { runDemo } = require(process.env.DEMO_KIT || 'demo-video-kit');

runDemo(__dirname, async ({ p, env, segment, click, type }) => {
  await p.goto(process.env.DEMO_BASE_URL || 'http://localhost:3000/login');
  await segment('s1-login', async (at, clip) => {
    await type(p.getByLabel('Email'), env.DEMO_EMAIL);
    await at(clip.cues[0].end);                 // wait for the end of the first sentence
    await click(p.getByRole('button', { name: 'Sign in' }), { highlight: true });
  });
});
```

The helpers are `goto`, `click`, `type`, `pick`, `scrollBy`, `highlight`, `clearHighlights`, `pause` and `mark`. See [`examples/todomvc`](examples/todomvc).

## What goes where

```
your-project/
├── demos/
│   └── clock/
│       ├── demo.yaml        ← you write: what to say and do
│       ├── .gitignore       ← from init: keeps the files below out of git
│       ├── audio/  build/  subtitles.srt  scene-timeline.json
│       └── clock.mp4        ← the video
└── node_modules/demo-video-kit/   ← the kit (never edited)
```

Commit `demo.yaml`; anyone can make the same video again with `npx demo-video-kit run demos/clock`.

## Examples

```bash
git clone https://github.com/Thaksen-Karote/demo-video-kit.git && cd demo-video-kit
npm install
npm run example                                   # Analog Clock tour, from demo.yaml
npx demo-video-kit run examples/todomvc --open    # TodoMVC, from flow.cjs
```

## Use from code

```js
const { generateAudio, record, render, verify } = require('demo-video-kit');
await generateAudio('demos/clock'); record('demos/clock'); render('demos/clock');
const { ok, problems } = verify('demos/clock');
```

## Use as a Claude Code skill

```bash
git clone https://github.com/Thaksen-Karote/demo-video-kit.git ~/.claude/skills/demo-video
cd ~/.claude/skills/demo-video && npm install
```

Then ask Claude Code: *"Create a demo video of signing up on localhost:3000."* `SKILL.md` holds the rules it follows.

## How it works

```
demo.yaml (say) ── audio ──▶ audio/*.mp3 + sentence timings      (Edge TTS)
demo.yaml (do) ─── record ─▶ build/raw/*.webm + timeline         (Playwright, headless Chrome)
                   render ─▶ subtitles.srt + <demo>.mp4          (ffmpeg)
                   verify ─▶ pass/fail + build/check/contact-sheet.png
```

## Develop

```bash
npm test          # fast unit tests, no browser
npm run example   # the full pipeline on examples/analog-clock
```

Set `DEMO_DEBUG=1` to see why a highlight box could not be drawn.

## Roadmap

- [x] One command, Node only
- [x] `demo.yaml`: say and do in one file, no JavaScript
- [ ] `record`: click through the app once and get `demo.yaml` written for you
- [ ] Zoom and pan on small UIs
- [ ] GIF and vertical (9:16) export
- [ ] Publish on npm; a GitHub Action that re-renders on every release

## License

[MIT](LICENSE)
