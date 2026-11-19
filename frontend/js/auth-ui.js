/**
 * Account dialogs shared by the top-bar menu and the profile page.
 *
 * Every form talks to the real server API. If accounts are unavailable the
 * dialog says so instead of rendering a form that cannot authenticate anyone.
 */
import { auth } from './api.js';
import { setSignedIn, setSignedOut, getSessionSnapshot } from './session.js';
import { handleSignIn, noteSignedOut, resolveConflict } from './sync-client.js';
import { escapeHtml, formatDate, icon, openModal, toast } from './ui.js';

function errorMarkup(message) {
  return message
    ? `<p class="form-error" role="alert">${escapeHtml(message)}</p>`
    : '<p class="form-error" role="alert" hidden></p>';
}

function showError(modal, message) {
  const region = modal.querySelector('.form-error');
  if (!region) return;
  region.textContent = message;
  region.hidden = false;
}

function clearError(modal) {
  const region = modal.querySelector('.form-error');
  if (!region) return;
  region.textContent = '';
  region.hidden = true;
}

function busy(button, value) {
  if (!button) return;
  button.disabled = value;
  button.setAttribute('aria-busy', String(value));
}

function unavailableDialog(reason) {
  openModal({
    title: 'Accounts are unavailable',
    subtitle: 'No sign-in form is shown when authentication cannot work.',
    size: 'sm',
    content: `
      <div class="stack">
        <p class="modal__text">${escapeHtml(reason || 'This server has not enabled accounts.')}</p>
        <div class="callout callout--info">
          <span class="callout__icon">${icon('shield')}</span>
          <p>Your local progress is untouched and the app remains fully usable as a guest.</p>
        </div>
      </div>`,
    footer: '<button class="btn btn--primary" type="button" data-modal-dismiss>Close</button>',
    onMount(modal, close) {
      modal.querySelector('[data-modal-dismiss]')?.addEventListener('click', close);
    },
  });
}

/**
 * Open the sign-in / registration / reset dialog.
 * @param {{ mode?: 'login'|'register'|'reset', onSuccess?: () => void }} [options]
 */
