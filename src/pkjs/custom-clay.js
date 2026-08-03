module.exports = function() {
  var clayConfig = this;

  function updateDailyStepGoalVisibility() {
    var goalItem = clayConfig.getItemByMessageKey('DAILY_STEP_GOAL');
    if (Number(this.get()) === 1) {
      goalItem.show();
    } else {
      goalItem.hide();
    }
  }

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    var metricItem = clayConfig.getItemByMessageKey('BOTTOM_BAR_METRIC');
    updateDailyStepGoalVisibility.call(metricItem);
    metricItem.on('change', updateDailyStepGoalVisibility);
  });
};
