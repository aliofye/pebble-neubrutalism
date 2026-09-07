// Weather widget phone side: hourly open-meteo fetch with a 30min location
// cache, gated on the enabled setting. Included in the generated app only
// when the weather widget is listed. Hook interface consumed by the generated
// src/pkjs/index.js: { onReady, onWatchSettings, onPhoneSettings }.
var WEATHER_FETCH_INTERVAL_MS = 60 * 60 * 1000;
var LOCATION_CACHE_MS = 30 * 60 * 1000;

var weatherEnabled = true;
var currentWeatherUnits = 0;
var weatherFetchPending = false;
var weatherTimer = null;

function fetchWeather(latitude, longitude, ctx) {
  var unit = currentWeatherUnits === 1 ? 'celsius' : 'fahrenheit';
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude +
            '&longitude=' + longitude +
            '&current=temperature_2m,weather_code&temperature_unit=' + unit;
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
        payload[ctx.messageKeys.WEATHER_TEMP] = Math.round(data.current.temperature_2m);
        if (typeof data.current.weather_code === 'number') {
          payload[ctx.messageKeys.WEATHER_CODE] = data.current.weather_code;
        }
        ctx.Pebble.sendAppMessage(payload, function() {
          console.log('Weather synced: ' + payload[ctx.messageKeys.WEATHER_TEMP]);
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

function fetchWeatherForLocation(ctx) {
  if (!weatherEnabled || weatherFetchPending) {
    return;
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return;
  }
  weatherFetchPending = true;
  navigator.geolocation.getCurrentPosition(function(position) {
    weatherFetchPending = false;
    fetchWeather(position.coords.latitude, position.coords.longitude, ctx);
  }, function(error) {
    weatherFetchPending = false;
    console.log('Could not get location: ' + JSON.stringify(error));
  }, { timeout: 15000, maximumAge: LOCATION_CACHE_MS });
}

function syncWeatherScheduling(ctx) {
  if (weatherEnabled) {
    if (weatherTimer === null) {
      weatherTimer = setInterval(function() { fetchWeatherForLocation(ctx); }, WEATHER_FETCH_INTERVAL_MS);
    }
    fetchWeatherForLocation(ctx);
  } else {
    if (weatherTimer !== null) {
      clearInterval(weatherTimer);
      weatherTimer = null;
    }
  }
}

module.exports = {
  onReady: function(ctx) {
    syncWeatherScheduling(ctx);
  },
  onWatchSettings: function(payload, ctx) {
    var MK = ctx.messageKeys;
    var enabled = payload.WEATHER_ENABLED !== undefined
      ? payload.WEATHER_ENABLED : payload[MK.WEATHER_ENABLED];
    var units = payload.WEATHER_UNITS !== undefined
      ? payload.WEATHER_UNITS : payload[MK.WEATHER_UNITS];
    if (enabled !== undefined) {
      weatherEnabled = Number(enabled) !== 0;
      syncWeatherScheduling(ctx);
    }
    if (units !== undefined) {
      var u = Number(units);
      if ((u === 0 || u === 1) && u !== currentWeatherUnits) {
        currentWeatherUnits = u;
        fetchWeatherForLocation(ctx);
      }
    }
  },
  onPhoneSettings: function(settings, ctx) {
    var MK = ctx.messageKeys;
    if (settings.WEATHER_ENABLED !== undefined || settings[MK.WEATHER_ENABLED] !== undefined) {
      var raw = settings.WEATHER_ENABLED !== undefined ? settings.WEATHER_ENABLED : settings[MK.WEATHER_ENABLED];
      weatherEnabled = raw === true || raw === 'true' || raw === 1 || raw === '1';
    }
    var u = settings.WEATHER_UNITS !== undefined ? settings.WEATHER_UNITS : settings[MK.WEATHER_UNITS];
    if (u !== undefined) {
      var n = Number(u);
      if (n === 0 || n === 1) {
        currentWeatherUnits = n;
      }
    }
  },
};
