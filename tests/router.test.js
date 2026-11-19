/**
 * Pure tests for hash parsing and route resolution. No DOM or browser is
 * needed: callers pass the hash explicitly so `window` is never touched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { hrefFor, parseHash, resolveRoute } from '../frontend/js/router.js';

test('parseHash decodes well-formed segments and leaves the query intact', () => {
  const parsed = parseHash('#/courses/b1/grammatik?level=b1&tab=uebung');
  assert.deepEqual(parsed.segments, ['courses', 'b1', 'grammatik']);
  assert.deepEqual(parsed.query, { level: 'b1', tab: 'uebung' });
  assert.equal(resolveRoute(parsed).name, 'lesson');
  assert.deepEqual(resolveRoute(parsed).params, { levelId: 'b1', lessonId: 'grammatik' });
});

test('parseHash falls back to the raw segment for malformed escapes instead of throwing', () => {
  const parsed = parseHash('#/%');
  assert.deepEqual(parsed.segments, ['%']);
  assert.equal(resolveRoute(parsed).name, 'not-found');
  assert.equal(resolveRoute(parsed).params.path, '%');
});

test('one bad segment never blocks the rest of the route', () => {
  const parsed = parseHash('#/courses/a1/%E0%A4%A');
  assert.deepEqual(parsed.segments, ['courses', 'a1', '%E0%A4%A']);
  const route = resolveRoute(parsed);
  assert.equal(route.name, 'lesson');
  assert.equal(route.params.levelId, 'a1');
  assert.equal(route.params.lessonId, '%E0%A4%A');
});

test('an empty or known hash still resolves to a safe route', () => {
  assert.equal(resolveRoute(parseHash('')).name, 'dashboard');
  assert.equal(resolveRoute(parseHash('#/dashboard')).name, 'dashboard');
  assert.equal(resolveRoute(parseHash('#/courses')).name, 'courses');
  assert.equal(resolveRoute(parseHash('#/%ZZ?x=1')).name, 'not-found');
  assert.equal(hrefFor('lesson', { levelId: 'a1', lessonId: 'x' }), '#/courses/a1/x');
});
