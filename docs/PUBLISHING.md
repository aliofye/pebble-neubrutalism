# Publishing Neubrutalism to the Pebble Appstore

The revived Pebble appstore lives at **apps.repebble.com** and is served through
**Rebble's developer portal** ([dev-portal.rebble.io](https://dev-portal.rebble.io/)).
Apps uploaded there also appear on the Pebble Appstore — no Rebble subscription is
required to submit. The store is still evolving, so treat the portal's on-screen
prompts as the source of truth for anything below.

## Prerequisites (one-time)

- **Public source repo with a license.** The listing asks for a source-code URL, so
  make `aliofye/pebble-neubrutalism` public and confirm the `LICENSE` (MIT) is in
  place.
- **A developer account.** The portal prompts you to create one the first time you
  upload an app.
- **A support email** for the listing.

## 1. Build the release bundle

1. Bump the version in `package.json` — `"version"` must increase on every release
   or the upload is rejected.
   ```bash
   # e.g. 1.0.0 for the first public release
   ```
2. Build:
   ```bash
   pebble build
   ```
3. The bundle is `build/pebble-neubrutalism.pbw`. It contains **all** target platforms
   (`aplite`, `basalt`, `diorite`, `emery`, `flint`), so one file covers the whole
   listing.

> The app **UUID** in `package.json` is your app's permanent identity — never change
> it between releases, or the store treats it as a different app.

## 2. Capture screenshots (per platform)

The listing takes **up to 5 screenshots per platform**, at the watch's native
resolution. The watchface ships for two native resolutions:

| Resolution | Watches |
|---|---|
| 144 × 168 | aplite, basalt, diorite, flint |
| 200 × 228 | emery |

Use `pebble screenshot` on a paired watch or the emulator. You already have current
shots in `screenshot/` (basalt, aplite, emery) — reuse those.

## 3. Create the listing (dev-portal.rebble.io)

1. Log in (create the account if this is your first upload).
2. **Add a Watchface** → enter the title (**Neubrutalism**), the **source-code URL**
   (your GitHub repo), and the **support email**.
3. **Category** — a neubrutalist watchface sits naturally under *Just a Clock* or
   *Everything Else*.
4. **Icons** — upload the large and small app icons the portal asks for. (The portal
   states the exact dimensions at upload.)
5. **Add a release** → upload `build/pebble-neubrutalism.pbw`, add optional release notes,
   then **Publish** the release to make it public.
6. **Asset collection per platform** — for each listed resolution, add: a description,
   up to **5 screenshots**, up to **3 header images**, and a **marketing banner**. The
   portal shows the required pixel sizes on each field.
7. **Publish** — or **Publish Privately** first to preview the live listing before
   it goes public.

That's it — once published it propagates to apps.repebble.com. Listings normally go
live quickly.

## Alternative: the `pebble publish` CLI

Core Devices has announced CLI publishing (`pebble publish`) that can auto-generate
per-platform screenshots/GIFs and upload them. It's newer than the web flow above —
check whether your CLI has it before relying on it:

```bash
pebble publish --help
```

If present, it's the fastest path; if not, use the web portal (Step 3), which is the
documented, stable route. The CI release workflow (`.github/workflows/release.yml`)
ships new versions to the appstore when you publish a GitHub Release.

## Release checklist

- [ ] Repo public + `LICENSE` in place
- [ ] `package.json` version bumped
- [ ] `pebble build` clean; `npm test` green
- [ ] Screenshots ready (144×168 and 200×228)
- [ ] Icons + marketing banner prepared (sizes per portal)
- [ ] `.pbw` uploaded as a release and **published**
- [ ] Per-platform asset collection filled in and published

## Sources

- [Publishing an App — Pebble Developers (Rebble)](https://developer.rebble.io/guides/appstore-publishing/publishing-an-app/)
- [Rebble Developer Portal](https://dev-portal.rebble.io/)
- [(re)Introducing the Pebble Appstore — Eric Migicovsky](https://ericmigi.com/blog/re-introducing-the-pebble-appstore/)
- [Pebble Appstore](https://apps.repebble.com/)