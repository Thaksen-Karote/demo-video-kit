---
name: demo-video
description: Record a narrated, subtitled demo video of a real web app workflow (sign up, create an order, file a ticket...) with Playwright and Edge TTS, at true 1920x1080 with a visible cursor and red highlight boxes. Use when asked to "create a demo / demo video / walkthrough video for <process>", to redo a demo after its screens changed, or to change a demo's narration, voice or speed.
---

# Demo video

Records the real application (never a mock or an old video) in a fresh headless browser, narrates it with Edge TTS, burns in subtitles, and renders an MP4. A demo is one file written for its process, `demo.yaml` (what to say and what to do, step by step); everything else is the `demo-video-kit` command in this folder. The worked example is `examples/analog-clock/demo.yaml`. For logic YAML cannot express (conditions, loops, reading a value off the page to use later), write `flow.cjs` + `narration.json` instead (`init --js`; example `examples/todomvc/`).

`<kit>` below means `node <this folder>/bin/demo-video-kit.js` (this folder is, for example, `~/.claude/skills/demo-video`); when the user's project has the kit installed, `npx demo-video-kit` works the same. `<kit> help` lists every command.

## The request decides the job

| Request | Do |
| --- | --- |
| "Create a demo for <process>" | The whole workflow below, in `demos/<process>/` of the user's project |
| "<process> screens changed, redo the demo" | Dry-run the new screens (step 2), fix the `do:` actions and, if the words no longer fit, the `say:` lines; then steps 4 to 6 |
| "Add boxes to the existing <process> video" (no new recording) | Measure the boxes in the running app, write `annotations.json`, run `<kit> annotate <demo-dir>` (see Highlights) |
| "... without highlights" | Leave out every `highlight` option; nothing else changes |
| "Change the voice / speed / wording" | Edit `voice`, `rate` or the `say:` lines, then steps 4 to 6: the clip lengths drive the on-screen timing, so the video is always recorded again |

## Rules (always)

1. **Real and fresh.** A new browser session; the real application; real data. Never fake a result, a number or a status; announce success only after the application shows it.
2. **Safe.** Only a local or test environment: every run really creates whatever the flow creates. Never print or store credentials: they come from the environment (for example `DEMO_EMAIL`, `DEMO_PASSWORD`); a password shows only as dots. Ask for a test account if none is known.
3. **Picture.** 1920x1080, 16:9, 30 fps, H.264 + AAC MP4, recorded headless so nothing is cut. A visible cursor that glides to each target and a light click ring; no zoom, no camera moves, no fancy transitions. Before acting on anything, scroll it fully into view; read long pages top to bottom, slowly enough to read.
4. **Sound.** Edge TTS, default voice `en-IN-NeerjaNeural` (list others with `<kit> voices en-` or another filter). One clip per narration segment; clips never overlap; narration describes only what is on screen or about to happen in that scene.
5. **No gap longer than 7 seconds.** No stretch without narration may reach 7 seconds. When the recorder warns, or `verify.py` fails, lengthen or split that segment's narration, or speed up its actions, and record again.
6. **Pace.** No rushing: every value entered must be visible before moving on.
7. **Follow the application.** Derive routes, labels and buttons from the running app (dry run), never from memory. Name buttons as the app does.
8. **Outputs stay out of git.** Generated audio, builds and MP4s are not committed unless asked.
9. **Highlights.** Every demo marks what the narration points at with a red box, unless the request says "without highlights".

## Highlights

A red box (4 px, `#E11D48`, 6 px clear of the element) is drawn live in the page while the video records, so it follows scrolling and is part of the picture. Box by default: each menu item clicked on the way to the screen, the buttons that start the process, each block of entered data on a review page, and the final submit button. Do not box every field being typed: the cursor and the typing already show it.

In `demo.yaml`, `highlight: true` boxes the target and `highlight: block` boxes the whole `within:` block. In `flow.cjs`:

- `goto / click / type / pick (loc, ..., { highlight })`: `highlight: true` boxes the element the cursor goes to; `highlight: <locator>` boxes another element instead (for example its whole row or block).
- A box stays until the cursor moves to the next target. `{ keep: true }` keeps the current boxes as well; `k.clearHighlights()` removes them; `k.highlight(loc)` adds one without moving the cursor.
- Each box adds a `highlight` entry to `marks` in `build/timeline-raw.json`.

For a video already recorded without boxes, `<kit> annotate <demo-dir>` draws them afterwards from `annotations.json`. This is a fallback; recording again is easier and more accurate.

## Workflow

