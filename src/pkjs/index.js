var Clay = require('@rebble/clay');
var clayConfig = require('./config.json');
var customClay = require('./custom-clay');
var messageKeys = require('message_keys');
var clay = new Clay(clayConfig, customClay, { autoHandleEvents: false });

var configurationPending = false;
var configurationTimeout = null;
var currentWeatherUnits = 0;
var weatherFetchPending = false;
var weatherEnabled = true;
var weatherTimer = null;

function parseBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1' ||
         value === 'on';
}

function syncWeatherScheduling() {
  if (weatherEnabled) {
    if (weatherTimer === null) {
      weatherTimer = setInterval(fetchWeatherForLocation, 60 * 60 * 1000);
    }
    fetchWeatherForLocation();
  } else {
    if (weatherTimer !== null) {
      clearInterval(weatherTimer);
      weatherTimer = null;
    }
  }
}

function fetchWeather(latitude, longitude) {
  var unit = currentWeatherUnits === 1 ? 'celsius' : 'fahrenheit';
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude +
            '&longitude=' + longitude +
            '&current=temperature_2m&temperature_unit=' + unit;
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.timeout = 15000;
  xhr.onload = function() {
    if (xhr.status === 200) {
      var data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (e) {
        console.log('Could not parse weather response');
        return;
      }
      if (data && data.current && typeof data.current.temperature_2m === 'number') {
        var payload = {};
        payload[messageKeys.WEATHER_TEMP] = Math.round(data.current.temperature_2m);
        Pebble.sendAppMessage(payload, function() {
          console.log('Weather synced: ' + payload[messageKeys.WEATHER_TEMP]);
        }, function(error) {
          console.log('Could not sync weather: ' + JSON.stringify(error));
        });
      }
    }
  };
  xhr.onerror = function() {
    console.log('Weather fetch failed');
  };
  xhr.send();
}

function fetchWeatherForLocation() {
  if (!weatherEnabled || weatherFetchPending) {
    return;
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return;
  }
  weatherFetchPending = true;
  navigator.geolocation.getCurrentPosition(function(position) {
    weatherFetchPending = false;
    fetchWeather(position.coords.latitude, position.coords.longitude);
  }, function(error) {
    weatherFetchPending = false;
    console.log('Could not get location: ' + JSON.stringify(error));
  }, { timeout: 15000, maximumAge: 600000 });
}

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
  syncWeatherScheduling();
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
  var dailyStepGoal = event.payload.DAILY_STEP_GOAL;
  if (dailyStepGoal === undefined) {
    dailyStepGoal = event.payload[messageKeys.DAILY_STEP_GOAL];
  }
  var barsMode = event.payload.BARS_MODE;
  if (barsMode === undefined) {
    barsMode = event.payload[messageKeys.BARS_MODE];
  }
  var weatherUnits = event.payload.WEATHER_UNITS;
  if (weatherUnits === undefined) {
    weatherUnits = event.payload[messageKeys.WEATHER_UNITS];
  }
  var weatherEnabledPayload = event.payload.WEATHER_ENABLED;
  if (weatherEnabledPayload === undefined) {
    weatherEnabledPayload = event.payload[messageKeys.WEATHER_ENABLED];
  }
  if (timeFormat === undefined && colorTheme === undefined &&
      dailyStepGoal === undefined && barsMode === undefined &&
      weatherUnits === undefined && weatherEnabledPayload === undefined) {
    return;
  }

  if (timeFormat !== undefined) {
    clay.setSettings('TIME_FORMAT', Boolean(timeFormat));
  }
  if (colorTheme !== undefined) {
    clay.setSettings('COLOR_THEME', Number(colorTheme));
  }
  if (dailyStepGoal !== undefined) {
    clay.setSettings('DAILY_STEP_GOAL', Number(dailyStepGoal));
  }
  if (barsMode !== undefined) {
    clay.setSettings('BARS_MODE', Number(barsMode));
  }
  if (weatherEnabledPayload !== undefined) {
    weatherEnabled = Number(weatherEnabledPayload) !== 0;
    clay.setSettings('WEATHER_ENABLED', weatherEnabled);
    syncWeatherScheduling();
  }
  if (weatherUnits !== undefined) {
    var units = Number(weatherUnits);
    if (units === 0 || units === 1) {
      clay.setSettings('WEATHER_UNITS', units);
      if (units !== currentWeatherUnits) {
        currentWeatherUnits = units;
        fetchWeatherForLocation();
      }
    }
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
  if (settings[messageKeys.BARS_MODE] !== undefined) {
    settings[messageKeys.BARS_MODE] = Number(settings[messageKeys.BARS_MODE]);
  }
  if (settings[messageKeys.WEATHER_UNITS] !== undefined) {
    settings[messageKeys.WEATHER_UNITS] = Number(settings[messageKeys.WEATHER_UNITS]);
    if (settings[messageKeys.WEATHER_UNITS] === 0 || settings[messageKeys.WEATHER_UNITS] === 1) {
      currentWeatherUnits = settings[messageKeys.WEATHER_UNITS];
    }
  }
  if (settings[messageKeys.WEATHER_ENABLED] !== undefined) {
    weatherEnabled = parseBool(settings[messageKeys.WEATHER_ENABLED]);
    settings[messageKeys.WEATHER_ENABLED] = weatherEnabled ? 1 : 0;
  }
  if (settings[messageKeys.DAILY_STEP_GOAL] !== undefined) {
    var dailyStepGoal = Number(settings[messageKeys.DAILY_STEP_GOAL]);
    if (!isFinite(dailyStepGoal) || dailyStepGoal < 1000 || dailyStepGoal > 100000) {
      dailyStepGoal = 10000;
    }
    settings[messageKeys.DAILY_STEP_GOAL] = Math.round(dailyStepGoal);
  }
  Pebble.sendAppMessage(settings, function() {
    console.log('Settings synchronized with watch');
  }, function(error) {
    console.log('Could not synchronize settings: ' + JSON.stringify(error));
  });

  syncWeatherScheduling();
});
