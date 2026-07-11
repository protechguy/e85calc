/* ═══════════════════════════════════════════════════════════════════════
   CAN IT RUN E85? — factory flex-fuel compatibility lookup (phase 2)

   Primary source: EPA fueleconomy.gov vehicle web services (free, no key).
   Every US-market vehicle since 1984, engine variant by engine variant.
   Falls back to the curated VEHICLES dataset when the API is unreachable.
   ═══════════════════════════════════════════════════════════════════════ */

const EPA_BASE = "https://www.fueleconomy.gov/ws/rest/vehicle";

/**
 * A vehicle record is factory flex-fuel when the EPA marks it as an FFV
 * or lists E85 as an accepted fuel (fuelType "Gasoline or E85" /
 * fuelType2 "E85").
 */
function isFlexFuelRecord(rec) {
  const hay = `${rec.atvType || ""} | ${rec.fuelType || ""} | ${rec.fuelType2 || ""}`;
  return /FFV|E85/i.test(hay);
}

/** Summarize per-variant results: "all" | "some" | "none". */
function summarizeVariants(variants) {
  const n = variants.filter((v) => v.ffv).length;
  return n === 0 ? "none" : n === variants.length ? "all" : "some";
}

/* EPA's XML→JSON conversion returns a bare object instead of an array
   when a menu has a single item. */
const asArray = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

/**
 * Match an EPA model name (e.g. "F150 Pickup 2WD FFV") against the curated
 * tank-size dataset (e.g. "F-150"). Names are normalized to alphanumerics
 * and matched by containment either way; the longest overlap wins, and
 * anything shorter than 3 characters is rejected as too ambiguous.
 * `vehicles` is the curated dataset (VEHICLES in the browser).
 */
function findTankMatch(vehicles, year, make, modelName) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const y = +year;
  const target = norm(modelName);
  if (!target) return null;

  let best = null;
  let bestScore = 0;
  for (const v of vehicles) {
    if (norm(v.make) !== norm(make) || y < v.years[0] || y > v.years[1]) continue;
    const key = norm(v.model.replace(/\(.*?\)/g, ""));
    if (!key) continue;
    const score = target.includes(key) ? key.length
      : key.includes(target) ? target.length
      : 0;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return bestScore >= 3 ? best : null;
}

