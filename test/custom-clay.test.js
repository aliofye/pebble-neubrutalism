const customClay = require('../src/pkjs/custom-clay');

function makeConfig() {
  const events = {};
  const goalItem = { show: jest.fn(), hide: jest.fn() };
  const metricItem = { get: jest.fn(() => 0), on: jest.fn() };
  const config = {
    EVENTS: { AFTER_BUILD: 'afterBuild' },
    getItemByMessageKey: jest.fn((key) =>
      key === 'BOTTOM_BAR_METRIC' ? metricItem : goalItem
    ),
    on: jest.fn((evt, cb) => {
      events[evt] = cb;
    }),
  };
  return { config, events, goalItem, metricItem };
}

describe('custom-clay', () => {
  it('is a factory function', () => {
    expect(typeof customClay).toBe('function');
  });

  it('registers an AFTER_BUILD handler that wires the step-goal field to the bottom-bar metric', () => {
    const { config, events, goalItem, metricItem } = makeConfig();

    customClay.call(config);

    expect(config.on).toHaveBeenCalledWith('afterBuild', expect.any(Function));

    events.afterBuild();

    expect(config.getItemByMessageKey).toHaveBeenCalledWith('BOTTOM_BAR_METRIC');
    expect(config.getItemByMessageKey).toHaveBeenCalledWith('DAILY_STEP_GOAL');
    expect(metricItem.on).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('shows the step-goal field when the bottom bar measures daily steps, hides it for battery', () => {
    const { config, events, goalItem, metricItem } = makeConfig();

    customClay.call(config);

    // metric = Daily Steps (1) -> goal visible
    metricItem.get.mockReturnValue(1);
    events.afterBuild();
    expect(goalItem.show).toHaveBeenCalled();

    // metric = Battery (0) -> goal hidden, via the change handler
    goalItem.show.mockClear();
    metricItem.get.mockReturnValue(0);
    const changeHandler = metricItem.on.mock.calls[0][1];
    changeHandler.call(metricItem);
    expect(goalItem.hide).toHaveBeenCalled();
  });
});
