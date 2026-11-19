/**
 * Friendly not-found / invalid-content page.
 */
import { escapeHtml, icon } from './ui.js';

export function renderNotFound(ctx, { title = 'We could not find that page', message = '' } = {}) {
  const target = ctx?.params?.path ? `“${ctx.params.path}”` : 'this page';
  const html = `
    <div class="page page--narrow">
      <div class="error-page card">
        <span class="error-page__code">404</span>
        <span class="error-page__icon">${icon('compass')}</span>
        <h1 class="error-page__title">${escapeHtml(title)}</h1>
        <p class="error-page__text">${escapeHtml(message || `Nothing lives at ${target}. It may have moved, or the address may contain a typo.`)}</p>
        <div class="error-page__actions">
          <a class="btn btn--primary" href="#/dashboard">${icon('grid')} Back to dashboard</a>
          <a class="btn btn--soft" href="#/courses">${icon('book')} Browse courses</a>
        </div>
        <div class="error-page__links">
          <span>Popular places:</span>
          <a href="#/grammar">Grammar Academy</a>
          <a href="#/vocabulary">Vocabulary Builder</a>
          <a href="#/progress">My Progress</a>
        </div>
      </div>
    </div>`;

  return {
    title: 'Not found',
    crumbs: [{ label: 'Not found' }],
    html,
    mount() {},
  };
}
