module.exports = {
  fetch() {
    const configuredOrigin = process.env.VOXERA_API_ORIGIN;
    if (!configuredOrigin) {
      return new Response(
        'window.VOXERA_API_ORIGIN = ""; window.VOXERA_DEPLOYMENT_ERROR = "The Voxera frontend is deployed, but no API backend is configured. Set VOXERA_API_ORIGIN to the HTTPS origin of a running Voxera backend.";',
        { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } }
      );
    }

    try {
      const parsed = new URL(configuredOrigin);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        throw new Error('Expected an HTTPS origin without a path.');
      }
      return new Response(`window.VOXERA_API_ORIGIN = ${JSON.stringify(parsed.origin)};`, {
        headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    } catch (error) {
      return new Response(
        `window.VOXERA_API_ORIGIN = ""; window.VOXERA_DEPLOYMENT_ERROR = ${JSON.stringify(`Invalid VOXERA_API_ORIGIN: ${error.message}`)};`,
        { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } }
      );
    }
  }
};
