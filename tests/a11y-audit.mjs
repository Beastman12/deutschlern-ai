/**
 * Optional WCAG A/AA audit (Chrome/Chromium required).
 *
 *   npm run test:a11y
 *
 * Renders the main routes — including the live AI, voice, graded skill practice
 * and exam screens — in light and dark themes at desktop and phone widths,
 * exercises the key interactions, then runs axe-core. Exits non-zero on any
 * violation.
 *
 * Set CHROME_PATH if the browser is installed somewhere unusual.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const executablePath = candidates.find((candidate) => fs.existsSync(candidate));

if (!executablePath) {
  console.log('SKIPPED — no Chrome, Edge or Chromium executable found.');
  console.log('Install one, or set CHROME_PATH to its executable, then run npm run test:a11y again.');
  process.exit(0);
}

const axePath = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
if (!fs.existsSync(axePath)) {
  console.error('Missing axe-core. Run npm install before npm run test:a11y.');
  process.exit(1);
}
const axeSource = fs.readFileSync(axePath, 'utf8');

const { app } = await import(pathToFileURL(path.join(ROOT, 'server', 'index.js')).href);
const server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const BASE = `http://127.0.0.1:${server.address().port}`;

const desktopRoutes = [
  '#/dashboard',
  '#/progress',
  '#/courses',
  '#/courses/a1',
  '#/courses/a1/a1-m1-l1',
  '#/grammar',
  '#/grammar?topic=a1-sein-haben&tab=practice',
  '#/vocabulary',
  '#/vocabulary?tab=flashcards',
  '#/exercises',
  '#/exercises?level=a1&skill=grammar',
  '#/exams',
  '#/exams?level=a1',
  '#/profile',
  '#/settings',
  '#/roadmap',
  '#/tutor',
  '#/talk',
  '#/conversations',
  '#/speaking',
  '#/pronunciation',
  '#/listening',
  '#/reading',
  '#/writing',
  '#/does-not-exist',
];

const runs = [
  ...desktopRoutes.map((hash) => ({ hash, width: 1440, height: 1000, theme: 'light' })),
  ...[
    '#/dashboard',
    '#/vocabulary',
    '#/vocabulary?tab=flashcards',
    '#/exercises',
    '#/exams',
    '#/courses/a1/a1-m1-l1',
    '#/tutor',
    '#/talk',
    '#/conversations',
    '#/speaking',
    '#/pronunciation',
    '#/listening',
    '#/reading',
    '#/writing',
  ].map((hash) => ({ hash, width: 390, height: 844, theme: 'light' })),
  ...[
    '#/dashboard',
    '#/grammar',
    '#/vocabulary',
    '#/vocabulary?tab=flashcards',
    '#/exercises',
    '#/exams',
    '#/settings',
    '#/tutor',
    '#/talk',
    '#/conversations',
    '#/speaking',
    '#/pronunciation',
    '#/listening',
    '#/reading',
    '#/writing',
  ].map((hash) => ({ hash, width: 1440, height: 1000, theme: 'dark' })),
];

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
  defaultViewport: { width: 1440, height: 1000 },
});
const page = await browser.newPage();

// Deterministic recognition stub so the live speech state can be audited in
// headless Chrome. It emits the same result shape as the browser API.
await page.evaluateOnNewDocument(() => {
  class FakeSpeechRecognition {
    constructor() {
      this.lang = '';
      this.continuous = false;
      this.interimResults = false;
      this.maxAlternatives = 1;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this.timer = null;
    }
    start() {
      this.timer = window.setTimeout(() => {
        this.onresult?.({
          resultIndex: 0,
          results: [
            {
              isFinal: true,
              length: 1,
              0: { transcript: 'Ich heiße Anna' },
            },
          ],
        });
        this.onend?.();
      }, 80);
    }
    stop() {
      window.clearTimeout(this.timer);
    }
    abort() {
      window.clearTimeout(this.timer);
    }
  }
  window.SpeechRecognition = FakeSpeechRecognition;
  window.webkitSpeechRecognition = FakeSpeechRecognition;
});

let failingRuns = 0;
let failingNodes = 0;
let runIndex = 0;

/** Run axe on the current document, with transitions disabled so colours settle. */
async function audit(label, theme) {
  await page.evaluate((activeTheme) => {
    document.documentElement.dataset.theme = activeTheme;
    const style = document.createElement('style');
    style.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
    document.head.appendChild(style);
  }, theme);
  await new Promise((resolve) => setTimeout(resolve, 150));

  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target.join(' '),
        summary:
          node.failureSummary
            ?.split('\n')
            .filter((line) => line.includes('contrast') || line.includes('accessible name'))
            .join(' ') || '',
      })),
    }));
  });

  const nodeCount = violations.reduce((sum, violation) => sum + violation.nodes.length, 0);
  if (violations.length) {
    failingRuns += 1;
    failingNodes += nodeCount;
  }

  console.log(`${violations.length ? 'FAIL' : 'PASS'} ${label} — ${nodeCount} node(s)`);
  for (const violation of violations) {
    console.log(`  [${violation.impact}] ${violation.id} ×${violation.nodes.length}`);
    for (const node of violation.nodes.slice(0, 4)) {
      console.log(`    - ${node.target} ${node.summary}`.trimEnd());
    }
  }
}

