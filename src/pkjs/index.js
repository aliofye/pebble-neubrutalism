var Clay = require('@rebble/clay');
var clayConfig = require('./config.json');
var customClay = require('./custom-clay');
var messageKeys = require('message_keys');
var clay = new Clay(clayConfig, customClay, { autoHandleEvents: false });

var configurationPending = false;
var configurationTimeout = null;
var currentWeatherUnits = 0;
var weatherFetchPending = false;

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
  if (weatherFetchPending) {
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
  fetchWeatherForLocation();
  setInterval(fetchWeatherForLocation, 60 * 60 * 1000);
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
  var weatherUnits = event.payload.WEATHER_UNITS;
  if (weatherUnits === undefined) {
    weatherUnits = event.payload[messageKeys.WEATHER_UNITS];
  }
  if (timeFormat === undefined && colorTheme === undefined &&
      dailyStepGoal === undefined && weatherUnits === undefined) {
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
  if (settings[messageKeys.WEATHER_UNITS] !== undefined) {
    settings[messageKeys.WEATHER_UNITS] = Number(settings[messageKeys.WEATHER_UNITS]);
    if (settings[messageKeys.WEATHER_UNITS] === 0 || settings[messageKeys.WEATHER_UNITS] === 1) {
      currentWeatherUnits = settings[messageKeys.WEATHER_UNITS];
    }
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

  fetchWeatherForLocation();
});
