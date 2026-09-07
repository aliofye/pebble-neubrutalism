var Clay = require('@rebble/clay');
var clayConfig = require('./config.json');
var customClay = require('./custom-clay');
var messageKeys = require('message_keys');
var clay = new Clay(clayConfig, customClay, { autoHandleEvents: false });

var COERCE = {"COLOR_THEME":"int","TIME_FORMAT":"bool","DAILY_STEP_GOAL":"int","WEATHER_ENABLED":"bool","WEATHER_UNITS":"int","BARS_MODE":"int"};

function parseBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'on';
}

function coerce(key, value) {
  if (COERCE[key] === 'bool') return parseBool(value) ? 1 : 0;
  var n = Number(value);
  return isFinite(n) ? Math.round(n) : 0;
}

var hook_0 = require('./widget_weather');
var HOOKS = [hook_0];

function callHooks(name, a, b) {
  for (const h of HOOKS) { if (h && typeof h[name] === 'function') { h[name](a, b); } }
}

function requestWatchSettings() {
  var request = {};
  request[messageKeys.SETTINGS_REQUEST] = 1;
  Pebble.sendAppMessage(request, function() {}, function(error) {
    console.log('Could not request watch settings: ' + JSON.stringify(error));
  });
}

var configurationPending = false;
var configurationTimeout = null;

function openConfiguration() {
  configurationPending = false;
  if (configurationTimeout !== null) { clearTimeout(configurationTimeout); configurationTimeout = null; }
  Pebble.openURL(clay.generateUrl());
}

Pebble.addEventListener('ready', function() {
  requestWatchSettings();
  callHooks('onReady', { messageKeys: messageKeys, Pebble: Pebble, clay: clay });
});

Pebble.addEventListener('appmessage', function(event) {
  var payload = event.payload || {};
  var seen = false;
  for (const key of Object.keys(COERCE)) {
    var v = payload[key] !== undefined ? payload[key] : payload[messageKeys[key]];
    if (v !== undefined) { seen = true; clay.setSettings(key, COERCE[key] === 'bool' ? !!coerce(key, v) : coerce(key, v)); }
  }
  if (!seen) return;
  callHooks('onWatchSettings', payload, { messageKeys: messageKeys, Pebble: Pebble, clay: clay });
  if (configurationPending) openConfiguration();
});

Pebble.addEventListener('showConfiguration', function() {
  configurationPending = true;
  requestWatchSettings();
  configurationTimeout = setTimeout(openConfiguration, 1000);
});

Pebble.addEventListener('webviewclosed', function(event) {
  if (!event || !event.response) return;
  var settings = clay.getSettings(event.response);
  var out = {};
  for (const key of Object.keys(COERCE)) {
    if (settings[key] !== undefined) out[messageKeys[key]] = coerce(key, settings[key]);
    else if (settings[messageKeys[key]] !== undefined) out[messageKeys[key]] = coerce(key, settings[messageKeys[key]]);
  }
  callHooks('onPhoneSettings', out, { messageKeys: messageKeys, Pebble: Pebble, clay: clay });
  Pebble.sendAppMessage(out, function() {
    console.log('Settings synchronized with watch');
  }, function(error) {
    console.log('Could not synchronize settings: ' + JSON.stringify(error));
  });
});
