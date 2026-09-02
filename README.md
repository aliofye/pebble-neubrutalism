# Neubrutalism+ — a Pebble watchface

![CI](https://github.com/aliofye/pebble-neubrutalism/actions/workflows/ci.yml/badge.svg)

> Built on top of [Yorks0n's neubrutalism watchface](https://github.com/Yorks0n/neubrutalism)
> — thanks to [brilliant Yorks0n](https://github.com/Yorks0n) for open-sourcing it.

A Pebble watchface with a bold, chunky **neubrutalism** aesthetic: a thick black
outline, hard color blocks, and a pixel-style Jersey font. It shows live weather,
battery, and a daily-steps progress bar, and the whole palette can be swapped
between several color themes.

## Hardware

Built for the revived Pebble platform (Core Devices / PebbleOS). Ships for
**aplite** (Pebble classic), **basalt** (Pebble Time), **diorite** (Pebble 2),
**emery** (Pebble Time 2), and **flint** (Pebble 2 Duo) — the layout and
type sizes adapt to each display.

## Features

- **Neubrutalist clock** — a pixel-style Jersey time in an orange block on a
  pastel-yellow ground, framed by a thick black outline.
- **Date** — short day/month, rendered in the matching font.
- **Weather** — live temperature in a mirrored bubble (Fahrenheit or Celsius).
- **Battery & steps** — battery level and progress toward your **daily step goal**
  shown as two stacked progress bars.
- **Color themes** — Neubrutalism (default), Game Boy Green, Ocean Blue, Amber
  LCD, Monochrome, and Purple Pixel.
- **12/24-hour time** — your preference, set on the phone.

## Settings (on your phone)

Time format (12/24-hour), color theme, daily step target (1,000–100,000, default
10,000), and temperature units (Fahrenheit or Celsius). Open the watchface's
settings from the Pebble app to configure them.

## Screenshots

| Basalt | Aplite | Theme |
| --- | --- | --- |
| ![Neubrutalism on Basalt](docs/screenshots/screenshot_basalt.png) | ![Neubrutalism on Aplite](docs/screenshots/screenshot_aplite.png) | ![Theme](docs/screenshots/theme_neubrutalism.png) |

## Build & run

```bash
npm install                          # JS deps; Node 24 LTS per .nvmrc
npm test                             # JS unit tests
./scripts/test-c.sh                  # host-side C tests (no SDK needed)
pebble build
pebble install --emulator basalt
pebble install --phone               # a paired watch (CloudPebble relay; needs Dev Connect on)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full dev setup and
[`docs/QA-checklist.md`](docs/QA-checklist.md) for the on-device test pass.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Commits follow
the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
specification.

## Testing

The phone-side JS is unit-tested with Jest and runs in CI on every push/PR:

```bash
npm test -- --coverage
```

The watch build itself is compiled in CI on every push/PR:

```bash
./scripts/build-watch.sh
```

## License

This project is licensed under the [MIT License](LICENSE).
