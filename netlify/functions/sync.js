/**
 * netlify/functions/sync.js — DISABLED
 *
 * SECURITY: this used to proxy arbitrary GET/POST traffic straight through
 * to a public Google Apps Script endpoint with no authentication and
 * `Access-Control-Allow-Origin: '*'`. Any caller could read or overwrite any
 * `key` in the backing store just by hitting /.netlify/functions/sync — and
 * nothing in the app actually depended on this route (there was never even
 * a /api/sync redirect in netlify.toml; a repo-wide search turns up zero
 * client-side callers). Combined with unescaped rendering elsewhere in the
 * app, an open write endpoint like this is a stored-XSS / data-corruption
 * vector, made worse by it logging full request/response bodies to the
 * function log while labeled "DEBUG VERSION".
 *
 * Since nothing calls this route, it's disabled outright rather than
 * patched. If a real sync proxy is needed again, rebuild it with:
 *   - a required, verified Firebase ID token (see the requireDev()-style
 *     helpers in the other netlify/functions/*.js files) instead of open access,
 *   - a fixed allowlist of permitted `key` values instead of an arbitrary string,
 *   - Access-Control-Allow-Origin locked to the site's real origin, not '*',
 *   - no logging of request/response body contents.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

exports.handler = async function () {
  return {
    statusCode: 410,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error: 'This endpoint has been disabled. See comments in netlify/functions/sync.js.' }),
  };
};
