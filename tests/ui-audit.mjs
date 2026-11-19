/**
 * Optional browser audit (Chrome/Chromium required).
 *
 *   npm run test:ui
 *
 * Starts the Express app on an ephemeral port, renders every route at four
 * viewport widths, fails on console/page errors or horizontal overflow, and
 * exercises the main interactions (theme, sidebar, drawer, search, modals,
 * vocabulary filters, settings, lesson gating and assessments).
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
  console.log('Install one, or set CHROME_PATH to its executable, then run npm run test:ui again.');
  process.exit(0);
}

const { app } = await import(pathToFileURL(path.join(ROOT, 'server', 'index.js')).href);
const server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const BASE = `http://127.0.0.1:${server.address().port}`;

const routes = [
  ['#/dashboard', '.hero'],
  ['#/progress', '.progress-hero'],
  ['#/courses', '.course-grid'],
  ['#/courses/a1', '.course-hero'],
  ['#/courses/a1/a1-m1-l1', '.lesson-hero'],
  ['#/grammar', '.grammar-grid'],
  ['#/grammar?topic=a1-sein-haben', '.modal-layer .modal'],
  ['#/vocabulary', '.word-list'],
  ['#/vocabulary?tab=flashcards', '.flashcard-panel'],
  ['#/profile', '.profile-card'],
  ['#/settings', '.settings-layout'],
  ['#/roadmap', '.roadmap-overview'],
  ['#/tutor', '.ai-panel'],
  ['#/talk', '.talk-panel'],
  ['#/speaking', '.speaking-panel'],
  ['#/pronunciation', '.pronunciation-panel'],
  ['#/listening', '[data-skill-view="listening"]'],
  ['#/reading', '[data-skill-view="reading"]'],
  ['#/writing', '[data-skill-view="writing"]'],
  ['#/conversations', '.ai-panel'],
  ['#/exercises', '.exercise-setup'],
  ['#/exercises?level=a1&skill=grammar', '.exercise-setup'],
  ['#/exams', '.exam-levels'],
  ['#/exams?level=a1', '.exam-levels'],
  ['#/vocabulary?word=v-apfel', '.modal-layer .modal'],
  ['#/does-not-exist', '.error-page'],
];

const viewports = [
  ['desktop', 1440, 1000],
  ['laptop', 1180, 900],
  ['tablet', 820, 1000],
  ['phone', 390, 844],
];

const drillSet = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'content', 'grammar-drills.json'), 'utf8'),
).topics.find((topic) => topic.id === 'a1-sein-haben').drills;

const flashcardDeck = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'content', 'vocabulary-deck.json'), 'utf8'),
).cards;

const skillTasks = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'skill-practice.json'), 'utf8')).tasks.map((task) => [
    task.id,
    task,
  ]),
);

const problems = [];
const note = (message) => {
  problems.push(message);
  console.log(`  FAIL ${message}`);
};
let runId = 0;

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
  defaultViewport: { width: 1440, height: 1000 },
});

try {
  const page = await browser.newPage();

  // Headless Chrome has no dependable Web Speech service. A deterministic
  // stub lets us verify the UI handles a *real-shaped* recognition result;
  // it never fabricates app data outside the test browser.
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

  // Keep the browser audit independent of the live provider quota while still
  // exercising the real client request shape and transcript rendering.
  await page.evaluateOnNewDocument(() => {
    window.__aiChatCalls = [];
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      if (url === '/api/ai/status' && sessionStorage.getItem('ui-force-ai') === '1') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            configured: true,
            provider: 'compatible',
            model: 'ui-audit',
            reason: null,
            modes: ['tutor', 'roleplay', 'voice'],
            maxMessageChars: 1200,
            maxHistory: 12,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/ai/chat' && method === 'POST') {
        const payload = JSON.parse(init?.body || '{}');
        window.__aiChatCalls.push(payload);
        return new Response(
          JSON.stringify({
            reply: 'Hallo Anna! Schön, dich kennenzulernen.',
            correction: '',
            explanation: '',
            mode: payload.mode,
            level: payload.level,
            model: 'ui-audit',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return nativeFetch(input, init);
    };
  });

  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    if (!request.url().endsWith('favicon.ico')) {
      requestFailures.push(`${request.url()} — ${request.failure()?.errorText}`);
    }
  });

  async function settle() {
    await page.waitForFunction(() => document.documentElement.dataset.app === 'ready', { timeout: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  async function open(hash) {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    requestFailures.length = 0;
    // Hash-only navigations are same-document in Chrome; a query string forces
    // a fresh document so each route starts from a clean shell.
    await page.goto(`${BASE}/?ui=${++runId}${hash}`, { waitUntil: 'networkidle0', timeout: 20000 });
    await settle();
  }

  console.log('Routes');
  for (const [hash, selector] of routes) {
    await open(hash);
    if (!(await page.$(selector))) note(`${hash}: missing ${selector}`);

    const isIntentional404 = hash === '#/does-not-exist';
    const errorView = await page.$('.error-page__code');
    if (errorView && !isIntentional404) {
      const title = await page.$eval('.error-page__title', (el) => el.textContent.trim());
      note(`${hash}: rendered error view "${title}"`);
    }
    if (isIntentional404) {
      const code = await page.$eval('.error-page__code', (el) => el.textContent.trim());
      if (code !== '404') note(`${hash}: expected a 404 page, saw "${code}"`);
    }

    if (pageErrors.length) note(`${hash}: page errors — ${pageErrors.join(' | ')}`);
    if (consoleErrors.length) note(`${hash}: console errors — ${consoleErrors.join(' | ')}`);
    if (requestFailures.length) note(`${hash}: failed requests — ${requestFailures.join(' | ')}`);
  }
  console.log(`  ${routes.length} routes checked`);

  console.log('Responsive layout');
  for (const [name, width, height] of viewports) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    for (const [hash] of routes) {
      await open(hash);
      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      if (overflow.scroll > overflow.client + 1) {
        note(`${name} ${hash}: horizontal overflow ${overflow.scroll}px > ${overflow.client}px`);
      }
    }
    console.log(`  ${name} (${width}px)`);
  }

  console.log('Interactions');
  await page.setViewport({ width: 1440, height: 1000 });
  await open('#/dashboard');

  // The skip link must move focus without destroying the hash route.
  const hashBeforeSkip = await page.evaluate(() => window.location.hash);
  await page.focus('.skip-link');
  await page.keyboard.press('Enter');
  const skipState = await page.evaluate(() => ({
    hash: window.location.hash,
    focus: document.activeElement?.id || '',
  }));
  if (skipState.hash !== hashBeforeSkip) {
    note(`skip link changed the route from ${hashBeforeSkip} to ${skipState.hash}`);
  }
  if (skipState.focus !== 'main') note(`skip link did not focus main (${skipState.focus || 'none'})`);

  const themeBefore = await page.$eval('html', (el) => el.dataset.theme);
  await page.click('#theme-toggle');
  await new Promise((resolve) => setTimeout(resolve, 250));
  const themeAfter = await page.$eval('html', (el) => el.dataset.theme);
  if (themeBefore === themeAfter) note(`theme toggle did not change theme (${themeAfter})`);

  await page.click('[data-goal="30"]');
  await new Promise((resolve) => setTimeout(resolve, 450));
  const goalPressed = await page.$eval('[data-goal="30"]', (el) => el.getAttribute('aria-pressed'));
  if (goalPressed !== 'true') note('daily goal button did not update');

  await page.click('[data-demo-toggle]');
  await new Promise((resolve) => setTimeout(resolve, 450));
  if (await page.$eval('#demo-flag', (el) => el.hidden)) note('demo badge did not appear');
  await page.click('[data-demo-toggle]');
  await new Promise((resolve) => setTimeout(resolve, 450));
  if (!(await page.$eval('#demo-flag', (el) => el.hidden))) note('demo badge did not clear');

  await page.click('#sidebar-collapse');
  await new Promise((resolve) => setTimeout(resolve, 350));
  const sidebarState = await page.$eval('#app', (el) => el.dataset.sidebar);
  if (sidebarState !== 'collapsed') note(`sidebar collapse failed (${sidebarState})`);
  await page.click('#sidebar-collapse');
  await new Promise((resolve) => setTimeout(resolve, 350));
  const sidebarExpanded = await page.$eval('#app', (el) => el.dataset.sidebar);
  if (sidebarExpanded !== 'expanded') note(`sidebar expand failed (${sidebarExpanded})`);

  await open('#/profile');
  await page.click('[data-edit-profile]');
  await page.waitForSelector('#profile-name', { timeout: 3000 });
  await page.click('#profile-name', { clickCount: 3 });
  await page.type('#profile-name', 'Test Learner');
  await page.click('button[form="profile-form"]');
  await page.waitForFunction(() => document.getElementById('account-name')?.textContent === 'Test Learner', {
    timeout: 5000,
  });

  await open('#/dashboard');
  await page.click('#account-btn');
  if (!(await page.$eval('#account-menu', (el) => !el.hidden))) note('account menu did not open');
  await page.click('#menu-signin');
  await page.waitForSelector('.modal-layer .modal', { timeout: 3000 });
  const signInTitle = await page.$eval('.modal__title', (el) => el.textContent);
  if (!/Welcome back/.test(signInTitle)) note(`sign-in modal title unexpected: ${signInTitle}`);
  await page.keyboard.press('Escape');
  await new Promise((resolve) => setTimeout(resolve, 250));

  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await page.waitForSelector('#palette-input', { timeout: 3000 });
  await page.type('#palette-input', 'Apfel', { delay: 20 });
  await page.waitForFunction(() => document.querySelectorAll('[data-palette-item]').length > 0, {
    timeout: 5000,
  });
  const resultCount = await page.$$eval('[data-palette-item]', (els) => els.length);
  if (resultCount === 0) note('search palette returned no results for "Apfel"');
  await page.keyboard.press('Escape');
  await new Promise((resolve) => setTimeout(resolve, 250));

  await open('#/grammar');
  await page.click('[data-topic]');
  await page.waitForSelector('.modal-layer .modal', { timeout: 3000 });
  await page.keyboard.press('Escape');
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (await page.$('.modal-layer')) note('grammar modal did not close with Escape');

  await open('#/vocabulary?word=v-apfel');
  await page.waitForSelector('.modal-layer .modal', { timeout: 3000 });
  await page.evaluate(() => {
    location.hash = '#/dashboard';
  });
  await page.waitForFunction(() => !document.querySelector('.modal-layer'), { timeout: 3000 });
  if (!(await page.$('.hero'))) note('hash navigation with a modal open did not reach the dashboard');

  await open('#/vocabulary');
  await page.type('#vocab-search', 'Apfel', { delay: 20 });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const visibleRows = await page.$$eval('[data-word]', (rows) => rows.filter((row) => !row.hidden).length);
  if (visibleRows !== 1) note(`vocabulary search expected 1 visible row, saw ${visibleRows}`);
  await page.click('[data-clear-search]');
  await new Promise((resolve) => setTimeout(resolve, 150));
  await page.click('[data-favorite="v-apfel"]');
  const favoriteLabel = await page.$eval('[data-favorite="v-apfel"]', (el) => el.getAttribute('aria-pressed'));
  if (favoriteLabel !== 'true') note('favourite toggle did not set aria-pressed=true');

  console.log('Grammar drills');
  await open('#/grammar?topic=a1-sein-haben&tab=practice');
  await page.waitForSelector('.grammar-table', { timeout: 5000 });
  await page.waitForSelector('[data-drill-stage] [data-question]', { timeout: 5000 });
  const drillType = await page.$eval('[data-drill-stage] [data-question]', (el) => el.dataset.type);
  if (drillType !== 'gap') note(`expected the first authored drill to be a gap, saw ${drillType}`);

  for (let index = 0; index < drillSet.length; index += 1) {
    const drill = drillSet[index];
    await page.evaluate((item) => {
      const block = document.querySelector(`[data-question="${CSS.escape(item.id)}"]`);
      if (!block) return;
      if (item.type === 'gap') {
        const input = block.querySelector('[data-answer-input]');
        input.value = item.answers[0] === 'bin' ? 'bist' : 'falsch';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (item.type === 'mcq') {
        const wrong = item.answer === 0 ? 1 : 0;
        block.querySelectorAll('input[type="radio"]')[wrong]?.click();
      } else {
        const tokens = [...block.querySelectorAll('[data-order-tokens] [data-token]')];
        for (const token of tokens) token.click();
      }
    }, drill);
    await page.click('[data-drill-check]');
    await page.waitForSelector('.exercise__feedback:not([hidden])', { timeout: 3000 });
    if (index === 0) {
      const feedbackClass = await page.$eval('.exercise__feedback:not([hidden])', (el) => el.className);
      if (!feedbackClass.includes('incorrect')) note('a wrong drill answer was not marked incorrect');
    }
    await page.click('[data-drill-next]');
  }
  await page.waitForSelector('.drill-result', { timeout: 5000 });
  const drillResult = await page.$eval('.drill-result', (el) => el.textContent.replace(/\s+/g, ' ').trim());
  if (!/0 of 3 correct/.test(drillResult)) note(`unexpected all-wrong drill result: ${drillResult.slice(0, 80)}`);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.modal-layer'), { timeout: 3000 });
  await open('#/grammar');
  await page.waitForSelector('[data-review-mistakes]', { timeout: 4000 });
  await page.click('[data-review-mistakes]');
  await page.waitForSelector('.mistake-review__item', { timeout: 3000 });
  const mistakeCount = await page.$$eval('.mistake-review__item', (els) => els.length);
  if (mistakeCount < drillSet.length) note(`mistake review showed ${mistakeCount} of ${drillSet.length} saved answers`);
  await page.keyboard.press('Escape');
  await new Promise((resolve) => setTimeout(resolve, 250));

  console.log('Flashcards');
  await open('#/vocabulary?tab=flashcards&start=1');
  await page.waitForSelector('.flashcard', { timeout: 5000 });
  const firstCardId = flashcardDeck[0].id;
  for (let reviewed = 0; reviewed < 20; reviewed += 1) {
    if (!(await page.$('.flashcard'))) break;
    await page.click('[data-fc-show]');
    await page.click('[data-fc-grade-button="good"]');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  await page.waitForSelector('.flashcard-summary', { timeout: 5000 });
  const storedCards = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('dl:state:v1') || '{}');
    return state.progress?.flashcards || {};
  });
  if (!storedCards[firstCardId]) note(`flashcard ${firstCardId} was not persisted after grading`);
  if (Object.values(storedCards).some((record) => new Date(record.due).getTime() <= Date.now())) {
    note('a card graded "Good" was still scheduled for immediate review');
  }
  const summaryText = await page.$eval('.flashcard-summary', (el) => el.textContent.replace(/\s+/g, ' ').trim());
  if (!/cards? reviewed/.test(summaryText)) note(`flashcard summary missing a review count: ${summaryText.slice(0, 80)}`);

  await open('#/courses/a1');
  const lessonHref = await page.$eval('a.lesson-row[href^="#/courses/a1/"]', (el) => el.getAttribute('href'));
  await page.click('a.lesson-row[href^="#/courses/a1/"]');
  await page.waitForFunction(() => location.hash.startsWith('#/courses/a1/a1-'), { timeout: 5000 });
  if (!lessonHref) note('course page has no lesson links');

  console.log('Lesson engine');
  await open('#/courses/a1/a1-m1-l2');
  await page.waitForSelector('.locked-card', { timeout: 5000 });
  if (await page.$('[data-assessment-form]')) note('a locked lesson rendered the assessment');

  await open('#/courses/a1/a1-m1-l1');
  await page.waitForSelector('.lesson-map__item', { timeout: 8000 });
  const sectionCount = await page.$$eval('.lesson-map__item', (els) => els.length);
  if (sectionCount !== 17) note(`lesson map expected 17 sections, saw ${sectionCount}`);

  await page.click('[data-next]');
  await page.waitForFunction(
    () => /Learning objectives/.test(document.querySelector('.section-heading')?.textContent || ''),
    { timeout: 3000 },
  );

  await page.click('.lesson-map__item[data-section="16"]');
  await page.waitForSelector('[data-assessment-form]', { timeout: 5000 });

  const exemplar = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'content', 'lessons', 'a1-m1-l1.json'), 'utf8'),
  );
  const answers = exemplar.sections[16].questions.map((question) => {
    if (question.type === 'mcq') return { id: question.id, type: 'mcq', answer: question.answer };
    if (question.type === 'gap') return { id: question.id, type: 'gap', answer: question.answers[0] };
    const used = new Set();
    const sequence = [];
    let cursor = 0;
    while (sequence.length < question.tokens.length) {
      let best = -1;
      let bestPos = Infinity;
      question.tokens.forEach((token, index) => {
        if (used.has(index)) return;
        const position = question.answer.indexOf(token, cursor);
        if (position >= 0 && position < bestPos) {
          bestPos = position;
          best = index;
        }
      });
      if (best < 0) {
        best = question.tokens.findIndex((_, index) => !used.has(index));
        bestPos = cursor;
      }
      used.add(best);
      sequence.push(question.tokens[best]);
      cursor = bestPos + question.tokens[best].length;
    }
    return { id: question.id, type: 'order', sequence };
  });

  const answered = await page.evaluate((payload) => {
    const missing = [];
    for (const item of payload) {
      const block = document.querySelector(`[data-question="${CSS.escape(item.id)}"]`);
      if (!block) {
        missing.push(item.id);
        continue;
      }
      if (item.type === 'mcq') {
        block.querySelectorAll('input[type="radio"]')[item.answer]?.click();
      } else if (item.type === 'gap') {
        const input = block.querySelector('[data-answer-input]');
        input.value = item.answer;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        for (const word of item.sequence) {
          const token = [...block.querySelectorAll('[data-order-tokens] [data-token]')].find(
            (button) => button.textContent === word,
          );
          token?.click();
        }
      }
    }
    return missing;
  }, answers);
  if (answered.length) note(`assessment missing question blocks: ${answered.join(', ')}`);

  await page.click('[data-submit-assessment]');
  await page.waitForSelector('.assessment-result', { timeout: 5000 });
  const resultClass = await page.$eval('.assessment-result', (el) => el.className);
  if (!resultClass.includes('assessment-result--pass')) {
    const resultText = await page.$eval('.assessment-result', (el) => el.textContent.trim());
    note(`exemplar assessment did not pass: ${resultText.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  const completionChip = await page.$eval('[data-lesson-status]', (el) => el.textContent.trim());
  if (!/Completed/.test(completionChip)) note(`lesson status did not update after pass: ${completionChip}`);

  await open('#/courses/a1/a1-m1-l2');
  await page.waitForSelector('.lesson-hero', { timeout: 5000 });
  if (await page.$('.locked-card')) note('next lesson stayed locked after the previous assessment passed');

  await open('#/courses/a1/a1-m1-l1');
  await page.waitForSelector('.lesson-map__item', { timeout: 5000 });
  await page.click('.lesson-map__item[data-section="16"]');
  await page.waitForSelector('[data-assessment-form]', { timeout: 5000 });
  await page.click('[data-submit-assessment]');
  await page.waitForSelector('.assessment-result', { timeout: 5000 });
  const retakeFailed = await page.$eval('.assessment-result', (el) =>
    el.className.includes('assessment-result--fail'),
  );
  if (!retakeFailed) note('an unanswered retake was not marked as failed');
  const retakeChip = await page.$eval('[data-lesson-status]', (el) => el.textContent.trim());
  if (!/Completed/.test(retakeChip)) note('a failed retake revoked the earlier completion');

  console.log('AI tutor & real-life conversations');
  await open('#/tutor');
  await page.waitForSelector('[data-ai-status]', { timeout: 5000 });
  await page.waitForFunction(() => !/Checking/.test(document.querySelector('[data-ai-status]')?.textContent || ''), {
    timeout: 5000,
  });
  const aiStatus = await page.$eval('[data-ai-status]', (el) => el.textContent.replace(/\s+/g, ' ').trim());
  if (!/configured|not set|unavailable/i.test(aiStatus)) {
    note(`AI status panel did not report configuration clearly: ${aiStatus.slice(0, 120)}`);
  }
  const seededMessages = await page.$$eval('.ai-msg', (elements) => elements.length);
  if (seededMessages !== 0) note(`a fresh AI conversation showed ${seededMessages} fabricated message(s)`);
  if (/not set|not configured|unavailable/i.test(aiStatus)) {
    const sendDisabled = await page.$eval('[data-ai-send]', (el) => el.disabled);
    if (!sendDisabled) note('AI composer was enabled while the server reported no provider');
  }

  // This audit normally runs with no provider key. Enable the configured
  // status only for the role-play send regression below.
  await page.evaluate(() => sessionStorage.setItem('ui-force-ai', '1'));
  await open('#/conversations');
  await page.waitForSelector('[data-ai-scenario]', { timeout: 5000 });
  const scenarioCount = async (selector) =>
    page.$$eval(`${selector} option`, (options) => options.filter((option) => option.value).length);
  // The learner's default target level is B1, so choose A1 explicitly here.
  await page.select('[data-ai-level]', 'a1');
  if ((await scenarioCount('[data-ai-scenario]')) !== 7) note('A1 role-play scenario picker did not show 7 authored scenarios');
  await page.select('[data-ai-level]', 'c2');
  if ((await scenarioCount('[data-ai-scenario]')) !== 5) note('C2 role-play scenario picker did not show 5 authored scenarios');

  // End-to-end role-play regression: a level change must keep an authored
  // scenario selected, and a sent turn must produce a saved provider reply.
  await page.select('[data-ai-level]', 'a1');
  await page.waitForFunction(() => !/Checking/.test(document.querySelector('[data-ai-status]')?.textContent || ''), {
    timeout: 5000,
  });
  const selectedScenario = await page.$eval('[data-ai-scenario]', (el) => el.value);
  if (!selectedScenario) note('role-play scenario was empty after changing the CEFR level');
  await page.type('[data-ai-input]', 'Hallo, ich heiße Anna.');
  await page.click('[data-ai-send]');
  await page.waitForSelector('[data-ai-thread] .ai-msg--ai', { timeout: 5000 });
  const roleplayCall = await page.evaluate(() => window.__aiChatCalls.at(-1));
  if (roleplayCall?.mode !== 'roleplay' || roleplayCall?.level !== 'a1' || roleplayCall?.scenario !== selectedScenario) {
    note(`role-play request lost its scene context: ${JSON.stringify(roleplayCall)}`);
  }
  if (roleplayCall?.messages?.at(-1)?.text !== 'Hallo, ich heiße Anna.') {
    note('role-play request did not contain the learner message');
  }
  const roleplayTurns = await page.$$eval('[data-ai-thread] .ai-msg', (elements) => elements.length);
  if (roleplayTurns !== 2) note(`role-play transcript showed ${roleplayTurns} messages instead of 2`);
  await page.click('[data-ai-new]');
  await page.waitForFunction(() => document.querySelectorAll('[data-ai-thread] .ai-msg').length === 0, {
    timeout: 3000,
  });
  await page.evaluate(() => sessionStorage.removeItem('ui-force-ai'));

  // Seed a learner's own transcript to verify rendering and persistence without
  // asking the browser audit to fabricate a provider reply.
  await page.evaluate(() => {
    const key = 'dl:state:v1';
    const state = JSON.parse(localStorage.getItem(key) || '{}');
    const now = new Date().toISOString();
    state.version = 6;
    state.progress = state.progress || {};
    state.progress.aiConversations = [
      {
        id: 'audit-chat',
        mode: 'tutor',
        level: 'a1',
        scenario: '',
        title: 'German tutor · audit',
        createdAt: now,
        updatedAt: now,
        messages: [
          { id: 'audit-msg-1', role: 'user', text: 'Ich bin Anna.', at: now },
          {
            id: 'audit-msg-2',
            role: 'assistant',
            text: 'Freut mich, Anna!',
            translation: 'Nice to meet you, Anna.',
            correction: 'Ich bin Anna.',
            explanation: 'German nouns are capitalised.',
            at: now,
          },
        ],
      },
    ];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await open('#/tutor');
  await page.waitForSelector('.ai-msg--ai', { timeout: 5000 });
  for (const selector of ['.ai-feedback--translation', '.ai-feedback--correction', '.ai-feedback--explanation']) {
    if (!(await page.$(selector))) note(`${selector} did not render the saved AI metadata`);
  }
  await page.click('[data-ai-new]');
  await page.waitForFunction(() => document.querySelectorAll('.ai-msg').length === 0, { timeout: 3000 });

  console.log('Speaking practice & pronunciation');
  await open('#/speaking');
  await page.waitForSelector('[data-speaking-recognition-status]', { timeout: 5000 });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.speech-status__text')].every(
        (element) => !/Checking/.test(element.textContent || ''),
      ),
    { timeout: 5000 },
  );
  if (await page.$eval('[data-listen-start]', (el) => el.disabled)) {
    note('browser speech recognition button was disabled despite the test recognition stub');
  }
  const promptBefore = await page.$eval('[data-speaking-prompt] .speech-prompt__text', (el) => el.textContent.trim());
  await page.click('[data-listen-start]');
  await page.waitForFunction(
    () => (document.querySelector('[data-speaking-transcript]')?.value || '').includes('Ich heiße Anna'),
    { timeout: 5000 },
  );
  const aiOnline = await page.$eval('[data-speaking-ai-status]', (el) => /AI connected/.test(el.textContent));
  const askDisabled = await page.$eval('[data-speaking-ask]', (el) => el.disabled);
  if (askDisabled === aiOnline) note('speaking reply button did not follow the real AI status');
  await page.click('[data-speaking-save]');
  await page.waitForFunction(
    () => (JSON.parse(localStorage.getItem('dl:state:v1') || '{}').progress?.speakingAttempts || []).length > 0,
    { timeout: 5000 },
  );
  await page.click('[data-speaking-next]');
  const promptAfter = await page.$eval('[data-speaking-prompt] .speech-prompt__text', (el) => el.textContent.trim());
  if (promptBefore === promptAfter) note('New prompt did not change the authored speaking prompt');

  console.log('Voice conversation with partner');
  await open('#/talk');
  await page.waitForSelector('[data-talk-mic-status]', { timeout: 5000 });
  await page.waitForFunction(
    () => !/Checking/.test(document.querySelector('[data-talk-status]')?.textContent || ''),
    { timeout: 5000 },
  );
  if (await page.$eval('[data-talk-listen]', (el) => el.disabled)) {
    note('voice microphone was disabled despite the test recognition stub');
  }
  await page.click('[data-talk-listen]');
  await page.waitForFunction(
    () => (document.querySelector('[data-talk-input]')?.value || '').includes('Ich heiße Anna'),
    { timeout: 5000 },
  );
  const talkStatus = await page.$eval('[data-talk-status]', (el) => el.textContent.replace(/\s+/g, ' ').trim());
  if (!/configured|not set|unavailable/i.test(talkStatus)) {
    note(`voice status panel did not report configuration clearly: ${talkStatus.slice(0, 120)}`);
  }
  const talkMessages = await page.$$eval('[data-talk-thread] .ai-msg--ai', (elements) => elements.length);
  if (talkMessages !== 0) note(`voice screen fabricated ${talkMessages} partner message(s) without a configured provider`);
  const talkReady = /AI connected/.test(talkStatus);
  const talkSendDisabled = await page.$eval('[data-talk-send]', (el) => el.disabled);
  if (talkSendDisabled === talkReady) note('voice send button did not follow the real AI status');

  await open('#/pronunciation');
  await page.waitForSelector('[data-pronunciation-status]', { timeout: 5000 });
  await page.waitForFunction(
    () => !/Checking/.test(document.querySelector('[data-pronunciation-status]')?.textContent || ''),
    { timeout: 5000 },
  );
  if (await page.$eval('[data-pronunciation-listen]', (el) => el.disabled)) {
    note('pronunciation recognition button was disabled despite the test recognition stub');
  }
  await page.click('[data-pronunciation-listen]');
  await page.waitForFunction(
    () => (document.querySelector('[data-pronunciation-transcript]')?.value || '').includes('Ich heiße Anna'),
    { timeout: 5000 },
  );
  await page.click('[data-pronunciation-compare]');
  await page.waitForSelector('.pronunciation-result', { timeout: 5000 });
  await page.waitForFunction(
    () => (JSON.parse(localStorage.getItem('dl:state:v1') || '{}').progress?.pronunciationLog || []).length > 0,
    { timeout: 5000 },
  );

  await open('#/settings');
  await page.waitForSelector('[data-clear-ai]', { timeout: 5000 });
  await page.click('[data-clear-ai]');
  await page.waitForSelector('[data-confirm]', { timeout: 3000 });
  await page.click('[data-confirm]');
  await page.waitForFunction(
    () => (JSON.parse(localStorage.getItem('dl:state:v1') || '{}').progress?.aiConversations || []).length === 0,
    { timeout: 5000 },
  );

  console.log('Practice exercises & mock exams');
  const bankForAudit = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'exercise-bank.json'), 'utf8'));
  const bankById = new Map(bankForAudit.questions.map((question) => [question.id, question]));

  // Practice session: answer everything deliberately wrong, then verify the
  // attempt, the saved mistake queue and the targeted retry all work.
  await open('#/exercises?level=a1&size=5');
  await page.waitForSelector('.exercise-setup', { timeout: 5000 });
  const matchText = await page.$eval('[data-ex-count]', (el) => el.textContent.trim());
  if (/No questions match/.test(matchText)) note(`exercise filters produced no questions: ${matchText}`);
  const attemptsBefore = Number(await page.$eval('[data-ex-summary-attempts]', (el) => el.textContent.trim()));
  await page.click('[data-ex-start]');
  await page.waitForSelector('[data-drill-session]', { timeout: 5000 });
  for (let index = 0; index < 5; index += 1) {
    if (!(await page.$('[data-drill-stage] [data-question]'))) {
      note(`practice session ended early at question ${index + 1}`);
      break;
    }
    const id = await page.$eval('[data-drill-stage] [data-question]', (el) => el.dataset.question);
    const question = bankById.get(id);
    if (!question) {
      note(`practice question "${id}" is missing from the exercise bank`);
      break;
    }
    if (question.type === 'mcq') {
      const wrong = (question.answer + 1) % question.options.length;
      await page.click(`[data-question="${id}"] input[type="radio"][value="${wrong}"]`);
    } else if (question.type === 'gap') {
      await page.type(`[data-question="${id}"] [data-answer-input]`, 'zzwrongzz');
    } else {
      await page.click(`[data-question="${id}"] [data-order-tokens] [data-token]`);
    }
    await page.click('[data-drill-check]');
    await page.waitForSelector('[data-drill-next]:not([hidden])', { timeout: 3000 });
    await page.click('[data-drill-next]');
  }
  await page.waitForSelector('.drill-result', { timeout: 5000 });
  const attemptsAfter = Number(await page.$eval('[data-ex-summary-attempts]', (el) => el.textContent.trim()));
  if (attemptsAfter !== attemptsBefore + 1) note(`practice attempt was not recorded (${attemptsBefore} → ${attemptsAfter})`);
  const savedMistakes = Number(await page.$eval('[data-ex-summary-mistakes]', (el) => el.textContent.trim()));
  if (savedMistakes < 1) note('no practice mistakes were saved');
  if (!(await page.$('[data-mistakes-mount] .mistake-review__item'))) note('mistake review list is empty after misses');
  const retryButton = await page.$('[data-ex-retry-mistakes]');
  if (!retryButton) note('mistake retry button is missing');
  else {
    await retryButton.click();
    await page.waitForSelector('[data-drill-session]', { timeout: 5000 });
    if (!(await page.$('[data-drill-stage] [data-question]'))) note('mistake retry did not render a question');
  }

  // Mock exam: answer one question, save & exit, resume, then submit and
  // confirm the result reveals no correct answers.
  await open('#/exams?level=a1');
  await page.waitForSelector('.exam-levels', { timeout: 5000 });
  if (!(await page.$('.exam-readiness'))) note('exam readiness report is missing');
  await page.click('[data-exam-start="a1"]');
  await page.waitForSelector('.exam-taking', { timeout: 5000 });
  if (!(await page.$('[data-exam-clock]'))) note('exam countdown clock is missing');
  const examQuestionCount = await page.$$eval('.exam-question', (els) => els.length);
  if (examQuestionCount !== 14) note(`exam should have 14 questions, found ${examQuestionCount}`);
  const firstExamQuestion = await page.$eval('.exam-question .exercise', (el) => ({
    id: el.dataset.question,
    type: el.dataset.type,
  }));
  if (firstExamQuestion.type === 'mcq') {
    await page.click('.exam-question .exercise input[type="radio"]');
  } else if (firstExamQuestion.type === 'gap') {
    await page.type('.exam-question .exercise [data-answer-input]', 'allein');
  } else {
    await page.click('.exam-question .exercise [data-order-tokens] [data-token]');
  }
  await page.waitForFunction(
    () => /1\/14 answered/.test(document.querySelector('[data-exam-answered]')?.textContent || ''),
    { timeout: 3000 },
  ).catch(() => note('exam answer counter did not update after answering'));

  // Save & exit should hand control back to the level list with a resume option.
  await page.click('[data-exam-exit]');
  await page.waitForSelector('.exam-levels', { timeout: 5000 });
  const resumeLabel = await page.$eval('[data-exam-start="a1"]', (el) => el.textContent.trim());
  if (!/Resume/.test(resumeLabel)) note(`save & exit did not offer a resume paper (${resumeLabel})`);

  // Re-open and resume; the saved answer must be restored.
  await open('#/exams?level=a1');
  await page.waitForSelector('[data-exam-start="a1"]', { timeout: 5000 });
  await page.click('[data-exam-start="a1"]');
  await page.waitForSelector('.exam-taking', { timeout: 5000 });
  const resumedCount = await page.$eval('[data-exam-answered]', (el) => el.textContent.trim());
  if (!/1\/14 answered/.test(resumedCount)) note(`resumed exam lost its saved answer (${resumedCount})`);

  // Submit and verify an answer-free, score-only result.
  // The exam view calls scrollIntoView({behavior:'smooth'}) on mount. Dispatch
  // the click on the element itself instead of at viewport coordinates so an
  // in-flight smooth scroll cannot make the pointer land on the wrong node.
  if (!(await page.$('.exam-taking [data-exam-submit]'))) note('submit button vanished before submission');
  await page.$eval('[data-exam-submit]', (el) => el.click());
  await page.waitForSelector('.modal-layer [data-confirm]', { timeout: 5000 });
  await page.click('.modal-layer [data-confirm]');
  await page.waitForSelector('.exam-result', { timeout: 5000 });
  const resultText = await page.$eval('.exam-result', (el) => el.textContent);
  if (!/No answer key is shown/.test(resultText)) note('exam result is missing the no-answer-key notice');
  if (/Correct answer:/.test(resultText)) note('exam result revealed a correct answer');
  if (await page.$('.exam-question')) note('exam result still shows questions from the paper');
  if (!(await page.$('.exam-result__grids'))) note('exam result is missing its section and skill breakdown');
  if (!(await page.$('.exam-prompt'))) note('unscored writing/speaking prompts are missing from the result');

  console.log('Graded skill practice');
  await open('#/reading');
  await page.waitForSelector('[data-skill-view="reading"] .skill-passage', { timeout: 5000 });
  const readingTaskId = await page.$eval('#reading-task', (el) => el.value);
  const readingTask = skillTasks[readingTaskId];
  if (!readingTask) note(`reading view selected an unknown task "${readingTaskId}"`);
  else {
    for (const question of readingTask.questions) {
      await page.click(`[data-question="${question.id}"] input[type="radio"][value="${question.answer}"]`);
    }
    await page.click('[data-skill-check]');
    await page.waitForSelector('[data-skill-result]:not([hidden])', { timeout: 3000 });
    const result = await page.$eval('[data-skill-result]', (el) => el.textContent);
    if (!new RegExp(`${readingTask.questions.length} of ${readingTask.questions.length} correct`).test(result)) {
      note(`reading check did not report the authored result: ${result.trim().slice(0, 120)}`);
    }
    const historyCount = await page.$$eval('[data-skill-history] .skill-history__item', (els) => els.length);
    if (historyCount < 1) note('reading check was not saved to the local history');
  }

  await open('#/listening');
  await page.waitForSelector('[data-skill-view="listening"] .skill-dictation', { timeout: 5000 });
  const listeningTaskId = await page.$eval('#listening-task', (el) => el.value);
  const listeningTask = skillTasks[listeningTaskId];
  if (!listeningTask) note(`listening view selected an unknown task "${listeningTaskId}"`);
  else {
    for (const question of listeningTask.questions) {
      await page.click(`[data-question="${question.id}"] input[type="radio"][value="${question.answer}"]`);
    }
    for (const line of listeningTask.dictation) {
      await page.type(`[data-dictation="${line.id}"]`, line.text);
    }
    await page.click('[data-skill-check]');
    await page.waitForSelector('[data-skill-result]:not([hidden])', { timeout: 3000 });
    const result = await page.$eval('[data-skill-result]', (el) => el.textContent);
    if (!new RegExp(`${listeningTask.dictation.length} of ${listeningTask.dictation.length}`).test(result)) {
      note(`dictation check did not report the authored result: ${result.trim().slice(0, 140)}`);
    }
    const feedbackCount = await page.$$eval('[data-dictation-feedback]', (els) => els.length);
    if (feedbackCount !== listeningTask.dictation.length) note('dictation feedback rows are missing');
  }

  await open('#/writing');
  await page.waitForSelector('[data-skill-view="writing"] .writing-prompt', { timeout: 5000 });
  const writingTaskId = await page.$eval('#writing-task', (el) => el.value);
  const writingTask = skillTasks[writingTaskId];
  if (!writingTask) note(`writing view selected an unknown task "${writingTaskId}"`);
  else {
    await page.type('[data-writing-text]', writingTask.modelAnswer.join(' '));
    await page.click('[data-writing-check]');
    await page.waitForSelector('[data-writing-result]:not([hidden])', { timeout: 3000 });
    const result = await page.$eval('[data-writing-result]', (el) => el.textContent);
    if (!/deterministic, not an AI grammar score/.test(result)) note('writing result is missing its honest label');
    if (!new RegExp(`${writingTask.checks.length} of ${writingTask.checks.length} checks met`).test(result)) {
      note(`writing checklist did not report the authored result: ${result.trim().slice(0, 140)}`);
    }
    await page.waitForFunction(
      () => /Draft saved/.test(document.querySelector('[data-writing-status]')?.textContent || ''),
      { timeout: 3000 },
    ).catch(() => note('writing draft was not autosaved'));
  }

  await open('#/progress');
  await page.waitForSelector('.skill-analytics-card', { timeout: 5000 });
  const savedChecks = Number(
    await page.$eval('.skill-analytics-summary div:first-child strong', (el) => el.textContent.trim()),
  );
  if (savedChecks < 3) note(`skill analytics did not count the saved checks (${savedChecks})`);
  const analyticsRows = await page.$$eval('.skill-analytics-row', (els) => els.length);
  if (analyticsRows !== 3) note(`skill analytics should show three skill rows, saw ${analyticsRows}`);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await open('#/dashboard');
  await page.click('#menu-btn');
  await page.waitForFunction(() => document.querySelector('#app')?.dataset.drawer === 'open', {
    timeout: 3000,
  });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#app')?.dataset.drawer, { timeout: 3000 });
  if (!(await page.$eval('#mobile-nav', (el) => getComputedStyle(el).display !== 'none'))) {
    note('mobile bottom navigation is not visible at 390px');
  }
  const mobileNavItems = await page.$$eval('.mobile-nav__item', (els) => els.length);
  if (mobileNavItems < 4) note(`mobile nav has only ${mobileNavItems} items`);

  await page.setViewport({ width: 1440, height: 1000 });
  await open('#/settings');
  const themeChoices = await page.$$eval('[data-theme-choice]', (els) => els.map((el) => el.dataset.themeChoice));
  if (!themeChoices.includes('dark') || !themeChoices.includes('light')) {
    note(`settings theme choices unexpected: ${themeChoices.join(', ')}`);
  } else {
    await page.click('[data-theme-choice="light"]');
    await new Promise((resolve) => setTimeout(resolve, 200));
    if ((await page.$eval('html', (el) => el.dataset.theme)) !== 'light') {
      note('settings light theme not applied');
    }
    await page.click('[data-theme-choice="dark"]');
    await new Promise((resolve) => setTimeout(resolve, 200));
    if ((await page.$eval('html', (el) => el.dataset.theme)) !== 'dark') {
      note('settings dark theme not applied');
    }
  }

  await page.click('label[for="pref-motion"]');
  await new Promise((resolve) => setTimeout(resolve, 150));
  if ((await page.$eval('html', (el) => el.dataset.motion)) !== 'reduced') {
    note('reduced-motion preference did not apply');
  }
  await page.click('label[for="pref-motion"]');

  await page.click('label[for="pref-text"]');
  await new Promise((resolve) => setTimeout(resolve, 150));
  if ((await page.$eval('html', (el) => el.dataset.text)) !== 'large') {
    note('large-text preference did not apply');
  }
  await page.click('label[for="pref-text"]');

  const progressBefore = await page.evaluate(() => localStorage.getItem('dl:state:v1'));
  await page.click('[data-reset-progress]');
  await page.waitForSelector('[data-confirm]', { timeout: 3000 });
  await page.click('.modal__foot [data-modal-close]');
  await page.waitForFunction(() => !document.querySelector('.modal-layer'), { timeout: 3000 });
  const progressAfter = await page.evaluate(() => localStorage.getItem('dl:state:v1'));
  if (progressBefore !== progressAfter) note('cancelling reset progress still changed local data');

  await open('#/nope');
  const notFound = await page.$eval('.error-page__code', (el) => el.textContent.trim());
  if (notFound !== '404') note(`unknown route did not render 404 (${notFound})`);

  console.log(`  ${problems.length === 0 ? 'all interaction checks passed' : `${problems.length} problem(s)`}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log('');
if (problems.length) {
  console.log(`UI AUDIT FAILED — ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('UI AUDIT PASSED — routes, responsiveness and interactions verified.');
