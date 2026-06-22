/* ============================================================
   status-widget.js — renders the "Home status" section.

   Flow (the mission for scotts.house):
     1. GET /rooms/                      → list the rooms
     2. for each room: GET /rooms/{room}/entities
     3. render one tile per entity, grouped by room, showing the
        entity's current status.

   Built to fail gracefully: if api.scotts.house is unreachable the
   page shows an "offline" indicator instead of breaking, and if a
   single room fails to load the others still render.
   ============================================================ */
(function () {
  'use strict';

  var bar = document.getElementById('api-status');
  var barText = document.getElementById('api-status-text');
  var rooms = document.getElementById('rooms');
  var empty = document.getElementById('status-empty');
  var refreshBtn = document.getElementById('status-refresh');

  if (!bar || !rooms || typeof window.ScottsHouseAPI !== 'function') return;

  var api = new window.ScottsHouseAPI();

  function setState(state, text) {
    bar.setAttribute('data-state', state);
    barText.textContent = text;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function titleCase(value) {
    return String(value == null ? '' : value)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  // --- Icons (inline SVG, currentColor strokes; match the logo style) ---
  var ICONS = {
    light: '<path d="M9 14a5 5 0 1 1 6 0c-.8.6-1 1-1 2H10c0-1-.2-1.4-1-2Z"/><path d="M10 19h4"/>',
    binary_sensor: '<circle cx="10" cy="7" r="2.4"/><path d="M5.5 17c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"/>',
    climate: '<path d="M10 4.5a2 2 0 0 1 4 0V13a3.5 3.5 0 1 1-4 0Z"/><path d="M12 13V8"/>',
    sensor: '<path d="M10 4.5a2 2 0 0 1 4 0V13a3.5 3.5 0 1 1-4 0Z"/><circle cx="12" cy="15.5" r="1.4"/>',
    media_player: '<path d="M4.5 9.5h3l4-3v11l-4-3h-3Z"/><path d="M14.5 8.5a4 4 0 0 1 0 7"/>',
    switch: '<rect x="4.5" y="8" width="15" height="8" rx="4"/><circle cx="15" cy="12" r="2.4"/>',
    cover: '<rect x="5" y="5" width="14" height="14" rx="1.5"/><path d="M5 9h14"/>',
    lock: '<rect x="6" y="11" width="12" height="8" rx="1.5"/><path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"/>',
    fan: '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4C12 7 13 5 15 5s2.5 2 1 4.5M13.4 12.8c2.9 1.7 3.4 3.9 2.4 5.6s-3.2 1-4.3-1.6M10.6 11.2C7.7 9.5 6.7 7.6 7.7 5.9s3.2-1 4.3 1.6"/>',
    'default': '<circle cx="12" cy="12" r="6.5"/>'
  };

  function iconFor(domain) {
    var body = ICONS[domain] || ICONS['default'];
    return '<svg class="entity-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      body + '</svg>';
  }

  // Friendly label for the entity's domain / device class.
  function kindLabel(domain, dc) {
    if (domain === 'binary_sensor' || domain === 'sensor') {
      return dc ? titleCase(dc) + ' Sensor' : 'Sensor';
    }
    var map = {
      light: 'Light', switch: 'Switch', climate: 'Thermostat',
      media_player: 'Media', cover: 'Cover', lock: 'Lock', fan: 'Fan'
    };
    return map[domain] || titleCase(domain);
  }

  // Turn a raw entity into a presentational descriptor:
  //   { kind, icon, value, unit, detail, tone }
  // tone drives the accent colour: active | inactive | unavailable | neutral
  function describe(entity) {
    var domain = String(entity.entity_id || '').split('.')[0];
    var a = entity.attributes || {};
    var dc = a.device_class || '';
    var state = entity.state;

    var d = {
      kind: kindLabel(domain, dc),
      icon: iconFor(domain),
      value: titleCase(state),
      unit: '',
      detail: '',
      tone: 'neutral'
    };

    // Anything genuinely unknown short-circuits to an "unavailable" tone.
    if (state === 'unavailable' || state === 'unknown' || state == null) {
      d.value = titleCase(state || 'unknown');
      d.tone = 'unavailable';
      return d;
    }

    switch (domain) {
      case 'light':
      case 'switch':
      case 'fan': {
        var on = state === 'on';
        d.value = on ? 'On' : 'Off';
        d.tone = on ? 'active' : 'inactive';
        if (on && typeof a.brightness === 'number') {
          var parts = [Math.round((a.brightness / 255) * 100) + '%'];
          if (a.color_temp_kelvin) parts.push(a.color_temp_kelvin + 'K');
          d.detail = parts.join(' · ');
        }
        break;
      }
      case 'binary_sensor': {
        var active = state === 'on';
        if (dc === 'occupancy' || dc === 'motion' || dc === 'presence') {
          d.value = active ? 'Occupied' : 'Clear';
        } else if (dc === 'door' || dc === 'window' || dc === 'opening' || dc === 'garage_door') {
          d.value = active ? 'Open' : 'Closed';
        } else if (dc === 'moisture') {
          d.value = active ? 'Wet' : 'Dry';
        } else {
          d.value = active ? 'On' : 'Off';
        }
        d.tone = active ? 'active' : 'inactive';
        break;
      }
      case 'climate': {
        d.value = titleCase(state);
        d.tone = state === 'off' ? 'inactive' : 'active';
        var bits = [];
        if (typeof a.current_temperature === 'number') bits.push(a.current_temperature + '° now');
        if (typeof a.temperature === 'number') bits.push('set ' + a.temperature + '°');
        if (a.hvac_action && a.hvac_action !== state) bits.push(titleCase(a.hvac_action));
        d.detail = bits.join(' · ');
        break;
      }
      case 'sensor': {
        d.value = state;
        d.unit = a.unit_of_measurement || '';
        d.tone = 'neutral';
        break;
      }
      case 'media_player': {
        d.value = titleCase(state);
        d.tone = (state === 'playing' || state === 'paused') ? 'active' : 'inactive';
        if (a.media_title) {
          d.detail = a.media_artist ? a.media_title + ' — ' + a.media_artist : a.media_title;
        } else if (typeof a.volume_level === 'number') {
          d.detail = 'Vol ' + Math.round(a.volume_level * 100) + '%';
        }
        break;
      }
      default:
        d.value = titleCase(state);
    }
    return d;
  }

  function entityCard(entity) {
    var d = describe(entity);
    var name = entity.entity_name ||
      (entity.attributes && entity.attributes.friendly_name) ||
      entity.entity_id || 'Unknown';

    return '' +
      '<article class="entity-card" data-tone="' + d.tone + '">' +
        '<div class="entity-card__head">' +
          d.icon +
          '<span class="entity-card__kind">' + escapeHtml(d.kind) + '</span>' +
          '<span class="entity-card__dot" aria-hidden="true"></span>' +
        '</div>' +
        '<span class="entity-card__name">' + escapeHtml(name) + '</span>' +
        '<span class="entity-card__value">' + escapeHtml(d.value) +
          (d.unit ? '<span class="entity-card__unit">' + escapeHtml(d.unit) + '</span>' : '') +
        '</span>' +
        (d.detail ? '<span class="entity-card__detail">' + escapeHtml(d.detail) + '</span>' : '') +
      '</article>';
  }

  function roomSection(result) {
    var entities = result.entities;
    var inner;

    if (result.error) {
      inner = '<p class="room-error">Couldn’t load this room (' +
        escapeHtml(result.error) + ').</p>';
    } else if (!entities.length) {
      inner = '<p class="room-error">No entities exposed for this room.</p>';
    } else {
      inner = '<div class="entity-grid">' +
        entities.map(entityCard).join('') +
        '</div>';
    }

    var count = result.error ? '' :
      '<span class="room-count">' + entities.length +
      (entities.length === 1 ? ' entity' : ' entities') + '</span>';

    return '' +
      '<section class="room">' +
        '<div class="room-head">' +
          '<h3 class="room-title">' + escapeHtml(result.room) + '</h3>' +
          count +
        '</div>' +
        inner +
      '</section>';
  }

  function render(results) {
    if (!results.length) {
      rooms.hidden = true;
      empty.hidden = false;
      return 0;
    }
    empty.hidden = true;
    rooms.innerHTML = results.map(roomSection).join('');
    rooms.hidden = false;
    return results.reduce(function (sum, r) {
      return sum + (r.error ? 0 : r.entities.length);
    }, 0);
  }

  // Step 1: list rooms. Step 2: fan out to each room's entities (tolerating
  // per-room failures). Step 3: render the tiles.
  function load() {
    setState('loading', 'Connecting to api.scotts.house…');
    refreshBtn.hidden = true;

    api.rooms().then(function (roomNames) {
      if (!Array.isArray(roomNames)) roomNames = [];
      return Promise.all(roomNames.map(function (room) {
        return api.roomEntities(room).then(function (entities) {
          return { room: room, entities: Array.isArray(entities) ? entities : [] };
        }, function (err) {
          return { room: room, entities: [], error: (err && err.status) ? err.status : 'error' };
        });
      }));
    }).then(function (results) {
      var total = render(results);
      setState('online', 'Connected · ' + results.length + ' rooms · ' + total +
        ' entities · ' + new Date().toLocaleTimeString());
      refreshBtn.hidden = false;
    }).catch(function (err) {
      var offline = (err && (err.status === 0 || err.status === undefined));
      setState('offline', offline
        ? 'api.scotts.house is unreachable right now.'
        : 'api.scotts.house returned an error (' + err.status + ').');
      refreshBtn.hidden = false;
      rooms.hidden = true;
      empty.hidden = false;
      if (window.console) window.console.warn('[scotts.house] status load failed:', err);
    });
  }

  refreshBtn.addEventListener('click', load);
  load();
})();