1. **Setup.** Run `<kit> doctor` (see Setup) and check that the app answers at its URL.
2. **Dry run.** With the Playwright browser tools, walk the real flow without recording and without the final submit: note each screen's route, labels and `getByRole` names, dropdown options, dialogs, the final button, and what happens after it.
3. **Write the demo**: `<kit> init <demo-dir> --url <app url>` makes a starter `demo.yaml` that already runs (its header comments list every action and option). When the user would rather show the flow than describe it, they can run `<kit> record-steps <demo-dir> --url <app url>` themselves: it opens a visible browser with a Pause / New step / Finish bar and writes `demo.yaml` from what they do. It needs a person at the screen, so suggest it; do not run it unattended. Then rewrite its draft `say:` lines. Either way, write:
   - Top: `title`, `url`, `voice`, `rate`, `pronounce` (written → spoken), and `data:` for the values to type, used as `{{name}}` in actions. Use `{{random}}` or `{{timestamp}}` in anything that must be unique, since every run creates a real record; `expect: "{{title}}"` then sees the same value.
   - `steps:`, each `{ scene, say, do: [actions] }`. One `say` per step; split a scene into several steps wherever its actions take long, so each step's narration lasts about as long as its actions.
   - Actions: `click`, `point`, `type: { Label: text }`, `press`, `check`, `select: { Label: option }` (or `select: option` with `nth`), `scroll`, `wait` (seconds, text, or `{ sentence: N }`), `expect: text` (fails the run if missing: use it to prove the result), `open: /path`. Options: `highlight: true | block`, `within: <block text>` (when the same wording appears twice), `nth`, `optional`, `keep`, `delay`, `zoom: true | <1.2-4> | block | false`. Zoom where the target is small on a 1920x1080 page (a form, a panel, a dropdown, a short text); `zoom: block` frames the `within:` block; each zoom adds about 0.7 s, so allow for it in the narration. Use the wording on screen (button names, labels, placeholders, tooltips) from the dry run; fall back to `{ css }`, `{ testid }` or `{ role, name }` only when wording cannot single the element out. Credentials as `$DEMO_PASSWORD`.
   - Only with `--js`, `flow.cjs`: `runDemo(__dirname, async (k) => { ... })` with one `k.segment(id, async (at, clip) => { ... })` per narration segment. Use `k.click / k.type / k.pick / k.goto / k.scrollBy`; `at(seconds)` waits for a point in the clip (for example `clip.cues[0].end`). Wait on elements, never on "network idle". Return what was verified. Keep `require(process.env.DEMO_KIT || 'demo-video-kit')`: the command sets `DEMO_KIT`.
4. **Make it.** `<kit> run <demo-dir>` (with any credentials in the environment; `DEMO_BASE_URL` overrides `url:`) runs audio, record, render and verify. Each `WARNING` line from the recorder, and each `FAIL` line from verify, breaks rule 5: fix and run again. After changing only the actions, `--from record` skips the audio; after changing only subtitles or encoding, `--from render` skips the recording.
5. **Look at it.** `build/check/contact-sheet.png`: every frame shows the full screen, the cursor, the right step, readable subtitles, and boxes on the elements the narration names. The video is `<demo-dir>/<folder name>.mp4`.
6. **Hand over.** Report the MP4 path, duration, format, longest gap, what the run created, and anything that differs from the request because the app works differently.

## Setup

Node 18+ and Google Chrome (or Microsoft Edge: the recorder falls back to it, or set `DEMO_BROWSER=msedge`). Run `npm install` once in this folder; the voices (`msedge-tts`), ffmpeg (`ffmpeg-static`) and `playwright-core` come with it, and the recorder fetches Playwright's own small ffmpeg on its first run. `<kit> doctor` checks all of it, including internet access, which the voices need.

## Known traps

| Trap | Avoid |
| --- | --- |
| Grey band, page cut off at the bottom | Never record in a visible browser window; `demo-kit.cjs` records headless at 1920x1080 |
| `waitForLoadState('networkidle')` hangs on apps that poll | Wait for an element instead |
| A headless UI dialog reports as hidden | Wait on a field inside it, not on the dialog |
| Escape inside a dropdown closes the whole dialog | Pick an option instead of pressing Escape |
| A silent stretch while many fields are typed | Split that segment's narration; `type()` takes `{ delay }` (default 32 ms) |
| Labels shown in capitals by CSS | Match the real text, not the displayed case |
| A box around a label only, not its block | Box the label's parent (`xpath=..`) or grandparent (`xpath=../..`) |
