#!/usr/bin/env python3
"""Phase 2: hand extraction of Neubrutalism+ into design.json (one-time).

Values transcribed from src/c/neubrutalism.c, glyphs.c, layout.c.
Regenerate: python3 tools/pebble-editor/extract-neubrutalism.py
"""
import json
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                   'pebble-editor', 'examples', 'neubrutalism-plus.design.json')

GLYPHS = {
    '0': ["011110", "110011", "110011", "110011", "110011",
          "110011", "110011", "110011", "110011", "011110"],
    '1': ["111", "111", "011", "011", "011",
          "011", "011", "011", "011", "011"],
    '2': ["0111110", "1111111", "1100011", "0000111", "0001110",
          "0011100", "0111000", "1110000", "1111111", "1111111"],
    '3': ["0111110", "1111111", "1100011", "0000011", "0011110",
          "0011110", "0000011", "1100011", "1111111", "0111110"],
    '4': ["000011", "000111", "001111", "011011", "110011",
          "110011", "111111", "111111", "000011", "000011"],
    '5': ["111111", "111111", "110000", "110000", "111110",
          "011111", "000011", "110011", "111111", "011110"],
    '6': ["0111110", "1111111", "1100011", "1100000", "1111110",
          "1111111", "1100011", "1100011", "1111111", "0111110"],
    '7': ["111111", "111111", "000011", "000011", "000111",
          "001110", "001110", "001100", "001100", "001100"],
    '8': ["0111110", "1111111", "1100011", "1100011", "0111110",
          "1111111", "1100011", "1100011", "1111111", "0111110"],
    '9': ["0111110", "1111111", "1100011", "1100011", "1111111",
          "0111111", "0000011", "1100011", "1111111", "0111110"],
    ':': ["00", "00", "11", "11", "00", "00", "00", "00", "11", "11"],
}

POLY_DATE_200 = [[100, 12], [190, 12], [190, 45], [187, 45], [187, 48],
                 [184, 48], [184, 51], [181, 51], [181, 55], [175, 55],
                 [175, 45], [175, 45], [100, 45]]
POLY_DATE_144 = [[72, 9], [137, 9], [137, 33], [135, 33], [135, 35],
                 [132, 35], [132, 38], [130, 38], [130, 41], [126, 41],
                 [126, 33], [126, 33], [72, 33]]
POLY_WX_200 = [[100, 12], [10, 12], [10, 45], [13, 45], [13, 48],
               [16, 48], [16, 51], [19, 51], [19, 55], [25, 55],
               [25, 45], [25, 45], [100, 45]]
POLY_WX_144 = [[72, 9], [7, 9], [7, 33], [9, 33], [9, 35],
               [12, 35], [12, 38], [14, 38], [14, 41], [18, 41],
               [18, 33], [18, 33], [72, 33]]

BATTERY_FILL = {
    "cases": [
        {"when": {"var": "theme.battery_status", "op": "eq", "value": False},
         "fill": "$battery_bar"},
        {"when": {"var": "battery", "op": "lt", "value": 20},
         "fill": "$battery_low"},
        {"when": {"var": "battery", "op": "lt", "value": 50},
         "fill": "$battery_mid"},
    ],
    "default": "$battery_high",
}

WEATHER_FILL = {
    "cases": [
        {"when": {"var": "theme.weather_condition_colors", "op": "eq", "value": False},
         "fill": "GColorWhite"},
        {"when": {"var": "weather_available", "op": "eq", "value": False},
         "fill": "GColorWhite"},
        {"when": {"var": "weather_code", "op": "in", "value": [0, 1]},
         "fill": "GColorChromeYellow"},
        {"when": {"var": "weather_code", "op": "in", "value": [2, 3, 45, 48]},
         "fill": "GColorLightGray"},
        {"when": {"var": "weather_code", "op": "in",
                  "value": [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]},
         "fill": "GColorBabyBlueEyes"},
        {"when": {"var": "weather_code", "op": "in", "value": [95, 96, 99]},
         "fill": "GColorVividViolet"},
    ],
    "default": "GColorWhite",
}

WX_VISIBLE = {"any": [
    {"var": "weather_enabled", "op": "eq", "value": True},
    {"var": "bt", "op": "eq", "value": False},
]}


def theme(name, bg, body, accent, frame, bar, low, mid, high,
          status, wxcolors, step):
    return {
        "name": name,
        "tokens": {
            "background": bg, "body": body, "accent": accent,
            "battery_frame": frame, "battery_bar": bar, "ink": "GColorBlack",
            "battery_low": low, "battery_mid": mid, "battery_high": high,
            "step_bar": step,
        },
        "flags": {
            "battery_status": status,
            "weather_condition_colors": wxcolors,
        },
    }


