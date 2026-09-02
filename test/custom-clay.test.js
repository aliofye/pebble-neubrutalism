const customClay = require('../src/pkjs/custom-clay');

describe('custom-clay', () => {
  it('is a factory function', () => {
    expect(typeof customClay).toBe('function');
  });

  it('does not register any config handlers', () => {
    const config = {
      EVENTS: { AFTER_BUILD: 'afterBuild' },
      getItemByMessageKey: jest.fn(),
      on: jest.fn(),
    };

    customClay.call(config);

    expect(config.on).not.toHaveBeenCalled();
  });
});