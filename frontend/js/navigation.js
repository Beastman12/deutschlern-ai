/**
 * Sidebar, topbar, mobile navigation, account menu and command palette.
 */
import { NAV_GROUPS, ROUTES, MOBILE_NAV, QUICK_ACTIONS, getRoute } from './routes.js';
import { escapeHtml, icon, initials, openModal, toast, debounce } from './ui.js';
import { getPreferences, updatePreferences } from './store.js';
import { getSessionSnapshot } from './session.js';
import { openAuthDialog, performLogout } from './auth-ui.js';
import { searchCurriculum } from './content.js';
import { toggleTheme } from './theme.js';

const app = document.getElementById('app');
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebar-backdrop');
const menuButton = document.getElementById('menu-btn');
const account = document.getElementById('account');
const accountButton = document.getElementById('account-btn');
const accountMenu = document.getElementById('account-menu');

let closePalette = null;
let lastFocusedBeforeDrawer = null;

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

function navLink(route) {
  const planned = route.status === 'planned';
  return `
    <a class="nav__link ${planned ? 'nav__link--planned' : ''}" href="${route.path}" data-route="${route.id}"
      title="${escapeHtml(route.label)}">
      <span class="nav__icon">${icon(route.icon)}</span>
      <span class="nav__text">${escapeHtml(route.label)}</span>
      ${planned ? `<span class="nav__soon" title="Planned for Milestone ${route.milestone}">M${route.milestone}</span>` : ''}
    </a>`;
}

function renderSidebar() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = NAV_GROUPS.map((group) => {
    const items = group.items
      .map((id) => ROUTES[id])
      .filter(Boolean)
      .map((route) => navLink(route))
      .join('');
    return `
      <div class="nav__group">
        <p class="nav__label">${escapeHtml(group.label)}</p>
        ${items}
      </div>`;
  }).join('');
}

function renderMobileNav() {
  const nav = document.getElementById('mobile-nav');
  if (!nav) return;
  nav.innerHTML = MOBILE_NAV.map((item) => {
    if (item.route === 'more') {
      return `
        <button class="mobile-nav__item" type="button" data-open-drawer aria-label="More — open all sections">
          <span class="mobile-nav__icon">${icon(item.icon)}</span>
          <span>${escapeHtml(item.label)}</span>
        </button>`;
    }
    const route = ROUTES[item.route];
    return `
      <a class="mobile-nav__item" href="${route.path}" data-route="${route.id}">
        <span class="mobile-nav__icon">${icon(item.icon)}</span>
        <span>${escapeHtml(item.label)}</span>
      </a>`;
  }).join('');
}

/* -------------------------------------------------------------------------- */
/* State updates                                                               */
/* -------------------------------------------------------------------------- */

export function setActiveRoute(routeId) {
  document.querySelectorAll('[data-route]').forEach((element) => {
    const isActive = element.dataset.route === routeId;
    element.classList.toggle('is-active', isActive);
    if (element.getAttribute('role') !== 'button') {
      if (isActive) element.setAttribute('aria-current', 'page');
      else element.removeAttribute('aria-current');
    }
  });
}

/**
 * @param {Array<{label: string, href?: string}>} items
 */
export function setCrumbs(items) {
  const crumbs = document.getElementById('crumbs');
  if (!crumbs) return;
  const all = [{ label: 'Dashboard', href: '#/dashboard' }, ...items];
  crumbs.innerHTML = all
    .map((item, index) => {
      const isLast = index === all.length - 1;
      if (isLast) {
        return `<span class="crumb crumb--current" aria-current="page">${escapeHtml(item.label)}</span>`;
      }
      return `<a class="crumb" href="${escapeHtml(item.href || '#/dashboard')}">${escapeHtml(item.label)}</a><span class="crumb__sep" aria-hidden="true">/</span>`;
    })
    .join('');
}

export function setProfile(profile, session = getSessionSnapshot()) {
  const signedIn = Boolean(session.authenticated && session.user);
  const accountName = signedIn ? session.user.name || session.user.email : '';
  const name = accountName || (profile?.name || '').trim() || 'Guest learner';
  const avatarText = initials(accountName || profile?.name);
  for (const id of ['avatar', 'avatar-menu']) {
    const element = document.getElementById(id);
    if (element) element.textContent = avatarText;
  }
  const nameElement = document.getElementById('account-name');
  if (nameElement) nameElement.textContent = name;
  const statusElement = document.getElementById('account-status');
  if (statusElement) {
    statusElement.textContent = signedIn ? 'Signed in · progress sync available' : 'Local profile · not signed in';
  }
  const signInLabel = document.getElementById('menu-signin-label');
  if (signInLabel) signInLabel.textContent = signedIn ? 'Sign out' : 'Sign in';
  const soon = document.getElementById('menu-signin-soon');
  if (soon) soon.hidden = true;
  // The visible initials must be part of the accessible name (WCAG 2.5.3).
  accountButton?.setAttribute('aria-label', `${avatarText} — open account menu`);
}

