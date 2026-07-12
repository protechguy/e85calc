# 🚘 E85 Blend Lab

**Live site: <https://protechguy.github.io/e85calc/>**

A sleek, street-car-styled **E85 blend calculator** — retro California neon
aesthetic with glassy panels, magenta/teal neon, and warm sunset accents.
Tell it your tank size, how much fuel is in
the tank, what pump gas you're mixing with, and your target ethanol blend — it
tells you exactly how many gallons of E85 and pump gas to add.

## Features

- **Blend math that handles the real world** — accounts for the fuel already in
  your tank (and its ethanol content), seasonal E85 variation (E51–E83 at the
  pump), and E0/E10/E15/custom pump gas.
- **Live gauge & mix bar** — see your resulting blend and tank composition
  update as you drag the sliders.
- **Vehicle picker (optional)** — select year/make/model to auto-fill your tank
  size from a curated dataset of popular platforms, with a badge showing
  whether the platform was offered as a **factory flex-fuel vehicle** or will
  likely need mods (full compatibility lookup planned for phase 2).
- **Honest clamping** — if your target is unreachable (tank already too rich or
  too full of pump gas), it tells you and shows the best blend you *can* reach.
  Swapped or nonsense fuel inputs get called out instead of silently computed.
- **Built for the pump** — installable PWA that works offline, remembers your
  last setup, and shows a sticky live-result bar on phones so you can watch the
  blend change while you drag sliders.
- **Read from car** — on flex-fuel vehicles, one tap reads the ECU's
  live ethanol % (OBD-II PID 0x52) and fuel level (PID 0x2F) and fills the
  calculator. Two transports, Chrome/Edge only (iOS has neither API):
  - **Web Bluetooth** — Bluetooth LE adapters (Veepeak BLE, vLinker MC+,
    OBDLink CX…); Android + desktop.
  - **Web Serial** — Bluetooth *Classic* adapters (OBDLink MX+, most cheap
    ELM327s): pair in the OS first, then pick the COM port; also USB cables.
    Desktop only.
- **Worth It? page** (`costs.html`) — enter local prices and your MPG to get
  cost per mile for any blend, plus the one number that settles it: the
  break-even E85 price. Below it, every blend saves money per mile (blending
  is linear in both price and energy, so one threshold covers all targets).
- Zero dependencies, zero build step — pure HTML/CSS/JS.

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

Deploys as-is to GitHub Pages, Netlify, or any static host.

## Tests

Blend-math and OBD-parsing unit tests run in plain Node:

```sh
node test/calc.test.js
node test/compat.test.js
node test/obd.test.js
```

## How the math works

Given a tank of size `T` with `v` gallons at ethanol fraction `e₀`, filling the
remaining space with `x` gallons of E85 (fraction `e₁`) and `y` gallons of pump
gas (fraction `e₂`) to hit target `t`:

```
x + y = T − v
(v·e₀ + x·e₁ + y·e₂) / T = t
⇒ x = (T·t − v·e₀ − (T−v)·e₂) / (e₁ − e₂)
```

Results are clamped to what's physically possible and the achieved blend is
reported.

## Compatibility lookup ("Can it run E85?")

The compatibility panel checks whether a vehicle was offered as a **factory
flex-fuel vehicle**, engine variant by engine variant, using the free
[EPA fueleconomy.gov web services](https://www.fueleconomy.gov/feg/ws/)
(every US-market vehicle since 1984, no API key). Verdicts:

- **Factory flex-fuel** — every version of the model is E85-ready
- **Flex-fuel on some engines** — per-engine badges show which
- **Not factory E85** — with guidance on the typical modifications
  (ethanol-calibrated tune or flex-fuel kit, higher-flow injectors,
  E85-rated pump, compatible lines/seals)

If the EPA service is unreachable, the panel falls back to the built-in
curated dataset and says so.

## Roadmap

- ~~OBD-II ethanol readout via Web Bluetooth (flex-fuel vehicles, PID 0x52)~~
  — shipped, see "Read from car" above
- ~~Cost-per-fill / cost-per-mile estimator~~ — shipped, see "Worth It?" above
- Liters/metric mode

---

*Estimates only. Always verify tank capacity, fuel-system compatibility, and
actual ethanol content before running high blends.*
