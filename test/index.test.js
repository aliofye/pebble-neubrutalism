jest.mock('message_keys', () => ({
  TIME_FORMAT: 'TIME_FORMAT',
  SETTINGS_REQUEST: 'SETTINGS_REQUEST',
  COLOR_THEME: 'COLOR_THEME',
  DAILY_STEP_GOAL: 'DAILY_STEP_GOAL',
  BARS_MODE: 'BARS_MODE',
  WEATHER_ENABLED: 'WEATHER_ENABLED',
  WEATHER_TEMP: 'WEATHER_TEMP',
  WEATHER_UNITS: 'WEATHER_UNITS',
  WEATHER_CODE: 'WEATHER_CODE',
}), { virtual: true });

let clayInstance;
jest.mock('@rebble/clay', () => {
  return class Clay {
    constructor(config, customClay, options) {
      clayInstance = this;
      this.generateUrl = jest.fn(() => 'https://clay.example/');
      this.setSettings = jest.fn();
      this.getSettings = jest.fn((response) => JSON.parse(response));
    }
  };
});

const listeners = {};
global.Pebble = {
  addEventListener: jest.fn((event, cb) => {
    listeners[event] = cb;
  }),
  sendAppMessage: jest.fn(),
  openURL: jest.fn(),
};

jest.useFakeTimers();

require('../src/pkjs/index.js');

function fire(event, arg) {
  listeners[event](arg);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});

describe('index', () => {
  it('requests watch settings on ready', () => {
    fire('ready');
    expect(Pebble.sendAppMessage).toHaveBeenCalledWith(
      { SETTINGS_REQUEST: 1 },
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('syncs appmessage payload keys into clay settings with the right types', () => {
    fire('appmessage', {
      payload: {
        TIME_FORMAT: 1,
        COLOR_THEME: 2,
        DAILY_STEP_GOAL: 5000,
        BARS_MODE: 2,
      },
    });
    expect(clayInstance.setSettings).toHaveBeenCalledWith('TIME_FORMAT', true);
    expect(clayInstance.setSettings).toHaveBeenCalledWith('COLOR_THEME', 2);
    expect(clayInstance.setSettings).toHaveBeenCalledWith('DAILY_STEP_GOAL', 5000);
    expect(clayInstance.setSettings).toHaveBeenCalledWith('BARS_MODE', 2);
  });

  it('syncs weather units from appmessage into clay settings', () => {
    fire('appmessage', { payload: { WEATHER_UNITS: 1 } });
    expect(clayInstance.setSettings).toHaveBeenCalledWith('WEATHER_UNITS', 1);
  });

  it('ignores invalid weather units from appmessage', () => {
    fire('appmessage', { payload: { WEATHER_UNITS: 5 } });
    expect(clayInstance.setSettings).not.toHaveBeenCalledWith('WEATHER_UNITS', 5);
  });

  it('stops the weather timer when weather is disabled and restarts it when enabled', () => {
    // Disable first so the test starts from a known timer state.
    fire('appmessage', { payload: { WEATHER_ENABLED: 0 } });
    expect(clayInstance.setSettings).toHaveBeenCalledWith('WEATHER_ENABLED', false);
    expect(jest.getTimerCount()).toBe(0);

    fire('appmessage', { payload: { WEATHER_ENABLED: 1 } });
    expect(clayInstance.setSettings).toHaveBeenCalledWith('WEATHER_ENABLED', true);
    expect(jest.getTimerCount()).toBe(1);

    fire('appmessage', { payload: { WEATHER_ENABLED: 0 } });
    expect(clayInstance.setSettings).toHaveBeenCalledWith('WEATHER_ENABLED', false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('normalizes the weather enabled toggle when the config closes', () => {
    fire('webviewclosed', { response: JSON.stringify({ WEATHER_ENABLED: 'false' }) });
    expect(Pebble.sendAppMessage).toHaveBeenCalledWith(
      { WEATHER_ENABLED: 0 },
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('ignores appmessages without any known keys', () => {
    fire('appmessage', { payload: { UNKNOWN_KEY: 1 } });
    expect(clayInstance.setSettings).not.toHaveBeenCalled();
  });

  it('prepares configuration on showConfiguration and falls back after 1s', () => {
    fire('showConfiguration');
    expect(Pebble.sendAppMessage).toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(Pebble.openURL).toHaveBeenCalledWith('https://clay.example/');
  });

  it('opens the configuration when an appmessage arrives while pending', () => {
    fire('showConfiguration');
    fire('appmessage', { payload: { TIME_FORMAT: 1 } });
    expect(clayInstance.setSettings).toHaveBeenCalledWith('TIME_FORMAT', true);
    expect(Pebble.openURL).toHaveBeenCalledWith('https://clay.example/');
  });

  it('coerces theme and weather units to numbers and sends them to the watch', () => {
    fire('webviewclosed', {
      response: JSON.stringify({
        COLOR_THEME: '2',
        DAILY_STEP_GOAL: '5000',
        BARS_MODE: '1',
        WEATHER_UNITS: '1',
      }),
    });
    expect(Pebble.sendAppMessage).toHaveBeenCalledWith(
      { COLOR_THEME: 2, DAILY_STEP_GOAL: 5000, BARS_MODE: 1, WEATHER_UNITS: 1 },
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('clamps out-of-range step goals to the default', () => {
    fire('webviewclosed', { response: JSON.stringify({ DAILY_STEP_GOAL: '0' }) });
    expect(Pebble.sendAppMessage).toHaveBeenCalledWith(
      { DAILY_STEP_GOAL: 10000 },
      expect.any(Function),
      expect.any(Function)
    );

    jest.clearAllMocks();
    fire('webviewclosed', { response: JSON.stringify({ DAILY_STEP_GOAL: '200000' }) });
    expect(Pebble.sendAppMessage).toHaveBeenCalledWith(
      { DAILY_STEP_GOAL: 10000 },
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('rounds fractional step goals and defaults on non-numeric input', () => {
    fire('webviewclosed', { response: JSON.stringify({ DAILY_STEP_GOAL: '1500.7' }) });
    expect(Pebble.sendAppMessage).toHaveBeenCalledWith(
      { DAILY_STEP_GOAL: 1501 },
      expect.any(Function),
      expect.any(Function)
    );

    jest.clearAllMocks();
    fire('webviewclosed', { response: JSON.stringify({ DAILY_STEP_GOAL: 'abc' }) });
    expect(Pebble.sendAppMessage).toHaveBeenCalledWith(
      { DAILY_STEP_GOAL: 10000 },
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('is a no-op when the webview closes without a response', () => {
    fire('webviewclosed', {});
    fire('webviewclosed', { response: null });
    expect(Pebble.sendAppMessage).not.toHaveBeenCalled();
  });
});