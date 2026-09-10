module.exports = function(minified) {
  var clayConfig = this;
  var CUSTOM_KEYS = ['CUSTOM_DATE', 'CUSTOM_WEATHER', 'CUSTOM_TIME', 'CUSTOM_BODY', 'CUSTOM_STEP', 'CUSTOM_BATTERY'];

  function css(n) {
    var v = Math.round(Number(n));
    if (!isFinite(v) || v < 0) v = 0;
    if (v > 0xffffff) v = 0xffffff;
    var h = v.toString(16);
    while (h.length < 6) h = '0' + h;
    return '#' + h;
  }

  function setCustomVisible(visible) {
    var i, item;
    for (i = 0; i < CUSTOM_KEYS.length; i++) {
      item = clayConfig.getItemByMessageKey(CUSTOM_KEYS[i]);
      if (item) {
        if (visible) item.show(); else item.hide();
      }
    }
    var preview = clayConfig.getItemById('custom-preview');
    if (preview) {
      if (visible) preview.show(); else preview.hide();
    }
  }

  function readColors() {
    var out = {};
    var i, item;
    for (i = 0; i < CUSTOM_KEYS.length; i++) {
      item = clayConfig.getItemByMessageKey(CUSTOM_KEYS[i]);
      out[CUSTOM_KEYS[i]] = item ? item.get() : 0;
    }
    return out;
  }

  function repaint() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    var canvas = document.getElementById('custom-preview-canvas');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var c = readColors();
    ctx.fillStyle = '#FFFFAA';
    ctx.fillRect(0, 0, 200, 60);
    ctx.fillStyle = '#000000';
    ctx.fillRect(17, 2, 166, 30);
    ctx.fillStyle = css(c.CUSTOM_BODY);
    ctx.fillRect(20, 5, 160, 24);
    ctx.fillStyle = css(c.CUSTOM_DATE);
    ctx.fillRect(120, 5, 60, 14);
    ctx.fillStyle = css(c.CUSTOM_WEATHER);
    ctx.fillRect(20, 5, 60, 14);
    ctx.fillStyle = css(c.CUSTOM_TIME);
    ctx.fillRect(70, 12, 60, 10);
    ctx.fillStyle = '#000000';
    ctx.fillRect(20, 38, 160, 8);
    ctx.fillStyle = css(c.CUSTOM_BATTERY);
    ctx.fillRect(23, 40, 128, 4);
    ctx.fillStyle = '#000000';
    ctx.fillRect(20, 49, 160, 8);
    ctx.fillStyle = css(c.CUSTOM_STEP);
    ctx.fillRect(23, 51, 64, 4);
  }

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    var themeItem = clayConfig.getItemByMessageKey('COLOR_THEME');
    function sync() {
      var v = Number(themeItem.get());
      setCustomVisible(v === 6);
    }
    sync();
    themeItem.on('change', sync);
    var i;
    for (i = 0; i < CUSTOM_KEYS.length; i++) {
      var item = clayConfig.getItemByMessageKey(CUSTOM_KEYS[i]);
      if (item) item.on('change', repaint);
    }
    repaint();
  });
};
