module.exports = function(minified) {
  var clayConfig = this;
  var CUSTOM_KEYS = ['CUSTOM_DATE', 'CUSTOM_WEATHER', 'CUSTOM_TIME', 'CUSTOM_BODY', 'CUSTOM_STEP', 'CUSTOM_BATTERY'];

  // Pixel digits, same shapes as src/c/glyphs.c (10 rows each).
  var GLYPHS = {
    '0': ['011110', '110011', '110011', '110011', '110011', '110011', '110011', '110011', '110011', '011110'],
    '1': ['111', '111', '011', '011', '011', '011', '011', '011', '011', '011'],
    '2': ['0111110', '1111111', '1100011', '0000111', '0001110', '0011100', '0111000', '1110000', '1111111', '1111111'],
    '3': ['0111110', '1111111', '1100011', '0000011', '0011110', '0011110', '0000011', '1100011', '1111111', '0111110'],
    '4': ['000011', '000111', '001111', '011011', '110011', '110011', '111111', '111111', '000011', '000011'],
    '5': ['111111', '111111', '110000', '110000', '111110', '011111', '000011', '110011', '111111', '011110'],
    '6': ['0111110', '1111111', '1100011', '1100000', '1111110', '1111111', '1100011', '1100011', '1111111', '0111110'],
    '7': ['111111', '111111', '000011', '000011', '000111', '001110', '001110', '001100', '001100', '001100'],
    '8': ['0111110', '1111111', '1100011', '1100011', '0111110', '1111111', '1100011', '1100011', '1111111', '0111110'],
    '9': ['0111110', '1111111', '1100011', '1100011', '1111111', '0111111', '0000011', '1100011', '1111111', '0111110'],
    ':': ['00', '00', '11', '11', '00', '00', '00', '00', '11', '11']
  };

  // Date/weather bubble outlines, same geometry as the watch (144px layout).
  var DATE_POLY = [[72, 9], [137, 9], [137, 33], [135, 33], [135, 35], [132, 35], [132, 38], [130, 38], [130, 41], [126, 41], [126, 33], [126, 33], [72, 33]];
  var WEATHER_POLY = [[72, 9], [7, 9], [7, 33], [9, 33], [9, 35], [12, 35], [12, 38], [14, 38], [14, 41], [18, 41], [18, 33], [18, 33], [72, 33]];

  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

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

  function fillPoly(ctx, points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    var i;
    for (i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  function outline(ctx, points, stroke, color) {
    var half = Math.floor(stroke / 2);
    ctx.fillStyle = color;
    var i, p1, p2, x0, x1, y0, y1;
    for (i = 0; i < points.length; i++) {
      p1 = points[i];
      p2 = points[(i + 1) % points.length];
      if (p1[1] === p2[1]) {
        x0 = Math.min(p1[0], p2[0]);
        x1 = Math.max(p1[0], p2[0]);
        ctx.fillRect(x0 - half, p1[1] - half, (x1 - x0) + stroke, stroke);
      } else if (p1[0] === p2[0]) {
        y0 = Math.min(p1[1], p2[1]);
        y1 = Math.max(p1[1], p2[1]);
        ctx.fillRect(p1[0] - half, y0 - half, stroke, (y1 - y0) + stroke);
      }
    }
  }

  function bubbleText(ctx, text, cx, y, color) {
    ctx.font = 'bold 19px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(text, cx, y);
  }

  function metricBar(ctx, x, y, w, h, percent, fill) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 2, y + 3, w + 2, h);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#FFFFAA';
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
    var inner = w - 14;
    var bw = Math.floor(inner * percent / 100);
    ctx.fillStyle = fill;
    ctx.fillRect(x + 7, y + 7, bw, h - 14);
  }

  function repaint() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    var canvas = document.getElementById('custom-preview-canvas');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var c = readColors();
    var now = new Date();
    var hh = now.getHours();
    var h12 = hh % 12 === 0 ? 12 : hh % 12;
    var mm = now.getMinutes();
    var timeStr = h12 + ':' + (mm < 10 ? '0' + mm : mm);
    var dateStr = MONTHS[now.getMonth()] + ' ' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate());

    // Background + time-box block with shadow and ink border.
    ctx.fillStyle = '#FFFFAA';
    ctx.fillRect(0, 0, 144, 168);
    ctx.fillStyle = '#000000';
    ctx.fillRect(15, 40, 121, 62);
    ctx.fillRect(11, 30, 121, 62);
    ctx.fillStyle = css(c.CUSTOM_BODY);
    ctx.fillRect(14, 33, 115, 56);

    // Bubbles.
    fillPoly(ctx, DATE_POLY, css(c.CUSTOM_DATE));
    outline(ctx, DATE_POLY, 4, '#000000');
    fillPoly(ctx, WEATHER_POLY, css(c.CUSTOM_WEATHER));
    outline(ctx, WEATHER_POLY, 4, '#000000');
    bubbleText(ctx, dateStr, 105, 27, css(c.CUSTOM_TIME));
    bubbleText(ctx, '72F', 39, 27, css(c.CUSTOM_TIME));

    // Pixel time digits centered in the body.
    var pix = 3;
    var i, r, col;
    var total = 0;
    for (i = 0; i < timeStr.length; i++) {
      total += GLYPHS[timeStr[i]][0].length * pix;
      if (i < timeStr.length - 1) total += pix;
    }
    var cx = 17 + Math.floor((109 - total) / 2);
    var cy = 36 + Math.floor((50 - 30) / 2);
    ctx.fillStyle = css(c.CUSTOM_TIME);
    var gx = cx;
    for (i = 0; i < timeStr.length; i++) {
      var g = GLYPHS[timeStr[i]];
      var gw = g[0].length;
      for (r = 0; r < 10; r++) {
        for (col = 0; col < gw; col++) {
          if (g[r][col] === '1') ctx.fillRect(gx + col * pix, cy + r * pix, pix, pix);
        }
      }
      gx += gw * pix + pix;
    }

    // Stacked bars below the time box.
    metricBar(ctx, 16, 100, 112, 24, 80, css(c.CUSTOM_BATTERY));
    metricBar(ctx, 16, 130, 112, 24, 40, css(c.CUSTOM_STEP));
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