THEMES = [
    theme("neubrutalism", "GColorPastelYellow", "GColorOrange",
          "GColorChromeYellow", "GColorPastelYellow", "GColorLavenderIndigo",
          "GColorRed", "GColorChromeYellow", "GColorMayGreen",
          True, True, "GColorLavenderIndigo"),
    theme("game_boy_green", "GColorLightGray", "GColorMayGreen",
          "GColorMintGreen", "GColorLightGray", "GColorDarkGreen",
          "GColorDarkGreen", "GColorDarkGreen", "GColorDarkGreen",
          False, False, "GColorMintGreen"),
    theme("ocean_blue", "GColorCeleste", "GColorPictonBlue",
          "GColorElectricBlue", "GColorCeleste", "GColorCobaltBlue",
          "GColorCobaltBlue", "GColorCobaltBlue", "GColorCobaltBlue",
          False, False, "GColorElectricBlue"),
    theme("amber_lcd", "GColorPastelYellow", "GColorChromeYellow",
          "GColorIcterine", "GColorPastelYellow", "GColorOrange",
          "GColorOrange", "GColorOrange", "GColorOrange",
          False, False, "GColorIcterine"),
    theme("monochrome", "GColorLightGray", "GColorWhite",
          "GColorWhite", "GColorLightGray", "GColorDarkGray",
          "GColorDarkGray", "GColorDarkGray", "GColorDarkGray",
          False, False, "GColorWhite"),
    theme("purple_pixel", "GColorRichBrilliantLavender", "GColorLavenderIndigo",
          "GColorBabyBlueEyes", "GColorRichBrilliantLavender", "GColorIndigo",
          "GColorIndigo", "GColorIndigo", "GColorIndigo",
          False, False, "GColorBabyBlueEyes"),
]

T = "h/5+h/3+orange_stroke+w/shadow_div"


def meterbar(x, y, w, h, value, fill, mode):
    return {
        "kind": "meterbar",
        "box": {"x": x, "y": y, "w": w, "h": h},
        "stroke": "orange_stroke",
        "shadow": {"dx": 2, "dy": "metric_shadow"},
        "frame": "$battery_frame",
        "core": "$ink",
        "value": value,
        "fill": fill,
        "inset": 3,
        "compact": {"maxH": 30, "stroke": 3, "inset": 2},
        "visibleWhen": {"var": "bars_mode", "op": "eq", "value": mode},
    }


