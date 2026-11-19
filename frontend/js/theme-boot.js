/**
 * Pre-paint theme bootstrap.
 * Loaded synchronously from <head> so the correct theme is applied before
 * first paint. Reads preferences defensively (storage may be unavailable).
 */
(function themeBoot() {
  var root = document.documentElement;
  var theme = 'system';
  var reduceMotion = false;

  try {
    var raw = localStorage.getItem('dl:preferences');
    if (raw) {
      var prefs = JSON.parse(raw);
      if (prefs && typeof prefs === 'object') {
        theme = prefs.theme === 'light' || prefs.theme === 'dark' ? prefs.theme : 'system';
        reduceMotion = prefs.reduceMotion === true;
      }
    }
  } catch (error) {
    /* Storage can be blocked; fall back to system defaults. */
  }

  var isDark =
    theme === 'dark' ||
    (theme !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  root.dataset.theme = isDark ? 'dark' : 'light';
  if (reduceMotion) root.dataset.motion = 'reduced';
})();
