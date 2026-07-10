var Clay = require('@rebble/clay');
var clayConfig = require('./config.json');
var messageKeys = require('message_keys');
var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

var configurationPending = false;
var configurationTimeout = null;

function openConfiguration() {
  configurationPending = false;
  if (configurationTimeout !== null) {
    clearTimeout(configurationTimeout);
    configurationTimeout = null;
  }
  Pebble.openURL(clay.generateUrl());
}

function requestWatchSettings() {
  var request = {};
  request[messageKeys.SETTINGS_REQUEST] = 1;
  Pebble.sendAppMessage(request, function() {}, function(error) {
    console.log('Could not request watch settings: ' + JSON.stringify(error));
  });
}

Pebble.addEventListener('ready', function() {
  requestWatchSettings();
});

Pebble.addEventListener('appmessage', function(event) {
  var timeFormat = event.payload.TIME_FORMAT;
  if (timeFormat === undefined) {
    timeFormat = event.payload[messageKeys.TIME_FORMAT];
  }
  var colorTheme = event.payload.COLOR_THEME;
  if (colorTheme === undefined) {
    colorTheme = event.payload[messageKeys.COLOR_THEME];
  }
  if (timeFormat === undefined && colorTheme === undefined) {
    return;
  }

  if (timeFormat !== undefined) {
    clay.setSettings('TIME_FORMAT', Boolean(timeFormat));
  }
  if (colorTheme !== undefined) {
    clay.setSettings('COLOR_THEME', Number(colorTheme));
  }
  if (configurationPending) {
    openConfiguration();
  }
});

Pebble.addEventListener('showConfiguration', function() {
  configurationPending = true;
  requestWatchSettings();

  // Keep configuration usable if the watch is temporarily unreachable. Clay's
  // last saved value remains the fallback and is normally already synchronized.
  configurationTimeout = setTimeout(openConfiguration, 1000);
});

Pebble.addEventListener('webviewclosed', function(event) {
  if (!event || !event.response) {
    return;
  }

  var settings = clay.getSettings(event.response);
  if (settings[messageKeys.COLOR_THEME] !== undefined) {
    // HTML select values are strings; AppMessage must send the theme as an integer.
    settings[messageKeys.COLOR_THEME] = Number(settings[messageKeys.COLOR_THEME]);
  }
  Pebble.sendAppMessage(settings, function() {
    console.log('Settings synchronized with watch');
  }, function(error) {
    console.log('Could not synchronize settings: ' + JSON.stringify(error));
  });
});
