// This tiny helper runs independently of the app bundle so load failures stay visible.
(() => {
  function message(text) {
    const status = document.getElementById('startup-message');
    if (!status) return; // React has already mounted successfully.
    status.textContent = text;
    const reload = document.getElementById('startup-reload');
    if (reload) reload.hidden = false;
  }
  document.getElementById('startup-reload')?.addEventListener('click', () => window.location.reload());
  window.addEventListener('error', event => {
    if (event.target instanceof HTMLScriptElement || event.target === window) {
      message('The storefront could not load. Please reload the page.');
    }
  }, true);
  window.setTimeout(() => message('Loading is taking longer than expected. Please try reloading the page.'), 15000);
})();
