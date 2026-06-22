/* ============================================================
   ha-api.js — browser client for api.scotts.house

   A tiny, dependency-free wrapper around fetch() for talking to
   the read-only Home Assistant API (a Go app served from the home
   network through a Cloudflare Tunnel).

   Cross-origin notes:
     - scotts.house (this site) and api.scotts.house are different
       origins, so every call is a CORS request. The API must reply
       with `Access-Control-Allow-Origin: https://scotts.house`.
       See CORS.md / cors.go in this repo for the server side.
     - credentials are omitted (token auth via the Authorization
       header), so the server may reflect a specific origin rather
       than using the "*" wildcard.
     - Sending an Authorization header makes this a "non-simple"
       request, so the browser sends a preflight OPTIONS first. The
       API must answer that with the matching CORS headers.

   Usage:
     var api = new ScottsHouseAPI();                 // defaults to https://api.scotts.house
     var api = new ScottsHouseAPI({ token: '...' }); // with a bearer token
     api.states().then(render).catch(handleError);
   ============================================================ */
(function (global) {
  'use strict';

  var DEFAULT_BASE = 'https://api.scotts.house';

  function ScottsHouseAPI(options) {
    options = options || {};
    var base = options.baseURL || global.SCOTTS_HOUSE_API_BASE || DEFAULT_BASE;
    this.baseURL = String(base).replace(/\/+$/, '');
    this.token = options.token || null;
    this.timeout = typeof options.timeout === 'number' ? options.timeout : 10000;
  }

  // Low-level request. Returns a Promise that resolves to parsed JSON
  // (or text), and rejects with an Error carrying `.status` on failure.
  ScottsHouseAPI.prototype.request = function (path, options) {
    options = options || {};
    var self = this;
    var url = this.baseURL + (path.charAt(0) === '/' ? path : '/' + path);

    var headers = { 'Accept': 'application/json' };
    if (options.headers) {
      for (var k in options.headers) {
        if (Object.prototype.hasOwnProperty.call(options.headers, k)) headers[k] = options.headers[k];
      }
    }
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? global.setTimeout(function () { controller.abort(); }, this.timeout) : null;

    return global.fetch(url, {
      method: options.method || 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: options.cache || 'no-store',
      headers: headers,
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (timer) global.clearTimeout(timer);
      if (!res.ok) {
        var err = new Error('api.scotts.house request failed: ' + res.status + ' ' + res.statusText);
        err.status = res.status;
        throw err;
      }
      var type = res.headers.get('content-type') || '';
      return type.indexOf('application/json') !== -1 ? res.json() : res.text();
    }, function (err) {
      if (timer) global.clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        var timeoutErr = new Error('api.scotts.house request timed out after ' + self.timeout + 'ms');
        timeoutErr.status = 0;
        throw timeoutErr;
      }
      throw err;
    });
  };

  // --- Generic verbs -------------------------------------------------
  ScottsHouseAPI.prototype.get = function (path, options) {
    options = options || {};
    options.method = 'GET';
    return this.request(path, options);
  };

  // --- Convenience helpers ------------------------------------------
  // These mirror the read-only, filtered surface the Go API exposes.

  // The rooms in the house, as an array of display names, e.g.
  //   ["Dining Room", "Garage", "Living Room", ...]
  ScottsHouseAPI.prototype.rooms = function () {
    return this.get('/rooms/');
  };

  // The entities in a single room, as an array of state objects:
  //   { entity_id, entity_name, room, state, attributes, last_changed, last_updated }
  // Room names contain spaces, so the path segment must be URL-encoded.
  ScottsHouseAPI.prototype.roomEntities = function (room) {
    return this.get('/rooms/' + encodeURIComponent(room) + '/entities');
  };

  // Export for both <script> tags and module bundlers.
  global.ScottsHouseAPI = ScottsHouseAPI;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScottsHouseAPI;
  }
})(typeof window !== 'undefined' ? window : this);
