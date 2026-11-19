/**
 * My Profile — local learner profile plus real account and sync controls.
 *
 * The page works as a guest with localStorage only. When accounts are
 * configured and the learner signs in, the same state can be pushed to and
 * restored from the authenticated server store. Every state shown here comes
 * from the server or from recorded local activity — never invented.
 */
import { curriculum, findWord } from './content.js';
import { getState, getSyncMeta, updateProfile } from './store.js';
import { getSessionSnapshot, refreshSession } from './session.js';
import { getSyncSnapshot, downloadRemoteState, forgetRemoteState, pushLocalState } from './sync-client.js';
import { openAuthDialog, openDeleteAccountDialog, performLogout } from './auth-ui.js';
import { escapeHtml, formatDate, icon, initials, openModal, speakGerman, toast } from './ui.js';

const NATIVE_LANGUAGES = ['English', 'Hindi', 'Chinese', 'Spanish', 'French', 'Arabic', 'Other'];
const LEARNING_GOALS = [
  'Travel & everyday life',
  'Work & career',
  'University & research',
  'Family & friends',
  'Exam preparation',
  'Culture & media',
];

function optionList(values, selected) {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`,
    )
    .join('');
}

function profileForm(profile) {
  return `
    <form class="form" id="profile-form" novalidate>
      <div class="field">
        <label class="field__label" for="profile-name">Display name</label>
        <input class="input" id="profile-name" name="name" type="text" maxlength="60" autocomplete="nickname"
          placeholder="e.g. Aditi Sharma" value="${escapeHtml(profile.name || '')}" />
        <p class="field__hint">Used for greetings and your avatar. Leave blank to stay a guest learner.</p>
      </div>

      <div class="form-grid">
        <div class="field">
          <label class="field__label" for="profile-native">Native language</label>
          <span class="select-wrap">
            <select class="select" id="profile-native" name="nativeLanguage">
              ${optionList(NATIVE_LANGUAGES, profile.nativeLanguage)}
            </select>
            ${icon('chevron-down')}
          </span>
        </div>
        <div class="field">
          <label class="field__label" for="profile-goal">Learning goal</label>
          <span class="select-wrap">
            <select class="select" id="profile-goal" name="learningGoal">
              ${optionList(LEARNING_GOALS, profile.learningGoal)}
            </select>
            ${icon('chevron-down')}
          </span>
        </div>
      </div>

      <div class="field">
        <label class="field__label" for="profile-target">Target CEFR level</label>
        <span class="select-wrap">
          <select class="select" id="profile-target" name="targetLevel">
            ${curriculum.levels
              .map(
                (level) =>
                  `<option value="${level.id}" ${level.id === profile.targetLevel ? 'selected' : ''}>${escapeHtml(
                    level.code,
                  )} · ${escapeHtml(level.name)} — ${escapeHtml(level.title)}</option>`,
              )
              .join('')}
          </select>
          ${icon('chevron-down')}
        </span>
        <p class="field__hint">This shapes recommendations and your dashboard goal. It does not skip any lesson.</p>
      </div>

      <div class="callout callout--info">
        <span class="callout__icon">${icon('shield')}</span>
        <p>Your profile is always kept on this device. Signing in adds optional sync; it never changes lesson gates.</p>
      </div>

      <button class="sr-only" type="submit">Save profile</button>
    </form>`;
}

function editProfile(ctx) {
  const profile = getState().profile;

  const close = openModal({
    title: 'Edit your profile',
    subtitle: 'Saved on this device · no account required',
    size: 'md',
    content: profileForm(profile),
    footer: `
      <button class="btn btn--ghost" type="button" data-modal-cancel>Cancel</button>
      <button class="btn btn--primary" type="submit" form="profile-form">Save profile ${icon('check')}</button>`,
    onMount(modal, closeModal) {
      const form = modal.querySelector('#profile-form');
      modal.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);
      form?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const name = String(data.get('name') || '').trim().slice(0, 60);
        updateProfile({
          name,
          nativeLanguage: String(data.get('nativeLanguage') || 'English'),
          learningGoal: String(data.get('learningGoal') || 'Travel & everyday life'),
          targetLevel: String(data.get('targetLevel') || 'b1'),
        });
        closeModal();
        toast(name ? `Profile saved. Willkommen, ${name.split(/\s+/)[0]}.` : 'Profile saved.', {
          type: 'success',
          duration: 3000,
        });
        ctx.refresh();
      });
    },
  });

  return close;
}

function favouriteWords(stats) {
  return stats.favoriteWordIds
    .map(findWord)
    .filter(Boolean)
    .slice(0, 6);
}

function syncStatusMarkup(session) {
  if (!session.authenticated) return '';
  const sync = getSyncSnapshot();
  const meta = getSyncMeta();
  const label = {
    idle: 'Not synced yet',
    syncing: 'Saving…',
    synced: 'Up to date',
    error: 'Sync needs attention',
    conflict: 'Versions differ',
  }[sync.status] || 'Not synced yet';
  const detail = sync.message || (meta.lastSyncedAt ? `Last saved ${formatDate(meta.lastSyncedAt)}` : 'No server copy yet');
  return `
    <div class="sync-state sync-state--${escapeHtml(sync.status)}" role="status" aria-live="polite">
      <span class="status-dot" aria-hidden="true"></span>
      <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></span>
      ${sync.pending ? '<span class="chip chip--warning">Unsaved</span>' : ''}
    </div>`;
}

function accountCardMarkup(session) {
  if (!session.configured) {
    return `
      <section class="card account-card" aria-labelledby="account-title">
        <span class="account-card__icon">${icon('lock')}</span>
        <p class="eyebrow">Accounts & sync</p>
        <h2 class="card__title" id="account-title">Accounts unavailable</h2>
        <p class="card__sub">${escapeHtml(session.reason || 'This server has not enabled accounts.')}</p>
        <div class="callout callout--info">
          <span class="callout__icon">${icon('shield')}</span>
          <p>Your local profile and progress still work. No sign-in form is shown when it cannot authenticate anyone.</p>
        </div>
        <button class="btn btn--soft btn--block" type="button" data-retry-session>${icon('rotate')} Check again</button>
      </section>`;
  }

  if (session.status === 'error') {
    return `
      <section class="card account-card" aria-labelledby="account-title">
        <span class="account-card__icon">${icon('lock')}</span>
        <p class="eyebrow">Accounts & sync</p>
        <h2 class="card__title" id="account-title">Could not check your session</h2>
        <p class="card__sub">${escapeHtml(session.reason || 'The account service did not respond.')}</p>
        <button class="btn btn--soft btn--block" type="button" data-retry-session>${icon('rotate')} Try again</button>
      </section>`;
  }

  if (session.authenticated && session.user) {
    return `
      <section class="card account-card account-card--signed-in" aria-labelledby="account-title">
        <span class="account-card__icon">${icon('shield')}</span>
        <p class="eyebrow">Accounts & sync</p>
        <h2 class="card__title" id="account-title">Signed in</h2>
        <p class="card__sub">${escapeHtml(session.user.email || 'Your account')}</p>
        <dl class="profile-facts profile-facts--compact">
          <div><dt>Account</dt><dd>${escapeHtml(session.user.name || session.user.email || 'Learner')}</dd></div>
          <div><dt>Member since</dt><dd>${escapeHtml(formatDate(session.user.createdAt))}</dd></div>
        </dl>
        ${syncStatusMarkup(session)}
        <div class="account-actions">
          <button class="btn btn--primary btn--block" type="button" data-sync-now>${icon('rotate')} Sync now</button>
          <button class="btn btn--soft btn--block" type="button" data-sync-download>${icon('download')} Download server copy</button>
          <button class="btn btn--ghost btn--block" type="button" data-open-reset>${icon('lock')} Reset password</button>
          <button class="btn btn--ghost btn--block" type="button" data-signout>${icon('log-out')} Sign out</button>
          <button class="btn btn--danger-ghost btn--block" type="button" data-delete-account>Delete account</button>
          <button class="link-btn" type="button" data-delete-remote>Delete saved progress only</button>
        </div>
        <p class="card__note">${icon('info')} Lesson gates and skill scores always come from your own recorded work; sync never creates progress.</p>
      </section>`;
  }

  return `
    <section class="card account-card" aria-labelledby="account-title">
      <span class="account-card__icon">${icon('lock')}</span>
      <p class="eyebrow">Accounts & sync</p>
      <h2 class="card__title" id="account-title">Take your progress with you.</h2>
      <p class="card__sub">Create an account to store your real progress on this server and restore it on another device.</p>
      <ul class="mini-list">
        <li>Salted scrypt passwords and server-side sessions</li>
        <li>Progress saved only from your recorded activity</li>
        <li>Revision checks before one device overwrites another</li>
        <li>Account and saved-progress deletion</li>
      </ul>
      <div class="account-actions">
        <button class="btn btn--primary btn--block" type="button" data-signin>${icon('lock')} Sign in</button>
        <button class="btn btn--soft btn--block" type="button" data-register>${icon('user')} Create account</button>
        <button class="btn btn--ghost btn--block" type="button" data-open-reset>Forgot password?</button>
      </div>
      <p class="card__note">${icon('info')} Browsing as a guest keeps everything in this browser; no data is uploaded.</p>
    </section>`;
}

function wireAccountCard(root, ctx) {
  root.querySelector('[data-retry-session]')?.addEventListener('click', async () => {
    await refreshSession({ force: true });
    ctx.refresh();
  });
  root.querySelector('[data-signin]')?.addEventListener('click', () => {
    openAuthDialog({ mode: 'login', onSuccess: () => ctx.refresh() });
  });
  root.querySelector('[data-register]')?.addEventListener('click', () => {
    openAuthDialog({ mode: 'register', onSuccess: () => ctx.refresh() });
  });
  root.querySelector('[data-open-reset]')?.addEventListener('click', () => {
    openAuthDialog({ mode: 'reset' });
  });
  root.querySelector('[data-signout]')?.addEventListener('click', () => {
    performLogout({ onDone: () => ctx.refresh() });
  });
  root.querySelector('[data-delete-account]')?.addEventListener('click', () => {
    openDeleteAccountDialog({ onDone: () => ctx.refresh() });
  });
  root.querySelector('[data-sync-now]')?.addEventListener('click', async () => {
    try {
      const ok = await pushLocalState();
      if (ok) {
        toast('Progress saved to your account.', { type: 'success', duration: 2800 });
        ctx.refresh();
      }
    } catch (error) {
      toast(error?.message || 'Could not sync progress.', { type: 'error', duration: 4200 });
    }
  });
  root.querySelector('[data-sync-download]')?.addEventListener('click', async () => {
    try {
      const changed = await downloadRemoteState();
      if (changed) {
        toast('Downloaded your saved progress.', { type: 'success', duration: 3000 });
        ctx.refresh();
      } else {
        toast('There is no saved progress on the server yet.', { type: 'info', duration: 3200 });
      }
    } catch (error) {
      toast(error?.message || 'Could not download progress.', { type: 'error', duration: 4200 });
    }
  });
  root.querySelector('[data-delete-remote]')?.addEventListener('click', () => {
    openModal({
      title: 'Delete saved progress?',
      subtitle: 'This removes the server copy only.',
      size: 'sm',
      content: `<p class="modal__text">Your progress on this device stays. Other signed-in devices will no longer find a saved copy.</p>`,
      footer: `
        <button class="btn btn--ghost" type="button" data-modal-cancel>Cancel</button>
        <button class="btn btn--danger" type="button" data-confirm-delete>Delete server copy</button>`,
      onMount(modal, close) {
        modal.querySelector('[data-modal-cancel]')?.addEventListener('click', close);
        modal.querySelector('[data-confirm-delete]')?.addEventListener('click', async (event) => {
          event.currentTarget.disabled = true;
          try {
            await forgetRemoteState();
            close();
            toast('Saved progress deleted.', { type: 'success', duration: 3000 });
            ctx.refresh();
          } catch (error) {
            toast(error?.message || 'Could not delete saved progress.', { type: 'error', duration: 4200 });
            event.currentTarget.disabled = false;
          }
        });
      },
    });
  });
}

export async function renderProfile(ctx) {
  await refreshSession();
  const session = getSessionSnapshot();
  const { stats } = ctx;
  const profile = getState().profile;
  const targetLevel = curriculum.levels.find((level) => level.id === profile.targetLevel) || curriculum.levels[0];
  const displayName = session.user?.name || profile.name || 'Guest learner';
  const createdLabel = profile.createdAt ? formatDate(profile.createdAt) : 'Today (local profile)';
  const words = favouriteWords(stats);
  const signedIn = Boolean(session.authenticated && session.user);

  const html = `
    <div class="page page--profile">
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">My profile</p>
          <h1 class="page-title">Your learning identity.</h1>
          <p class="page-sub">A local-first profile you can optionally sync to your account — never fabricated progress.</p>
        </div>
        <div class="page-head__actions">
          <button class="btn btn--primary" type="button" data-edit-profile>${icon('pen')} Edit profile</button>
        </div>
      </header>

      <div class="profile-layout">
        <section class="card profile-card" aria-labelledby="profile-title">
          <div class="profile-card__head">
            <span class="profile-avatar" aria-hidden="true">${escapeHtml(initials(session.user?.name || profile.name))}</span>
            <div class="profile-card__identity">
              <p class="eyebrow">${signedIn ? 'Account learner' : 'Local learner'}</p>
              <h2 class="profile-card__name" id="profile-title">${escapeHtml(displayName)}</h2>
              <p class="profile-card__meta">
                <span class="status-dot" aria-hidden="true"></span>
                Learning from ${escapeHtml(profile.nativeLanguage)} · member since ${escapeHtml(createdLabel)}
              </p>
            </div>
            <span class="chip chip--soft">${icon(signedIn ? 'shield' : 'lock')} ${signedIn ? 'Account' : 'Stored locally'}</span>
          </div>

          <dl class="profile-facts">
            <div>
              <dt>Learning goal</dt>
              <dd>${escapeHtml(profile.learningGoal || 'Not set')}</dd>
            </div>
            <div>
              <dt>Target level</dt>
              <dd>${escapeHtml(targetLevel.code)} · ${escapeHtml(targetLevel.name)}</dd>
            </div>
            <div>
              <dt>Current path</dt>
              <dd>${escapeHtml(stats.currentLevel?.code || 'A1')} · ${escapeHtml(stats.currentLevel?.name || 'Beginner')}</dd>
            </div>
            <div>
              <dt>Native language</dt>
              <dd>${escapeHtml(profile.nativeLanguage)}</dd>
            </div>
          </dl>

          <div class="profile-card__actions">
            <button class="btn btn--soft" type="button" data-edit-profile>${icon('sliders')} Update details</button>
            <a class="btn btn--ghost" href="#/settings">Preferences ${icon('arrow-right')}</a>
          </div>
        </section>

        <aside class="card profile-snapshot" aria-labelledby="snapshot-title">
          <header class="card__head">
            <p class="eyebrow">At a glance</p>
            <h2 class="card__title" id="snapshot-title">Learning snapshot</h2>
          </header>
          <div class="snapshot-grid">
            <div class="snapshot-fact"><strong>${stats.completedCount}</strong><span>lessons covered</span></div>
            <div class="snapshot-fact"><strong>${stats.streak}</strong><span>day streak</span></div>
            <div class="snapshot-fact"><strong>${stats.learnedWords}</strong><span>words saved</span></div>
            <div class="snapshot-fact"><strong>${stats.studyHours}</strong><span>study hours</span></div>
          </div>
          <p class="card__note">${icon('info')} ${stats.demo ? 'Demo preview is active; these figures are illustrative.' : 'These figures reflect only your recorded local activity.'}</p>
          <a class="btn btn--soft btn--block" href="#/progress">Open full progress report ${icon('arrow-right')}</a>
        </aside>
      </div>

      <div class="profile-grid">
        <section class="card profile-favourites" aria-labelledby="profile-words-title">
          <header class="card__head card__head--row">
            <div>
              <p class="eyebrow">Your shelf</p>
              <h2 class="card__title" id="profile-words-title">Favourite words</h2>
            </div>
            <a class="btn btn--ghost btn--sm" href="#/vocabulary">Vocabulary ${icon('arrow-right')}</a>
          </header>
          ${
            words.length
              ? `<div class="favourite-list">
                  ${words
                    .map(
                      (word) => `
                        <div class="favourite-row">
                          <span class="favourite-row__word">
                            ${word.article ? `<span class="article article--${escapeHtml(word.article)}">${escapeHtml(word.article)}</span>` : ''}
                            <strong>${escapeHtml(word.article ? word.de.replace(/^(der|die|das)\s+/, '') : word.de)}</strong>
                            <small>${escapeHtml(word.en)}</small>
                          </span>
                          <button class="icon-btn icon-btn--sm" type="button" data-speak="${escapeHtml(word.de)}"
                            aria-label="Hear ${escapeHtml(word.de)}" title="Hear pronunciation">${icon('volume')}</button>
                        </div>`,
                    )
                    .join('')}
                </div>`
              : `<div class="empty empty--compact">
                  <span class="empty__icon">${icon('star')}</span>
                  <h3 class="empty__title">Your shelf is empty</h3>
                  <p class="empty__text">Save words while browsing to build a personal revision list.</p>
                  <div class="empty__action"><a class="btn btn--soft btn--sm" href="#/vocabulary">Find words to save</a></div>
                </div>`
          }
        </section>

        ${accountCardMarkup(session)}

        <section class="card profile-goal-card" aria-labelledby="profile-goal-title">
          <p class="eyebrow">Your target</p>
          <h2 class="card__title" id="profile-goal-title">${escapeHtml(targetLevel.code)} · ${escapeHtml(targetLevel.title)}</h2>
          <p class="card__sub">${escapeHtml(targetLevel.tagline)}</p>
          <div class="goal-track">
            ${curriculum.levels
              .map(
                (level) => `
                  <span class="goal-track__step ${level.id === targetLevel.id ? 'is-target' : ''} ${
                    level.id === stats.currentLevel?.id ? 'is-current' : ''
                  }">
                    ${escapeHtml(level.code)}
                  </span>`,
              )
              .join('')}
          </div>
          <p class="card__note">${icon('info')} Target levels guide recommendations; the full curriculum stays available.</p>
          <a class="btn btn--soft btn--block" href="#/courses/${targetLevel.id}">Explore ${escapeHtml(targetLevel.code)} ${icon('arrow-right')}</a>
        </section>
      </div>
    </div>`;

  return {
    title: 'My Profile',
    crumbs: [{ label: 'My Profile' }],
    html,
    mount(root) {
      root.querySelectorAll('[data-edit-profile]').forEach((button) => {
        button.addEventListener('click', () => editProfile(ctx));
      });
      root.querySelectorAll('[data-speak]').forEach((button) => {
        button.addEventListener('click', () => speakGerman(button.dataset.speak));
      });
      wireAccountCard(root, ctx);
    },
  };
}
