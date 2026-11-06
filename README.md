# demo-video-kit

Turn a web app workflow into a narrated, subtitled 1080p demo video. Click through your app once, or describe it in plain words in one YAML file; then one command makes the video.

```bash
npx demo-video-kit record-steps demos/clock --url https://thaksen-karote.github.io/analog-clock/
#   ...use the app in the window that opens, press Finish, rewrite the say: lines...
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

- **Record instead of write:** use your app in a browser window and get `demo.yaml` written for you
- **Plain-words demos:** `click: Sign in` finds the button, link, label, placeholder, tooltip or text you can see
- **Data in one place:** `data:` holds the values to type; `{{random}}`, `{{today}}` keep each run's records distinct
- True 1920x1080, 30 fps, H.264 + AAC, recorded headless so nothing gets cut off
- A smooth, visible cursor with click ripples, and live red boxes that follow scrolling
- **Zoom:** the camera glides in on small things (a form, a panel, a dropdown) and back out, with text kept sharp
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

Pin a release so a later change can't break your demos: `github:Thaksen-Karote/demo-video-kit#v0.5.0`.

## Commands

| Command | Does |
|---|---|
| `record-steps <demo> --url <url> [--paused] [--force]` | Opens a browser window; you use the app, and it writes `demo.yaml` |
| `init <demo> [--url <url>] [--js]` | Makes a starter demo that already works on that page (`--js`: the JavaScript form) |
| `run <demo> [--from <step>] [--open]` | Makes the video: audio → record → render → verify |
| `audio` / `record` / `render` / `verify <demo>` | One step on its own |
| `voices [filter]` | Lists voices, e.g. `voices hi-IN` |
| `doctor` | Checks Node, ffmpeg, the browser and the voices |
| `annotate <demo>` | Draws boxes on an already-made video from `annotations.json` (fallback) |

`--from record` skips making the voice again (when you changed only the actions); `--from render` reuses the recording. The video is `<demo>/<demo>.mp4`.

## Record a demo: `record-steps`

```bash
npx demo-video-kit record-steps demos/signup --url http://localhost:3000
```

1. Start your app first, if it runs locally, and have a test account ready.
2. A browser window opens with a small bar at the bottom right:

   | Button | Does |
   |---|---|
   | **Pause** / **Record** | Stops and restarts recording. While paused, click around freely: nothing is written |
   | **New step** | Starts the next step, meaning the next `say:` line of narration |
   | **Finish** | Writes `demo.yaml` and closes the window (closing the window or Ctrl+C also saves) |

3. Use the app as you want it shown. Clicks, typing, Enter, checkboxes and dropdowns are recorded. Each one gets the name you see on screen, checked against the page so it plays back, with `within:` or `nth:` added when the same name appears twice.
4. Open `demo.yaml` and rewrite each draft `say:` line ("We click Start.") in your own words.
5. `npx demo-video-kit run demos/signup --open`

- **Typed values** go into `data:`.
- **Passwords** are never saved; they become `$DEMO_PASSWORD`.
- **Start paused** with `--paused`, to sign in or get to the right page first.
- **Not recorded:** a second tab, and drag and drop.

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
| `zoom` | `zoom: true` | Zooms in (2x) while this happens; `zoom: 1.5` for less, `zoom: block` to frame the whole `within` block, `zoom: false` to stay out |

### Zoom

Small pages are hard to read at 1920x1080. With `zoom:`, the camera glides in on the action and stays there while the next actions are nearby. The first action without zoom glides back out.

```yaml
- click: Start
  within: Stopwatch
  zoom: block      # frame the whole Stopwatch panel
- click: Pause
  within: Stopwatch
  zoom: block      # already in view: the camera stays
```

`zoom: true` (or `zoom: 1.8`) at the top of the file zooms every click, type, check and select; `zoom: false` on one action keeps it out. The page is scaled in the browser, so text is redrawn sharply, not blown up from pixels. Each zoom adds about 0.7 s.

When the wording isn't enough, target the element exactly: `click: { css: "#save" }`, `{ testid: save }` or `{ role: button, name: Save }`.

**Credentials:** write `$DEMO_PASSWORD` (any `$NAME`). The value is read from the environment when the demo runs, and it's never written to a file.

### Data

Keep the values to type in one place, and use them as `{{name}}`:

```yaml
data:
  title: "Cement order {{random}}"   # a new number on every run
  quantity: "400"
  email: $DEMO_EMAIL                 # from the environment

steps:
  - say: We enter the order title and the quantity.
    do:
      - type: { Title: "{{title}}", Quantity: "{{quantity}}" }
      - click: Save
      - expect: "{{title}}"           # the same value as typed, in the same run
```

Built-ins: `{{today}}` (2026-11-04), `{{time}}` (14:32), `{{timestamp}}` (20261104-143205) and `{{random}}` (a 4-digit number). Each run really creates its record, so `{{random}}` or `{{timestamp}}` in a title avoids "name already taken" on the second run.

`say:` can use fixed `data:` values only. The voice is made before the recording, so a `{{random}}` there would not match the screen.

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

The helpers are `open`, `goto`, `click`, `type`, `pick`, `scrollBy`, `highlight`, `clearHighlights`, `zoomTo`, `zoomOut`, `pause` and `mark`. `goto`, `click`, `type` and `pick` take `{ highlight, zoom, zoomOn }`. See [`examples/todomvc`](examples/todomvc).

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
npm test            # fast unit tests, no browser
npm run test:e2e    # record-steps on a local test page, then play the result back (needs Chrome)
npm run example     # the full pipeline on examples/analog-clock
```

Set `DEMO_DEBUG=1` to see why a highlight box could not be drawn. A slow site is retried 3 times, and so is the voice service.

## Roadmap

- [x] One command, Node only
- [x] `demo.yaml`: say and do in one file, no JavaScript
- [x] `record-steps`: click through the app once and get `demo.yaml` written for you; `data:` values
- [x] Zoom and pan on small UIs
- [ ] GIF and vertical (9:16) export
- [ ] Publish on npm; a GitHub Action that re-renders on every release

## License

[MIT](LICENSE)