def screen(w, h, poly_date, poly_wx, font, date_box, wx_box, bt_center,
           bar_x, bar_w, stack_bar, stack_gap, single_bar,
           squash):
    stack_resid = "2*%d+%d+metric_shadow" % (stack_bar, stack_gap)
    single_resid = "%d+metric_shadow" % single_bar
    stack_top = (T + "+((h-(%s))-(%s))/2" % (T, stack_resid))
    single_top = (T + "+((h-(%s))-(%s))/2" % (T, single_resid))
    layers = [
        {
            "id": "background", "kind": "graphics",
            "note": "redraw on theme/weather/bluetooth change",
            "items": [
                {"kind": "rect",
                 "box": {"x": "w/10-orange_stroke+w/shadow_div",
                         "y": "h/5-orange_stroke+w/shadow_div",
                         "w": "(w*8)/10+2*orange_stroke",
                         "h": "h/3+2*orange_stroke"},
                 "fill": "$ink"},
                {"kind": "rect",
                 "box": {"x": "w/10-orange_stroke",
                         "y": "h/5-orange_stroke",
                         "w": "(w*8)/10+2*orange_stroke",
                         "h": "h/3+2*orange_stroke"},
                 "fill": "$ink"},
                {"kind": "rect",
                 "box": {"x": "w/10+orange_stroke",
                         "y": "h/5+orange_stroke",
                         "w": "(w*8)/10-2*orange_stroke",
                         "h": "h/3-2*orange_stroke"},
                 "fill": "$body"},
                {"kind": "polygon", "points": poly_date,
                 "fill": "GColorWhite", "outline": {"stroke": "outline_stroke"}},
                {"kind": "polygon", "points": poly_wx,
                 "fill": WEATHER_FILL, "outline": {"stroke": "outline_stroke"},
                 "visibleWhen": WX_VISIBLE},
                {"kind": "bitmap", "id": "bt", "center": bt_center,
                 "visibleWhen": {"var": "bt", "op": "eq", "value": False}},
            ],
        },
        {
            "id": "bars", "kind": "graphics",
            "note": "redraw on battery/step/theme/mode change",
            "items": [
                meterbar(bar_x, stack_top, bar_w, stack_bar,
                         "$battery", BATTERY_FILL, 0),
                meterbar(bar_x, "(" + stack_top + ")+%d+%d" % (stack_bar, stack_gap),
                         bar_w, stack_bar, "$steps", "$step_bar", 0),
                meterbar(bar_x, single_top, bar_w, single_bar,
                         "$battery", BATTERY_FILL, 1),
                meterbar(bar_x, single_top, bar_w, single_bar,
                         "$steps", "$step_bar", 2),
            ],
        },
        {
            "id": "date", "kind": "text",
            "box": {"x": date_box[0], "y": date_box[1],
                    "w": date_box[2], "h": date_box[3]},
            "font": font, "fill": "$ink",
            "align": "center", "vcenter": True, "text": "$date_str",
        },
        {
            "id": "weather", "kind": "text",
            "box": {"x": wx_box[0], "y": wx_box[1],
                    "w": wx_box[2], "h": wx_box[3]},
            "font": font, "fill": "GColorBlack",
            "align": "center", "vcenter": True, "text": "$weather_str",
            "visibleWhen": WX_VISIBLE,
        },
        {
            "id": "time", "kind": "pixeltext",
            "note": "the only layer redrawn every minute",
            "box": {"x": "w/10+orange_stroke",
                    "y": "h/5+orange_stroke",
                    "w": "(w*8)/10-2*orange_stroke",
                    "h": "h/3-2*orange_stroke"},
            "pixelFont": "digits", "fill": "$ink",
            "text": "$time_str", "scaleDivisor": 40,
            **({"scaleOverride": [
                {"when": {"var": "display_hour", "op": "in",
                           "value": [20, 21, 22, 23]},
                 "y": 4}
            ]} if squash else {}),
        },
    ]
    return {"w": w, "h": h, "layers": layers}


doc = {
    "schema": 1,
    "name": "neubrutalism-plus",
    "constants": {
        "orange_stroke": 3,
        "metric_shadow": 3,
        "shadow_div": 30,
        "outline_stroke": 4,
    },
    "screens": {
        "w200": screen(200, 228, POLY_DATE_200, POLY_WX_200, "jersey38",
                       [93, 0, 104, 40], [3, 0, 104, 40], [55, 28],
                       22, 155, 32, 8, 45, True),
        "w144": screen(144, 168, POLY_DATE_144, POLY_WX_144, "jersey25",
                       [69, 3, 72, 28], [3, 3, 72, 28], [39, 25],
                       16, 112, 24, 6, 38, False),
    },
    "themes": THEMES,
    "state": [
        {"name": "time_str", "type": "string",
         "desc": "formatted time, host-side 12/24h handling"},
        {"name": "date_str", "type": "string",
         "desc": "uppercased date, host formatted"},
        {"name": "display_hour", "type": "int",
         "desc": "displayed hour, drives pixel squash quirk"},
        {"name": "weather_str", "type": "string",
         "desc": "formatted temp+units or placeholder"},
        {"name": "battery", "type": "int",
         "desc": "battery percent 0-100"},
        {"name": "steps", "type": "int",
         "desc": "step-goal percent 0-100"},
        {"name": "weather_code", "type": "int",
         "desc": "WMO weather code"},
        {"name": "weather_available", "type": "bool"},
        {"name": "weather_enabled", "type": "bool"},
        {"name": "bt", "type": "bool",
         "desc": "bluetooth connected"},
        {"name": "bars_mode", "type": "int",
         "desc": "0 both, 1 battery, 2 steps"},
    ],
    "fonts": [
        {"id": "jersey38", "resource": "FONT_JERSEY_38"},
        {"id": "jersey25", "resource": "FONT_JERSEY_25"},
    ],
    "bitmaps": [
        {"id": "bt", "resource": "IMAGE_BT_DISCONNECT"},
    ],
    "pixelFonts": {
        "digits": {"rows": 10, "chars": GLYPHS},
    },
}

import sys

if os.path.exists(OUT) and '--force' not in sys.argv:
    print('refusing to overwrite %s without --force' % OUT)
    sys.exit(2)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(doc, f, indent=2)
    f.write('\n')
print('wrote', OUT)
