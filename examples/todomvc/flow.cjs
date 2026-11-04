/**
 * Worked example: a narrated demo of the public TodoMVC app (no login, nothing to set up).
 * Copy this folder and narration.json for your own app, and change the steps.
 *
 * From the repository root:
 *   npx demo-video-kit run examples/todomvc --open
 */
const { runDemo } = require(process.env.DEMO_KIT || 'demo-video-kit');

const URL = process.env.DEMO_BASE_URL || 'https://demo.playwright.dev/todomvc/';
const TASKS = ['Buy groceries', 'Write the project README', 'Book a dentist appointment'];

runDemo(__dirname, async (k) => {
  const { p, W, H, open, segment, goto, click, type, pause, clearHighlights } = k;
  const input = p.getByPlaceholder('What needs to be done?');
  const item = (t) => p.getByTestId('todo-item').filter({ hasText: t });

  await open(URL);
  await input.waitFor({ timeout: 30000 });
  await pause(600);

  await segment('s1-intro', async (at) => {
    await p.mouse.move(W * 0.5, H * 0.3, { steps: 25 });
    await at(3);
    await goto(input, { highlight: true });
  });

  await segment('s2-add', async (at, c) => {
    await at(c.cues[0].end);
    for (const t of TASKS) {
      await type(input, t, { delay: 45 });
      await input.press('Enter');
      await item(t).waitFor();
      await pause(500);
    }
  });

  await segment('s3-complete', async () => {
    await click(item(TASKS[1]).getByRole('checkbox'), { highlight: item(TASKS[1]) });
    await pause(1200);
    await goto(p.getByTestId('todo-count'), { highlight: true });
  });

  await segment('s4-filter', async (at, c) => {
    await click(p.getByRole('link', { name: 'Active' }), { highlight: true });
    await at(c.cues[0].end + 2);
    await click(p.getByRole('link', { name: 'Completed' }), { highlight: true });
  });

  await segment('s5-end', async () => {
    await click(p.getByRole('link', { name: 'All' }), { highlight: true });
    await pause(1000);
    await clearHighlights();
  });

  const left = await p.getByTestId('todo-count').innerText();
  if (!/2 items? left/.test(left)) throw new Error(`Expected 2 items left, the app shows "${left}"`);
  await pause(1500);
  return { createdRecord: `${TASKS.length} tasks`, counter: left };
}).catch(e => { console.error(e); process.exit(1); });
