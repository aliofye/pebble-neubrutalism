const customClay = require('../src/pkjs/custom-clay');

function makeItem(value) {
  return {
    _value: value,
    get: jest.fn(function() { return this._value; }),
    set: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    on: jest.fn(),
  };
}

function makeConfig(themeValue) {
  const themeItem = makeItem(themeValue);
  const colorItems = {
    CUSTOM_DATE: makeItem(0xffffff),
    CUSTOM_WEATHER: makeItem(0xffaa00),
    CUSTOM_TIME: makeItem(0x000000),
    CUSTOM_BODY: makeItem(0xff5500),
    CUSTOM_STEP: makeItem(0xaa55ff),
    CUSTOM_BATTERY: makeItem(0xaa55ff),
  };
  const previewItem = makeItem(null);
  const handlers = {};
  const config = {
    EVENTS: { AFTER_BUILD: 'afterBuild' },
    getItemByMessageKey: jest.fn((key) => {
      if (key === 'COLOR_THEME') return themeItem;
      return colorItems[key];
    }),
    getItemById: jest.fn(() => previewItem),
    on: jest.fn((event, cb) => { handlers[event] = cb; }),
  };
  return { config, handlers, themeItem, colorItems, previewItem };
}

describe('custom-clay', () => {
  it('is a factory function', () => {
    expect(typeof customClay).toBe('function');
  });

  it('shows custom section when theme is Custom after build', () => {
    const { config, handlers, colorItems, previewItem } = makeConfig(6);
    customClay.call(config, {});
    handlers.afterBuild();
    Object.values(colorItems).forEach((item) => {
      expect(item.show).toHaveBeenCalled();
    });
    expect(previewItem.show).toHaveBeenCalled();
  });

  it('hides custom section when theme is not Custom after build', () => {
    const { config, handlers, colorItems, previewItem } = makeConfig(0);
    customClay.call(config, {});
    handlers.afterBuild();
    Object.values(colorItems).forEach((item) => {
      expect(item.hide).toHaveBeenCalled();
    });
    expect(previewItem.hide).toHaveBeenCalled();
  });

  it('toggles on theme change and repaints on color change', () => {
    const { config, handlers, themeItem, colorItems } = makeConfig(0);
    customClay.call(config, {});
    handlers.afterBuild();
    expect(themeItem.on).toHaveBeenCalledWith('change', expect.any(Function));
    expect(colorItems.CUSTOM_BODY.on).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
