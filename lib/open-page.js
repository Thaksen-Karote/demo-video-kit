/**
 * Opens a page, trying again when the site is slow or does not answer, and says so plainly.
 * Why: one slow first load (seen with the public TodoMVC demo) used to end the whole run with
 * Playwright's raw timeout message.
 */
const TRIES = 3;
const TIMEOUT_MS = 30000;

async function openPage(page, url, { tries = TRIES, timeout = TIMEOUT_MS, log = console.log } = {}) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      // Why: wait for the page itself, not every image and script; each action waits for its own element.
      await page.goto(url, { timeout, waitUntil: 'domcontentloaded' });
      await page.locator('body').waitFor({ timeout });
      return;
    } catch (e) {
      last = e;
      // Runtime: a wrong address fails at once and will not get better; only slowness is retried.
      if (!/Timeout|ERR_CONNECTION|ERR_TIMED_OUT|ERR_NETWORK|ERR_INTERNET/i.test(e.message)) break;
      if (i < tries) log(`  ${url} did not answer (try ${i} of ${tries}); trying again`);
    }
  }
  throw new Error(`Could not open ${url}: ${last.message.split('\n')[0]}\n`
    + '  Check the address, your internet connection, and that the site is up.');
}

module.exports = { openPage };