export function openAuthDialog({ mode = 'login', onSuccess } = {}) {
  const session = getSessionSnapshot();
  if (!session.configured) {
    unavailableDialog(session.reason || 'Accounts are not configured on this server.');
    return;
  }

  let active = mode;
  const heads = {
    login: ['Welcome back', 'Sign in to sync your real progress.'],
    register: ['Create your account', 'Saved sessions and cross-device progress.'],
    reset: ['Reset your password', 'Choose a new password with a valid reset token.'],
  };

  function body() {
    if (active === 'reset') {
      return `
        <form class="form" id="auth-reset-request" novalidate>
          <div class="field">
            <label class="field__label" for="reset-email">Account email</label>
            <input class="input" id="reset-email" name="email" type="email" autocomplete="email" maxlength="254"
              placeholder="you@example.com" required />
          </div>
          ${errorMarkup('')}
          <button class="btn btn--soft btn--block" type="submit">Request a reset token</button>
        </form>
        <div id="reset-final" hidden>
          <div class="form-divider" role="separator"><span>Set a new password</span></div>
          <form class="form" id="auth-reset-final" novalidate>
            <div class="field">
              <label class="field__label" for="reset-token">Reset token</label>
              <input class="input" id="reset-token" name="token" type="text" autocomplete="off" spellcheck="false"
                required />
              <p class="field__hint" id="reset-token-hint">In development the token is returned above. In production an email provider must deliver it.</p>
            </div>
            <div class="field">
              <label class="field__label" for="reset-password">New password</label>
              <input class="input" id="reset-password" name="password" type="password" autocomplete="new-password"
                minlength="10" maxlength="128" required />
              <p class="field__hint">At least 10 characters, including a letter and a number.</p>
            </div>
            ${errorMarkup('')}
            <button class="btn btn--primary btn--block" type="submit">Update password</button>
          </form>
        </div>`;
    }

    const isRegister = active === 'register';
    return `
      <div class="segmented" role="tablist" aria-label="Account actions">
        <button class="segmented__btn ${!isRegister ? 'is-active' : ''}" type="button" role="tab"
          aria-selected="${!isRegister}" data-auth-mode="login">Sign in</button>
        <button class="segmented__btn ${isRegister ? 'is-active' : ''}" type="button" role="tab"
          aria-selected="${isRegister}" data-auth-mode="register">Create account</button>
      </div>
      <form class="form" id="auth-form" novalidate>
        ${
          isRegister
            ? `<div class="field">
                 <label class="field__label" for="auth-name">Display name <span class="field__optional">optional</span></label>
                 <input class="input" id="auth-name" name="name" type="text" maxlength="60" autocomplete="nickname"
                   placeholder="e.g. Aditi" />
               </div>`
            : ''
        }
        <div class="field">
          <label class="field__label" for="auth-email">Email address</label>
          <input class="input" id="auth-email" name="email" type="email" autocomplete="email" maxlength="254"
            placeholder="you@example.com" required />
        </div>
        <div class="field">
          <label class="field__label" for="auth-password">Password</label>
          <input class="input" id="auth-password" name="password" type="password"
            autocomplete="${isRegister ? 'new-password' : 'current-password'}" minlength="${isRegister ? 10 : 1}"
            maxlength="128" required />
          ${
            isRegister
              ? '<p class="field__hint">At least 10 characters, including a letter and a number.</p>'
              : ''
          }
        </div>
        ${errorMarkup('')}
        <button class="btn btn--primary btn--block" type="submit">
          ${isRegister ? 'Create account' : 'Sign in'} ${icon('arrow-right')}
        </button>
      </form>
      ${
        isRegister
          ? '<p class="modal__footnote">Already have an account? <button class="link-btn" type="button" data-auth-mode="login">Sign in</button></p>'
          : `<p class="modal__footnote"><button class="link-btn" type="button" data-auth-mode="reset">Forgot your password?</button></p>`
      }
      <p class="modal__footnote modal__footnote--muted">${escapeHtml(session.passwordReset?.reason || '')}</p>`;
  }

  let close = () => {};
  function render() {
    const dialog = document.querySelector('.modal-layer:last-child .modal');
    if (!dialog) return;
    dialog.querySelector('.modal__title').textContent = heads[active][0];
    dialog.querySelector('.modal__subtitle').textContent = heads[active][1];
    dialog.querySelector('.modal__body').innerHTML = body();
    wire(dialog);
    dialog.querySelector('input')?.focus({ preventScroll: true });
  }

  function wire(dialog) {
    dialog.querySelectorAll('[data-auth-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        active = button.dataset.authMode;
        render();
      });
    });

    const form = dialog.querySelector('#auth-form');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearError(dialog);
      const data = new FormData(form);
      const button = form.querySelector('button[type="submit"]');
      busy(button, true);
      try {
        const payload =
          active === 'register'
            ? { name: String(data.get('name') || ''), email: String(data.get('email') || ''), password: String(data.get('password') || '') }
            : { email: String(data.get('email') || ''), password: String(data.get('password') || '') };
        const response = active === 'register' ? await auth.register(payload) : await auth.login(payload);
        setSignedIn(response.user);
        close();
        toast(active === 'register' ? 'Account created. Syncing your progress…' : `Signed in as ${response.user?.email || 'your account'}.`, {
          type: 'success',
          duration: 3400,
        });
        await handleSignIn();
        onSuccess?.();
      } catch (error) {
        showError(dialog, error?.message || 'Could not sign in. Please try again.');
      } finally {
        busy(button, false);
      }
    });

    const requestForm = dialog.querySelector('#auth-reset-request');
    requestForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearError(dialog);
      const email = String(new FormData(requestForm).get('email') || '');
      const button = requestForm.querySelector('button[type="submit"]');
      busy(button, true);
      try {
        const response = await auth.requestReset(email);
        dialog.querySelector('#reset-final').hidden = false;
        const tokenField = dialog.querySelector('#reset-token');
        if (response.token) {
          tokenField.value = response.token;
          dialog.querySelector('#reset-token-hint').textContent =
            'Development token returned by the server. Copy it here, then choose a new password.';
          toast('Development reset token generated.', { type: 'info', duration: 4000 });
        } else {
          dialog.querySelector('#reset-token-hint').textContent =
            response.message || 'Email delivery is not configured; ask the server administrator for a token.';
        }
        dialog.querySelector('#reset-password').focus({ preventScroll: true });
      } catch (error) {
        showError(dialog, error?.message || 'Could not request a reset token.');
      } finally {
        busy(button, false);
      }
    });

    const finalForm = dialog.querySelector('#auth-reset-final');
    finalForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearError(dialog);
      const data = new FormData(finalForm);
      const button = finalForm.querySelector('button[type="submit"]');
      busy(button, true);
      try {
        const response = await auth.resetPassword({
          email: String(new FormData(requestForm).get('email') || ''),
          token: String(data.get('token') || ''),
          password: String(data.get('password') || ''),
        });
        setSignedOut();
        close();
        toast(response.message || 'Password updated. Please sign in again.', { type: 'success', duration: 5000 });
        active = 'login';
      } catch (error) {
        showError(dialog, error?.message || 'Could not update the password.');
      } finally {
        busy(button, false);
      }
    });
  }

  close = openModal({
    title: heads[mode][0],
    subtitle: heads[mode][1],
    size: 'sm',
    content: body(),
    onMount(dialog) {
      wire(dialog);
    },
  });
}

