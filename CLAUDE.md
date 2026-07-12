# E85 Blend Lab — Exit Interview / Handoff

*Written by the outgoing senior dev on their last day (2026-07-11, the day
everything in this repo shipped). If you're reading this, you're the new me.
Everything below is the stuff I'd tell you over coffee before walking out.*

---

## What this project is

A zero-dependency, zero-build static site at **https://e85calc.com** — an E85
ethanol blend calculator for street-car people, plus a cost-per-mile
"worth it?" page, nine SEO guide articles, and a Web Bluetooth/Serial OBD-II
readout that no competitor has. Pure HTML/CSS/JS. It's also an installable
PWA that works offline at the pump. The owner (Kyle, GitHub `protechguy`)
monetizes via Amazon affiliate links.

**The philosophy is the architecture:** no build step, no framework, no npm
in production. Every time you're tempted to add a dependency, don't. The
whole site is ~15 files a person can read in an afternoon, and that's why
it's fast, secure, and maintainable. Keep it that way.

---

## The layout, 60 seconds

- `index.html` + `app.js` — the blend calculator. `calcBlend()` at the top of
  app.js is the heart; it's pure and unit-tested.
- `costs.html` + `costs.js` — cost-per-mile & break-even math. Also pure +
  tested.
- `compat.js` — "Can it run E85?" EPA lookup. Used on index.html AND on
  can-my-car-run-e85.html (guide page). It adapts: if `#tank-size` exists it
  fills it; otherwise it renders a deep link `./?tank=N`.
- `obd.js` — OBD-II read-from-car. Two transports, one ELM327 engine.
- `vehicles.js` — curated tank-size dataset (global `VEHICLES`).
- `sw.js` — service worker. **Read the war stories below before touching it.**
- 9 guide articles + `guides.html` index + `about.html` + `privacy.html` +
  `404.html` — content pages sharing one hand-copied chrome (header/nav/footer).
- `test/*.test.js` — four suites, plain Node, no test framework:
  `node test/calc.test.js` etc. Run all four before any commit.

**Classic-script gotcha you must know:** there's no module system. Scripts
share the global scope via `<script>` order. `ICONS` is defined in app.js and
used by compat.js — that only works because app.js loads first. Every JS file
has the same Node-export guard at its boundary
(`if (typeof module !== "undefined")`) so the pure functions are testable.
app.js's `init()` bails early (`if (!els.tank) return`) on pages that load it
only for the shared globals.

---

## War stories (the bugs that will bite you again if you forget them)

### 1. The `[hidden]` attribute loses to CSS display
`display: flex` in a class overrides the UA's `[hidden] { display: none }`.
We shipped ghost boxes because of this. The fix lives at the top of
styles.css: `[hidden] { display: none !important; }`. Don't remove it.

### 2. The service worker staleness saga (three rounds)
- **Round 1:** stale-while-revalidate served every visitor a one-deploy-old
  site forever. Fixed by going network-first.
- **Round 2:** network-first still served week-old CSS, because `fetch()`
  inside a SW **honors the browser HTTP cache**, and the CDN's default
  `max-age` on assets was 7 days. The owner's phone rendered the guides page
  as plain text.
- **The permanent fix:** every same-origin fetch in sw.js uses
  `new Request(request, { cache: "no-cache" })`, including the precache
  `addAll`. This forces origin revalidation (cheap ETag 304s). If you ever
  rewrite sw.js, keep the no-cache semantics or you will re-live all of this.
- **Bump `CACHE = "e85calc-vN"` on every release.** It's v9 as I leave.

### 3. The CDN caches; you must purge
Hostinger's CDN (hcdn) caches assets at the edge. The deploy ritual (below)
ends with a cache purge — it is not optional. `.htaccess` now sets sane
lifetimes (HTML `no-cache`, CSS/JS 10 min, fonts 1 yr immutable) but edges
that cached before a deploy still need the purge.

### 4. OBDLink MX+ is Bluetooth *Classic*
Web Bluetooth only sees BLE. The owner's MX+ was invisible to the chooser —
by physics, not by bug. That's why obd.js has TWO transports: Web Bluetooth
(BLE adapters: Veepeak BLE, vLinker MC+, OBDLink CX) and Web Serial (classic
BT pairings via COM port, desktop only). Both feed one `makeTurnEngine`.
**Hardware validation status:** MX+ over serial confirmed working on a real
truck — fuel level (PID 0x2F) read correctly; ethanol (0x52) was absent
because the truck isn't flex-fuel, and the graceful-degradation message
fired as designed. The BLE path and a real ethanol reading from a true FFV
are still field-unverified.

### 5. EPA API quirks (fueleconomy.gov)
- Menus with a single item return a bare object, not an array — `asArray()`
  in compat.js exists for this. 
