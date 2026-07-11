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
- Zero dependencies, zero build step — pure HTML/CSS/JS. Works offline.

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

Deploys as-is to GitHub Pages, Netlify, or any static host.

## Tests

Blend-math unit tests run in plain Node:

```sh
node test/calc.test.js
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

- OBD-II ethanol readout via Web Bluetooth (flex-fuel vehicles, PID 0x52)
- Liters/metric mode

---

*Estimates only. Always verify tank capacity, fuel-system compatibility, and
actual ethanol content before running high blends.*
