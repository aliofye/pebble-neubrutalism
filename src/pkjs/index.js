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
  var value = event.payload.TIME_FORMAT;
  if (value === undefined) {
    value = event.payload[messageKeys.TIME_FORMAT];
  }
  if (value === undefined) {
    return;
  }

  clay.setSettings('TIME_FORMAT', Boolean(value));
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
  Pebble.sendAppMessage(settings, function() {
    console.log('Time format synchronized with watch');
  }, function(error) {
    console.log('Could not synchronize time format: ' + JSON.stringify(error));
  });
});