- FFV vehicles are often listed as *separate model names* ("F150 Pickup 2WD
  FFV" vs "F150 Pickup 2WD"). A user picking the non-FFV entry gets "Not
  factory E85" even though an FFV sibling exists in the same dropdown. Known
  presentation quirk, not a bug; a future improvement is merging siblings.
- No API key, no auth. Requests go straight from the visitor's browser
  (privacy page says so).

### 6. The strict CSP will eat your inline code
`.htaccess` ships `script-src 'self'; style-src 'self'` — **no inline styles
or executable inline scripts anywhere**. JSON-LD `<script type=
"application/ld+json">` blocks are fine (not executable). Setting styles from
JS via `el.style.x` is fine (CSSOM). A `style=""` attribute in markup will
silently break. `connect-src` allowlists `https://www.fueleconomy.gov` —
add origins there if you ever call something new.

### 7. Windows dev-machine quirks
- `python`/`python3` are broken Microsoft Store stubs. Real interpreter:
  `C:\Users\kyle\AppData\Local\Programs\Python\Python312\python.exe`.
  Local server: that binary + `-m http.server 8123 --directory <repo>`.
- Console is cp1252 — set `PYTHONIOENCODING=utf-8` for unicode output.
- Git warns LF→CRLF on every commit. Harmless noise; ignore it.
- PowerShell here is 5.1 — no `&&`, no ternary.

### 8. Icons and the og-image are generated, not drawn
`icon.svg` is the hand-written master (neon corn cob). The PNG set
(apple-touch-icon, 192/512, maskable) and `og-image.png` are rendered from it
with `@resvg/resvg-js` in a scratchpad script (see `make-icons.js` /
`make-og.js` pattern: npm-install resvg-js somewhere temporary, never in the
repo). The og card needs `Righteous-Regular.ttf` downloaded from the
google/fonts GitHub repo and passed via resvg's `font.fontFiles` — the font
is NOT a system font. If you change the cob, regenerate all of them.

---

## The deploy ritual (do not improvise)

GitHub is source of truth; Hostinger serves production. GitHub Pages still
mirrors the site (protechguy.github.io/e85calc) with canonicals pointing at
e85calc.com — leave it; it deploys itself via Actions on push to main.

1. Work on `alpha`, PR to `main`, owner approves the merge. (Two batches went
   straight to main under owner instruction; the discipline is alpha-first.)
2. Run all four test suites. If content/UI changed, verify in a real browser.
3. **Bump `CACHE` version in sw.js.**
4. Zip the top-level files: every site file **including `.htaccess`**,
   excluding `.git*`, `README.md`, `CLAUDE.md`, `test/`.
5. `hosting_deployStaticWebsite` (Hostinger MCP) → domain `e85calc.com`.
6. **`hosting_clearWebsiteCacheV1`** — resolve the username via
   `hosting_listWebsitesV1` if you don't have it.
7. Verify live: load the site, check the changed thing, check the console,
   and `curl -I` anything cache-sensitive.

## Accounts & wiring

- **Domain:** e85calc.com, registered via Hostinger (renews ~$20/yr).
  DNS at Hostinger; `www` CNAMEs to the CDN and 301s to apex via .htaccess.
- **Hosting:** addon site on the owner's Hostinger Business plan (same plan
  as dosecompass.com). All managed through the Hostinger MCP tools.
- **Search Console:** verified via DNS TXT record (`@` TXT
  `google-site-verification=...`). Sitemap submitted. Resubmit
  `sitemap.xml` after adding pages, and add new pages to it with `lastmod`.
- **Affiliate:** Amazon Associates tag `dosecomp-20` on all links
  (`rel="sponsored noopener"`). The owner may create a dedicated tag
  (e.g. `e85calc-20`) — if so, it's a find-replace across the HTML.
  Footer disclosure is a legal requirement; never remove it.

## Content conventions (if you add a guide)

Copy an existing article wholesale — the chrome is hand-duplicated on
purpose (no build step, remember). Checklist: `<title>` ≤60 chars with
`| E85 Blend Lab` suffix; meta description 120–160 chars; canonical + og:url
absolute; article title is the `h1` (`h1.panel-title`), logo becomes
`<span class="logo-text">`; JSON-LD `@graph` = BreadcrumbList + Article (+
FAQPage whose questions match visible FAQ text); GUIDES nav tab
`is-current`; add to guides.html card list AND sitemap.xml (with lastmod)
AND the ItemList JSON-LD in guides.html; CTAs deep-link the calculator with
`?target=N` / `?tank=N`; affiliate links only where genuinely useful.

## The math, so you don't rederive it

- **Blend:** `x = (total·t − v·e₀ − add·e₂)/(e₁ − e₂)` — see calcBlend
  docstring. Clamps to physical reality and reports honest statuses
  (`target_above`, `bad_mix` when pump ethanol ≥ E85 ethanol, etc.).
- **Break-even:** because price and energy both mix linearly, the E85 price
  where a blend matches pump gas per-mile is **independent of the target
  blend**: `P_be = P_pump × EF(e85)/EF(pump)` where `EF(e) = 1 − 0.33e`.
  There's a unit test asserting this invariant across E20–E85. It's the
  site's best insight — the costs page headline depends on it.
- Ethanol energy penalty is 0.33 (76,100 vs 114,100 BTU/gal). MPG is modeled
  proportional to energy; honest caveat text about tuned engines is on the
  page — keep the honesty, it's the brand.

## Parked roadmap (in priority order, my opinion)

1. **Phase 3: programmatic FFV vehicle pages** — pre-generate static pages
   from EPA data ("is a 2015 Silverado flex fuel?") with a script that
   writes HTML files (still zero *runtime* build). The long-tail SEO moat.
2. **Liters/metric mode** — last original roadmap item.
3. **BLE + true-FFV field test** of the OBD feature (needs a flex-fuel car).
4. GoatCounter analytics if the owner ever wants visit data (privacy page
   must be updated if so).
5. Asset-version query strings (`styles.css?v=N`) only if cache staleness
   ever resurfaces despite the SW fix.

## What I'd tell you at the door

The site's superpower is that it's *honest* — the calculator clamps instead
of lying, the cost page admits when E85 loses, the privacy page is true, and
the guides say "forum lore" out loud. Keep every new feature in that voice.
And run the tests; they take two seconds and they've caught real math
regressions twice.

It's been a good run. The corn is in your hands now. 🌽