/** Ask the learner which copy to keep when a device is out of date. */
export function openConflictDialog({ remote, local, revision, updatedAt }, { onResolved } = {}) {
  const remoteLessons = Object.keys(remote?.progress?.completedLessons || {}).length;
  const localLessons = Object.keys(local?.progress?.completedLessons || {}).length;
  openModal({
    title: 'Choose which progress to keep',
    subtitle: 'The server and this device disagree. Nothing is overwritten until you decide.',
    size: 'md',
    content: `
      <div class="conflict-grid">
        <div class="conflict-card">
          <p class="eyebrow">On the server</p>
          <h3>${remoteLessons} completed lesson${remoteLessons === 1 ? '' : 's'}</h3>
          <p class="card__sub">Revision ${escapeHtml(String(revision || 0))}${updatedAt ? ` · ${escapeHtml(formatDate(updatedAt))}` : ''}</p>
          <p class="card__note">Choosing this replaces this device's copy.</p>
        </div>
        <div class="conflict-card">
          <p class="eyebrow">On this device</p>
          <h3>${localLessons} completed lesson${localLessons === 1 ? '' : 's'}</h3>
          <p class="card__sub">Includes all work recorded here since your last sync.</p>
          <p class="card__note">Choosing this replaces the server copy.</p>
        </div>
      </div>
      ${errorMarkup('')}`,
    footer: `
      <button class="btn btn--ghost" type="button" data-conflict="server">${icon('download')} Use server copy</button>
      <button class="btn btn--primary" type="button" data-conflict="local">${icon('rotate')} Keep this device</button>`,
    onMount(dialog, close) {
      dialog.querySelectorAll('[data-conflict]').forEach((button) => {
        button.addEventListener('click', async () => {
          busy(button, true);
          try {
            await resolveConflict(button.dataset.conflict);
            close();
            toast('Sync conflict resolved.', { type: 'success', duration: 3000 });
            onResolved?.();
          } catch (error) {
            showError(dialog, error?.message || 'Could not resolve the conflict.');
            busy(button, false);
          }
        });
      });
    },
  });
}

/** Sign out of the real server-side session. */
export async function performLogout({ onDone } = {}) {
  try {
    await auth.logout();
  } catch (error) {
    toast(error?.message || 'Could not sign out on the server. Please try again.', {
      type: 'error',
      duration: 5000,
    });
    return false;
  }
  setSignedOut();
  noteSignedOut();
  toast('Signed out. Your local progress stays on this device.', { type: 'info', duration: 3600 });
  onDone?.();
  return true;
}

/** Delete the account after an explicit, typed confirmation. */
export function openDeleteAccountDialog({ onDone } = {}) {
  openModal({
    title: 'Delete your account',
    subtitle: 'This removes your server-side account, sessions and saved progress.',
    size: 'sm',
    content: `
      <div class="stack">
        <div class="callout callout--warn">
          <span class="callout__icon">${icon('info')}</span>
          <p>Local browser data is not deleted. Use “Clear local data” separately if you also want to remove it from this device.</p>
        </div>
        <div class="field">
          <label class="field__label" for="delete-confirm">Type <strong>DELETE</strong> to confirm</label>
          <input class="input" id="delete-confirm" type="text" autocomplete="off" spellcheck="false" required />
        </div>
        ${errorMarkup('')}
      </div>`,
    footer: `
      <button class="btn btn--ghost" type="button" data-modal-cancel>Cancel</button>
      <button class="btn btn--danger" type="button" data-confirm-delete-account disabled>Delete account</button>`,
    onMount(dialog, close) {
      const input = dialog.querySelector('#delete-confirm');
      const button = dialog.querySelector('[data-confirm-delete-account]');
      input?.addEventListener('input', () => {
        if (button) button.disabled = input.value.trim().toUpperCase() !== 'DELETE';
      });
      dialog.querySelector('[data-modal-cancel]')?.addEventListener('click', close);
      button?.addEventListener('click', async () => {
        busy(button, true);
        try {
          await auth.deleteAccount();
          setSignedOut();
          noteSignedOut();
          close();
          toast('Account and saved progress deleted.', { type: 'success', duration: 4000 });
          onDone?.();
        } catch (error) {
          showError(dialog, error?.message || 'Could not delete the account.');
          busy(button, false);
        }
      });
    },
  });
}

