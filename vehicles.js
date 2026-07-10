/**
 * Curated vehicle dataset for the E85 Blend Lab calculator.
 *
 * tank  — fuel tank capacity in US gallons (approximate; always verify
 *         against the owner's manual — capacities vary by trim/drivetrain).
 * ffv   — true when the platform was offered as a factory flex-fuel
 *         vehicle (often only on select engines/trims).
 * years — inclusive [start, end] model-year range for this entry.
 */
const VEHICLES = [
  // ── American muscle & sports ─────────────────────────────────────────
  { make: "Ford", model: "Mustang (S550/S650)", years: [2015, 2026], tank: 16.0, ffv: false },
  { make: "Ford", model: "Mustang (S197)", years: [2005, 2014], tank: 16.0, ffv: false },
  { make: "Chevrolet", model: "Camaro", years: [2016, 2024], tank: 19.0, ffv: false },
  { make: "Chevrolet", model: "Camaro (5th gen)", years: [2010, 2015], tank: 19.0, ffv: false },
  { make: "Chevrolet", model: "Corvette (C8)", years: [2020, 2026], tank: 18.5, ffv: false },
  { make: "Chevrolet", model: "Corvette (C7)", years: [2014, 2019], tank: 18.5, ffv: false },
  { make: "Dodge", model: "Challenger", years: [2008, 2023], tank: 18.5, ffv: false },
  { make: "Dodge", model: "Charger", years: [2011, 2023], tank: 18.5, ffv: false },

  // ── Import / tuner favorites ─────────────────────────────────────────
  { make: "Subaru", model: "WRX", years: [2022, 2026], tank: 16.6, ffv: false },
  { make: "Subaru", model: "WRX / STI", years: [2015, 2021], tank: 15.9, ffv: false },
  { make: "Subaru", model: "WRX / STI (GR/GV)", years: [2008, 2014], tank: 16.9, ffv: false },
  { make: "Subaru", model: "BRZ", years: [2013, 2026], tank: 13.2, ffv: false },
  { make: "Mitsubishi", model: "Lancer Evolution X", years: [2008, 2015], tank: 14.5, ffv: false },
  { make: "Toyota", model: "GR Supra", years: [2020, 2026], tank: 13.7, ffv: false },
  { make: "Toyota", model: "GR86 / 86", years: [2013, 2026], tank: 13.2, ffv: false },
  { make: "Toyota", model: "GR Corolla", years: [2023, 2026], tank: 13.2, ffv: false },
  { make: "Nissan", model: "Z (RZ34)", years: [2023, 2026], tank: 16.4, ffv: false },
  { make: "Nissan", model: "370Z", years: [2009, 2020], tank: 19.0, ffv: false },
  { make: "Nissan", model: "GT-R", years: [2009, 2024], tank: 19.5, ffv: false },
  { make: "Honda", model: "Civic Si", years: [2017, 2026], tank: 12.4, ffv: false },
  { make: "Honda", model: "Civic Type R", years: [2017, 2026], tank: 12.4, ffv: false },
  { make: "Acura", model: "Integra", years: [2023, 2026], tank: 12.4, ffv: false },
  { make: "Mazda", model: "MX-5 Miata (ND)", years: [2016, 2026], tank: 11.9, ffv: false },
  { make: "Mazda", model: "MX-5 Miata (NC)", years: [2006, 2015], tank: 12.7, ffv: false },
  { make: "Hyundai", model: "Veloster N", years: [2019, 2022], tank: 13.2, ffv: false },
  { make: "Hyundai", model: "Elantra N", years: [2022, 2026], tank: 12.4, ffv: false },
  { make: "Kia", model: "Stinger", years: [2018, 2023], tank: 15.9, ffv: false },

  // ── Euro performance ─────────────────────────────────────────────────
  { make: "Volkswagen", model: "Golf GTI (Mk7/Mk8)", years: [2015, 2026], tank: 13.2, ffv: false },
  { make: "Volkswagen", model: "Golf R", years: [2015, 2026], tank: 14.5, ffv: false },
  { make: "BMW", model: "M3 (G80)", years: [2021, 2026], tank: 15.6, ffv: false },
  { make: "BMW", model: "M3 (F80)", years: [2015, 2018], tank: 15.6, ffv: false },
  { make: "BMW", model: "M340i / 340i", years: [2016, 2026], tank: 15.6, ffv: false },
  { make: "Audi", model: "S4 (B9)", years: [2018, 2024], tank: 15.3, ffv: false },
  { make: "Audi", model: "RS3", years: [2017, 2026], tank: 14.5, ffv: false },
  { make: "Porsche", model: "911 (991/992)", years: [2012, 2026], tank: 16.9, ffv: false },

  // ── Hot hatches & compacts ───────────────────────────────────────────
  { make: "Ford", model: "Focus ST", years: [2013, 2018], tank: 12.4, ffv: false },
  { make: "Ford", model: "Focus RS", years: [2016, 2018], tank: 13.9, ffv: false },
  { make: "Ford", model: "Fiesta ST", years: [2014, 2019], tank: 12.4, ffv: false },

  // ── Trucks & SUVs (many factory flex-fuel) ───────────────────────────
  { make: "Ford", model: "F-150", years: [2015, 2023], tank: 23.0, ffv: true },
  { make: "Ford", model: "F-150", years: [2009, 2014], tank: 26.0, ffv: true },
  { make: "Chevrolet", model: "Silverado 1500", years: [2019, 2026], tank: 24.0, ffv: true },
  { make: "Chevrolet", model: "Silverado 1500", years: [2014, 2018], tank: 26.0, ffv: true },
  { make: "GMC", model: "Sierra 1500", years: [2014, 2018], tank: 26.0, ffv: true },
  { make: "Ram", model: "1500", years: [2013, 2018], tank: 26.0, ffv: true },
  { make: "Chevrolet", model: "Tahoe", years: [2015, 2020], tank: 26.0, ffv: true },
  { make: "Jeep", model: "Wrangler (JL)", years: [2018, 2026], tank: 21.5, ffv: false },
  { make: "Toyota", model: "Tacoma", years: [2016, 2023], tank: 21.1, ffv: false },

  // ── Factory flex-fuel sedans ─────────────────────────────────────────
  { make: "Ford", model: "Taurus", years: [2013, 2019], tank: 19.0, ffv: true },
  { make: "Ford", model: "Explorer", years: [2011, 2019], tank: 18.6, ffv: true },
  { make: "Chevrolet", model: "Impala", years: [2012, 2020], tank: 18.5, ffv: true },
  { make: "Chrysler", model: "300", years: [2011, 2023], tank: 18.5, ffv: true },
  { make: "Dodge", model: "Durango", years: [2011, 2023], tank: 24.6, ffv: true },
];