export function updateHeader(stats) {
  const streak = document.getElementById('streak-value');
  if (streak) streak.textContent = String(stats.streak);
  const streakPill = document.getElementById('streak-pill');
  streakPill?.setAttribute(
    'title',
    stats.streak === 0 ? 'No active streak yet — finish a lesson today' : `${stats.streak}-day learning streak`,
  );

  const sidebarRing = document.getElementById('sidebar-ring');
  if (sidebarRing && stats.currentLevel) {
    sidebarRing.textContent = stats.currentLevel.code;
    sidebarRing.style.setProperty('--level-pct', String(stats.levelProgressPct));
    sidebarRing.setAttribute('aria-label', `${stats.currentLevel.code} · ${stats.levelProgressPct}% complete`);
  }
  const sidebarLabel = document.getElementById('sidebar-level-label');
  if (sidebarLabel && stats.currentLevel) {
    sidebarLabel.textContent = `${stats.currentLevel.code} · ${stats.currentLevel.name}`;
  }

  const demoFlag = document.getElementById('demo-flag');
  if (demoFlag) demoFlag.hidden = !stats.demo;
}

/* -------------------------------------------------------------------------- */
/* Drawer                                                                      */
/* -------------------------------------------------------------------------- */

function openDrawer() {
  if (!app || !backdrop) return;
  lastFocusedBeforeDrawer = document.activeElement;
  app.dataset.drawer = 'open';
  backdrop.hidden = false;
  menuButton?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('has-drawer');
  document.addEventListener('keydown', drawerKeydown, true);
  setTimeout(() => sidebar?.querySelector('.nav__link')?.focus({ preventScroll: true }), 120);
}

function closeDrawer({ restoreFocus = true } = {}) {
  if (!app || !backdrop) return;
  delete app.dataset.drawer;
  backdrop.hidden = true;
  menuButton?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('has-drawer');
  document.removeEventListener('keydown', drawerKeydown, true);
  if (restoreFocus && lastFocusedBeforeDrawer instanceof HTMLElement) {
    lastFocusedBeforeDrawer.focus({ preventScroll: true });
  }
}

function drawerKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDrawer();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusables = [...sidebar.querySelectorAll('a[href], button:not([disabled])')].filter(
    (element) => element.offsetParent !== null,
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* -------------------------------------------------------------------------- */
/* Sidebar collapse                                                            */
/* -------------------------------------------------------------------------- */

function applySidebarState() {
  const collapsed = getPreferences().sidebarCollapsed;
  if (app) app.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
  const button = document.getElementById('sidebar-collapse');
  if (button) {
    button.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    button.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    button.setAttribute('aria-expanded', String(!collapsed));
  }
}

function toggleSidebar() {
  const collapsed = !getPreferences().sidebarCollapsed;
  updatePreferences({ sidebarCollapsed: collapsed });
  applySidebarState();
}

/* -------------------------------------------------------------------------- */
/* Account menu                                                                */
/* -------------------------------------------------------------------------- */

function toggleAccountMenu(force) {
  if (!accountButton || !accountMenu) return;
  const shouldOpen = typeof force === 'boolean' ? force : accountMenu.hidden;
  accountMenu.hidden = !shouldOpen;
  accountButton.setAttribute('aria-expanded', String(shouldOpen));
}

function onDocumentPointerDown(event) {
  if (!accountMenu || accountMenu.hidden) return;
  if (account?.contains(event.target)) return;
  toggleAccountMenu(false);
}

function handleAccountAction() {
  toggleAccountMenu(false);
  const session = getSessionSnapshot();
  if (session.authenticated && session.user) {
    performLogout();
    return;
  }
  openAuthDialog({ mode: 'login' });
}

/* -------------------------------------------------------------------------- */
/* Command palette                                                             */
/* -------------------------------------------------------------------------- */

function resultRow(item) {
  return `
    <a class="palette__item" href="${escapeHtml(item.href)}" data-palette-item>
      <span class="palette__icon">${icon(item.icon || 'search')}</span>
      <span class="palette__text">
        <span class="palette__title">${escapeHtml(item.title)}</span>
        <span class="palette__subtitle">${escapeHtml(item.subtitle || '')}</span>
      </span>
      <span class="palette__badge">${escapeHtml(item.badge || item.meta || item.type || '')}</span>
    </a>`;
}

export function openSearchPalette() {
  closePalette?.();

  closePalette = openModal({
    title: 'Search DeutschLern',
    size: 'md',
    className: 'palette',
    content: `
      <div class="palette__search">
        <span class="palette__search-icon">${icon('search')}</span>
        <input id="palette-input" class="palette__input" type="search" placeholder="Search lessons, grammar topics and words…"
          autocomplete="off" spellcheck="false" aria-label="Search lessons, grammar topics and words" autofocus />
        <kbd class="kbd">Esc</kbd>
      </div>
      <div class="palette__results" id="palette-results" role="region" aria-live="polite" aria-label="Search results"></div>
      <footer class="palette__foot">
        <span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> navigate</span>
        <span><kbd class="kbd">↵</kbd> open</span>
        <span><kbd class="kbd">Esc</kbd> close</span>
      </footer>`,
    onMount(modal, close) {
      const input = modal.querySelector('#palette-input');
      const results = modal.querySelector('#palette-results');
      let activeIndex = -1;
      let currentItems = [];

      const decorateLinks = () => {
        results.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => close()));
      };

      const setActive = (index) => {
        const links = [...results.querySelectorAll('[data-palette-item]')];
        if (!links.length) return;
        activeIndex = (index + links.length) % links.length;
        links.forEach((link, linkIndex) => {
          link.classList.toggle('is-active', linkIndex === activeIndex);
          if (linkIndex === activeIndex) link.setAttribute('aria-selected', 'true');
          else link.removeAttribute('aria-selected');
        });
        links[activeIndex]?.scrollIntoView({ block: 'nearest' });
      };

      const render = (query) => {
        const trimmed = query.trim();
        activeIndex = -1;

        if (trimmed.length < 2) {
          results.innerHTML = `
            <p class="palette__hint">Shortcuts</p>
            <div class="palette__list">
              ${QUICK_ACTIONS.map(resultRow).join('')}
            </div>
            <p class="palette__hint">${trimmed.length === 1 ? 'Type one more character to search the curriculum.' : 'Type at least two characters to search all 72 lessons, 30 grammar topics and 48 words.'}</p>`;
          decorateLinks();
          currentItems = [];
          return;
        }

        currentItems = searchCurriculum(trimmed, 20);
        if (!currentItems.length) {
          results.innerHTML = `
            <div class="palette__empty">
              <span class="palette__empty-icon">${icon('search')}</span>
              <p><strong>No matches for “${escapeHtml(trimmed)}”</strong></p>
              <p>Try a German word, a grammar term or a lesson title.</p>
            </div>`;
          return;
        }

        const groups = currentItems.reduce((map, item) => {
          map[item.type] = (map[item.type] || 0) + 1;
          return map;
        }, {});
        results.innerHTML = `
          <p class="palette__hint">${currentItems.length} result${currentItems.length === 1 ? '' : 's'} · ${Object.entries(groups)
            .map(([type, count]) => `${count} ${type.toLowerCase()}${count === 1 ? '' : 's'}`)
            .join(', ')}</p>
          <div class="palette__list">${currentItems.map(resultRow).join('')}</div>`;
        decorateLinks();
      };

      input.addEventListener(
        'input',
        debounce(() => render(input.value), 120),
      );

      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActive(activeIndex + 1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActive(activeIndex - 1);
        } else if (event.key === 'Enter') {
          const links = [...results.querySelectorAll('[data-palette-item]')];
          const target = links[activeIndex] || links[0];
          if (target) {
            event.preventDefault();
            close();
            window.location.hash = target.getAttribute('href');
          }
        }
      });

      render('');
      setTimeout(() => input.focus({ preventScroll: true }), 60);
    },
  });

  return closePalette;
}

/* -------------------------------------------------------------------------- */
/* Init                                                                        */
/* -------------------------------------------------------------------------- */

export function initNavigation() {
  renderSidebar();
  renderMobileNav();
  applySidebarState();
  setProfile({ name: '' });

  const shortcut = document.getElementById('search-kbd');
  if (shortcut) {
    shortcut.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
  }

  document.getElementById('sidebar-collapse')?.addEventListener('click', toggleSidebar);
  menuButton?.addEventListener('click', () => {
    if (app?.dataset.drawer === 'open') closeDrawer();
    else openDrawer();
  });
  backdrop?.addEventListener('click', () => closeDrawer());

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-open-drawer]');
    if (opener) openDrawer();
    if (event.target.closest('.nav__link, .mobile-nav__item[href]') && app?.dataset.drawer === 'open') {
      closeDrawer({ restoreFocus: false });
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 960 && app?.dataset.drawer === 'open') closeDrawer({ restoreFocus: false });
  });

  accountButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleAccountMenu();
  });
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && accountMenu && !accountMenu.hidden) {
      toggleAccountMenu(false);
      accountButton?.focus();
    }
  });
  document.getElementById('menu-theme')?.addEventListener('click', () => {
    toggleTheme();
    toggleAccountMenu(false);
  });
  document.getElementById('menu-signin')?.addEventListener('click', handleAccountAction);

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    toggleTheme();
    toast(`Switched to ${document.documentElement.dataset.theme} theme.`, { type: 'info', duration: 2200 });
  });

  document.getElementById('search-trigger')?.addEventListener('click', openSearchPalette);

  return {
    setActiveRoute,
    setCrumbs,
    setProfile,
    updateHeader,
    openSearchPalette,
    closeDrawer,
  };
}

export { getRoute };