async function epaJson(path) {
  const res = await fetch(`${EPA_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`EPA API ${res.status}`);
  return res.json();
}

async function epaMenu(path) {
  const data = await epaJson(path);
  return asArray(data && data.menuItem);
}

/* ── UI ───────────────────────────────────────────────────────────────── */
(function () {
  if (typeof module !== "undefined") {
    module.exports = { isFlexFuelRecord, summarizeVariants, findTankMatch };
    return;
  }

  const el = {};
  let usingFallback = false;

  const MODS_HTML = `
    <h3>Running E85 without factory support</h3>
    <p>Non-flex-fuel engines can usually be converted, but plan on:</p>
    <ul>
      <li><strong>A tune calibrated for ethanol</strong> — or a flex-fuel kit
          with an ethanol-content sensor so the ECU adapts to any blend.</li>
      <li><strong>Higher-flow fuel injectors</strong> — E85 needs roughly
          30–40% more fuel volume than gasoline.</li>
      <li><strong>An E85-rated fuel pump</strong> — stock pumps often run out
          of headroom at high blends.</li>
      <li><strong>Ethanol-compatible lines &amp; seals</strong> — mainly a
          concern on older vehicles; modern fuel systems generally tolerate
          ethanol.</li>
    </ul>
    <p class="compat-fineprint">Work with a tuner familiar with your platform.
       Start with lower blends (E30–E50) and verify fueling headroom before
       running full E85.</p>`;

  function setStatus(msg, cls) {
    el.status.className = `compat-status ${cls || ""}`;
    el.status.textContent = msg || "";
    el.status.hidden = !msg;
  }

  function clearResults() {
    el.verdict.hidden = true;
    el.variants.hidden = true;
    el.variants.innerHTML = "";
    el.mods.hidden = true;
    el.tank.hidden = true;
    el.tank.innerHTML = "";
  }

  function resetSelect(sel, placeholder) {
    sel.length = 0;
    sel.add(new Option(placeholder, ""));
    sel.disabled = true;
  }

  function fill(sel, items) {
    items.forEach(({ text, value }) => sel.add(new Option(text, value)));
    sel.disabled = false;
  }

  /* ── Fallback: curated dataset ─────────────────────────────────────── */
  function fallbackYears() {
    const years = new Set();
    VEHICLES.forEach((v) => {
      for (let y = v.years[0]; y <= v.years[1]; y++) years.add(y);
    });
    return [...years].sort((a, b) => b - a).map((y) => ({ text: y, value: y }));
  }

  const fallbackForYear = (y) =>
    VEHICLES.filter((v) => y >= v.years[0] && y <= v.years[1]);

  function fallbackMakes(year) {
    return [...new Set(fallbackForYear(+year).map((v) => v.make))]
      .sort()
      .map((m) => ({ text: m, value: m }));
  }

  function fallbackModels(year, make) {
    return fallbackForYear(+year)
      .filter((v) => v.make === make)
      .sort((a, b) => a.model.localeCompare(b.model))
      .map((v) => ({ text: v.model, value: v.model }));
  }

  /* ── Menu loading (EPA first, curated on failure) ──────────────────── */
  async function loadYears() {
    resetSelect(el.make, "Make");
    resetSelect(el.model, "Model");
    try {
      const items = await epaMenu("/menu/year");
      fill(el.year, items);
      setStatus("");
    } catch {
      usingFallback = true;
      fill(el.year, fallbackYears());
      setStatus(
        "Live EPA lookup unavailable — using the built-in dataset of popular platforms instead.",
        "warn"
      );
    }
  }

  async function loadMakes() {
    resetSelect(el.make, "Make");
    resetSelect(el.model, "Model");
    clearResults();
    if (!el.year.value) return;
    if (usingFallback) return fill(el.make, fallbackMakes(el.year.value));
    setStatus("Loading makes…", "busy");
    try {
      fill(el.make, await epaMenu(`/menu/make?year=${el.year.value}`));
      setStatus("");
    } catch {
      setStatus("Couldn't reach the EPA service. Try again in a moment.", "warn");
    }
  }

  async function loadModels() {
    resetSelect(el.model, "Model");
    clearResults();
    if (!el.make.value) return;
    if (usingFallback)
      return fill(el.model, fallbackModels(el.year.value, el.make.value));
    setStatus("Loading models…", "busy");
    try {
      const q = `year=${el.year.value}&make=${encodeURIComponent(el.make.value)}`;
      fill(el.model, await epaMenu(`/menu/model?${q}`));
      setStatus("");
    } catch {
      setStatus("Couldn't reach the EPA service. Try again in a moment.", "warn");
    }
  }

  /* ── Verdict ───────────────────────────────────────────────────────── */
  async function checkVehicle() {
    clearResults();
    if (!el.model.value) return;

    if (usingFallback) {
      const v = fallbackForYear(+el.year.value).find(
        (x) => x.make === el.make.value && x.model === el.model.value
      );
      renderVerdict(v && v.ffv ? "all" : "none", []);
      setStatus(
        "Verdict from the built-in dataset — engine-by-engine detail needs the live EPA lookup.",
        "warn"
      );
      return;
    }

    setStatus("Checking engine variants…", "busy");
    try {
      const q = `year=${el.year.value}&make=${encodeURIComponent(el.make.value)}&model=${encodeURIComponent(el.model.value)}`;
      const options = await epaMenu(`/menu/options?${q}`);
      const variants = await Promise.all(
        options.map(async ({ text, value }) => {
          const rec = await epaJson(`/${value}`);
          return { name: text, ffv: isFlexFuelRecord(rec) };
        })
      );
      setStatus("");
      renderVerdict(summarizeVariants(variants), variants);
    } catch {
      setStatus("Couldn't reach the EPA service. Try again in a moment.", "warn");
    }
  }

  const VERDICTS = {
    all: {
      cls: "good",
      title: "⚡ Factory flex-fuel",
      body: "Every version of this model came E85-ready from the factory. Fill up and go — no mods needed.",
    },
    some: {
      cls: "mixed",
      title: "⚡ Flex-fuel on some engines",
      body: "This model was offered both ways — check your engine below (a yellow fuel cap or door sticker usually confirms flex-fuel).",
    },
    none: {
      cls: "bad",
      title: "🔧 Not factory E85",
      body: "No version of this model shipped flex-fuel. Running high ethanol blends means modifications:",
    },
  };

  function renderVerdict(summary, variants) {
    const v = VERDICTS[summary];
    el.verdict.className = `compat-verdict ${v.cls}`;
    el.verdict.innerHTML = `<strong>${v.title}</strong><span>${v.body}</span>`;
    el.verdict.hidden = false;

    if (variants.length) {
      el.variants.innerHTML = variants
        .map(
          ({ name, ffv }) => `
        <li class="variant ${ffv ? "is-ffv" : ""}">
          <span class="variant-name">${name}</span>
          <span class="badge ${ffv ? "badge-ffv" : "badge-mod"}">${ffv ? "⚡ FLEX-FUEL" : "🔧 MODS NEEDED"}</span>
        </li>`
        )
        .join("");
      el.variants.hidden = false;
    }

    if (summary !== "all") {
      el.mods.innerHTML = MODS_HTML;
      el.mods.hidden = false;
    }

    renderTankOffer();
  }

  /* Offer to drop the matched tank size into the calculator's Setup panel. */
  function renderTankOffer() {
    const match = findTankMatch(VEHICLES, el.year.value, el.make.value, el.model.value);
    if (!match) return;
    el.tank.innerHTML =
      `<span>Tank ≈ <strong>${match.tank.toFixed(1)} gal</strong> on this platform
        (approximate — varies by trim).</span>
       <button type="button" id="compat-tank-btn" class="btn-neon">USE IN CALCULATOR</button>`;
    el.tank.hidden = false;
    document.getElementById("compat-tank-btn").addEventListener("click", () => {
      const tankInput = document.getElementById("tank-size");
      tankInput.value = match.tank;
      tankInput.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector(".panel-inputs").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function initCompat() {
    ["year", "make", "model", "status", "verdict", "variants", "mods", "tank"].forEach(
      (k) => (el[k] = document.getElementById(`compat-${k}`))
    );
    el.year.addEventListener("change", loadMakes);
    el.make.addEventListener("change", loadModels);
    el.model.addEventListener("change", checkVehicle);
    loadYears();
  }

  document.addEventListener("DOMContentLoaded", initCompat);
})();
