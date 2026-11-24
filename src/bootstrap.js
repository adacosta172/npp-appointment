// Startup diagnostics separate delivery errors from Firebase initialisation.
if (window.portalStartup?.pending()) {
  import('./main.js').catch(err => {
    const code = typeof err?.code === 'string' && /^[a-z0-9/_-]{1,80}$/i.test(err.code) ? err.code : '';
    console.error('Portal startup failed:', err);
    const detail = code ? `Firebase startup error (${code}).` :
      err instanceof TypeError ? 'A bundled JavaScript asset could not be loaded or evaluated. Publish the dist-static build, check the Network tab for missing assets and use Test backend to check Firebase separately.' :
      err instanceof SyntaxError ? 'A JavaScript module was not understood. Check for HTML returned in place of JavaScript or an unsupported browser.' :
      'A JavaScript startup error occurred. Check the browser Console for the exact error.';
    window.portalStartup.fail(detail);
  });
}
