# Contributing to Neubrutalism

Thanks for your interest in improving Neubrutalism! This is a small, focused Pebble
watchface — contributions of all sizes are welcome.

## Project layout

```
src/c/      C watchface (drawing, theming, time/battery/steps)
src/pkjs/   PebbleKit JS companion (Clay settings config on the phone)
test/       Jest unit tests for the JS
docs/       Design specs, plans, and the on-device QA checklist
```

The watch (C) renders the clock and the bottom progress bar; the phone (JS) hosts
the Clay settings screen. See the `README` and `docs/` for the architecture.

## Prerequisites

- **Node 24 LTS** and npm — see `.nvmrc`; `nvm use` / `fnm use` will pick it up.
- **Pebble SDK** (the revived Core Devices / PebbleOS tooling) — for the watch build.
  Install per <https://developer.repebble.com/docs/> (`uv tool install pebble-tool`,
  then `pebble sdk install latest`).

## Building & running

```bash
npm install                        # JS deps
npm test                           # run the unit tests
./scripts/test-c.sh                # host-side C tests (no SDK needed)
./scripts/build-watch.sh           # build the watchface (alias for pebble build)
pebble install --emulator basalt   # run in the emulator
pebble install --phone             # install to a paired watch (CloudPebble relay)
```

## Tests

The phone-side JS is unit-tested and should stay green:

```bash
npm test -- --coverage
```

Please add or update tests for any JS change. Everything on the watch (drawing,
theming, the battery/steps bar) is verified on the emulator and on-device — see
[`docs/QA-checklist.md`](docs/QA-checklist.md).

## Style

- `.editorconfig` defines the basics (2-space indent, LF, trailing-whitespace trim).
- Keep files small and single-purpose; each source file starts with a short comment
  describing its responsibility — please keep that up to date.
- Match the surrounding code; no build-time linter is enforced yet.

## Commit messages

Conventional-commits style — a lowercase `type:` prefix, then an imperative summary,
per the [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
specification:

```
feat: add a Game Boy Green theme
fix: align the battery bar on 144px displays
docs: refresh screenshots with the new palette
```

Types in use, roughly in order of how often they come up:

| type | for |
| --- | --- |
| `feat:` | new user-visible behaviour |
| `fix:` | a bug the user could hit |
| `docs:` | README, `docs/`, code comments only |
| `chore:` | tooling, gitignore, CI, repo hygiene |
| `test:` | tests without a behaviour change |
| `refactor:` | moving code without changing behaviour |

**Exempt: version bumps.** `npm version patch|minor|major` writes the bare version
number as the subject (`1.2.1`) and tags it. Leave those alone — rewording them means
rewriting a commit a release tag already points at.

## Pull requests

1. Branch off `main`, make focused commits.
2. `npm test` must pass; `./scripts/build-watch.sh` should succeed.
3. Open a PR describing the change and how you verified it (include the QA steps you
   ran for watch-side changes).
4. The repo allows **rebase merges only** — squash and merge commits are disabled, so
   every commit on your branch lands on `main` individually. Tidy the branch before
   asking for a merge.

## License

[MIT](LICENSE). By contributing you agree your contributions are released under it.