async function open(hash, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?a11y=${++runIndex}${hash}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.documentElement.dataset.app === 'ready');
}

console.log('Routes');
for (const run of runs) {
  await open(run.hash, run.width, run.height);
  await audit(`${run.theme} ${run.width}px ${run.hash}`, run.theme);
}

console.log('Interactive states');
// Live drill session: the rendered questions, options and feedback region.
await open('#/exercises', 1440, 1000);
await page.waitForSelector('[data-ex-start]');
await page.click('[data-ex-start]');
await page.waitForSelector('[data-drill-session]');
await audit('light 1440px #/exercises · live session', 'light');

// Timed paper: clock, grouped questions and answer controls.
await open('#/exams', 1440, 1000);
await page.waitForSelector('[data-exam-start="a1"]');
await page.click('[data-exam-start="a1"]');
await page.waitForSelector('.exam-taking');
await audit('light 1440px #/exams · paper in progress', 'light');

// Submitted result: score bars and the unscored writing/speaking prompts.
await page.click('[data-exam-submit]');
await page.waitForSelector('[data-confirm]');
await page.click('[data-confirm]');
await page.waitForSelector('.exam-result');
await audit('light 1440px #/exams · result', 'light');

// AI views: status panel and the role-play scenario picker are the states a
// learner sees before any provider call is made.
await open('#/tutor', 1440, 1000);
await page.waitForSelector('[data-ai-status]', { timeout: 5000 });
await page.waitForFunction(() => !/Checking/.test(document.querySelector('[data-ai-status]')?.textContent || ''), {
  timeout: 5000,
});
await audit('light 1440px #/tutor · status', 'light');

await open('#/conversations', 1440, 1000);
await page.waitForSelector('[data-ai-scenario]', { timeout: 5000 });
await audit('light 1440px #/conversations · scenario picker', 'light');

// Milestone 6: live speech status and a real-shaped recognised transcript.
await open('#/speaking', 1440, 1000);
await page.waitForFunction(
  () => [...document.querySelectorAll('.speech-status__text')].every((el) => !/Checking/.test(el.textContent || '')),
  { timeout: 5000 },
);
await page.click('[data-listen-start]');
await page.waitForFunction(
  () => (document.querySelector('[data-speaking-transcript]')?.value || '').includes('Ich heiße Anna'),
  { timeout: 5000 },
);
await audit('light 1440px #/speaking · recognised transcript', 'light');

await open('#/talk', 1440, 1000);
await page.waitForFunction(
  () => !/Checking/.test(document.querySelector('[data-talk-status]')?.textContent || ''),
  { timeout: 5000 },
);
await page.click('[data-talk-listen]');
await page.waitForFunction(
  () => (document.querySelector('[data-talk-input]')?.value || '').includes('Ich heiße Anna'),
  { timeout: 5000 },
);
await audit('light 1440px #/talk · recognised transcript', 'light');

await open('#/pronunciation', 1440, 1000);
await page.waitForFunction(
  () => !/Checking/.test(document.querySelector('[data-pronunciation-status]')?.textContent || ''),
  { timeout: 5000 },
);
await page.click('[data-pronunciation-listen]');
await page.waitForFunction(
  () => (document.querySelector('[data-pronunciation-transcript]')?.value || '').includes('Ich heiße Anna'),
  { timeout: 5000 },
);
await page.click('[data-pronunciation-compare]');
await page.waitForSelector('.pronunciation-result', { timeout: 5000 });
await audit('light 1440px #/pronunciation · word comparison', 'light');

// Milestone 7: account dialogs. When accounts are unconfigured the honest
// unavailable dialog is audited instead of a form that cannot authenticate.
await open('#/dashboard', 1440, 1000);
await page.click('#account-btn');
await page.click('#menu-signin');
await page.waitForSelector('.modal-layer .modal');
await audit('light 1440px #/dashboard · account dialog', 'light');

if (await page.$('[data-auth-mode="register"]')) {
  await page.click('[data-auth-mode="register"]');
  await page.waitForSelector('#auth-name');
  await audit('light 1440px #/dashboard · registration form', 'light');
  await audit('dark 1440px #/dashboard · registration form', 'dark');
}

await browser.close();
await new Promise((resolve) => server.close(resolve));

if (failingRuns) {
  console.error(`\nA11Y AUDIT FAILED — ${failingRuns} run(s), ${failingNodes} node(s) with violations.`);
  process.exit(1);
}

console.log(`\nA11Y AUDIT PASSED — ${runIndex} runs, 0 WCAG A/AA violations.`);
