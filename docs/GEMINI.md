# HSR Trash Optimizer

A tool to extract character build meta-data from Prydwen and use it to identify "trash" equipment in Honkai: Star Rail inventory exports.

## Project Metadata (As of March 3rd, 2026)
- **Input File:** `relic-jsons/HSRScanData_20260303_192906.json`
- **Total Relics:** 2,909
- **Keep Count (5-star):** 918
- **Trash Count (5-star):** 1,978
- **Character DB:** 83 characters from Prydwen.

---

## Core Architecture
1. **Scraper & Crawler:** Automates data collection with fallback selectors and parse validation.
2. **Valuation Engine:** Scores relics with tiered substat weighting and dynamic safety thresholds.
3. **Filter Optimizer:** Centralized matching logic for iterative, safe filter generation.

## Safety & Logic
- **Verified Accuracy:** All generated filters are cross-validated by a matching engine to ensure 0 "Keep" items are selected.
- **Critical Thresholds:** 1.0 threshold for SPD Boots, ER/BE Ropes, and Crit Bodies.
- **Trap Protection:** Dynamically lowers thresholds for characters with narrow stat priorities.
- **Canonical Normalization:** Ensures "Energy Regen" and "Elemental DMG" are matched consistently across all modules.

---

## Execution Pipeline
1. `npm run build`: Compile source code.
2. `npm run crawl`: Refresh character metadata (Throttled 10/min).
3. `node dist/analysis/process_inventory.js`: Score the latest inventory data.
4. `node dist/solver/generate_filters.js`: Create the step-by-step trashing instructions.
5. `npx ts-node src/validate_pipeline.ts`: Run the full end-to-end validation suite.

## Testing
- `npm test`: Runs regression tests for Scraper, Scorer, and Optimizer.
- **Scraper Tests:** Assert exact extraction against HTML fixtures.
- **Solver Tests:** Verify safety guarantees and normalization logic.

## CLI
- `npm run cli -- score --inventory <path>`
- `npm run cli -- solve --inventory <path> --steps 10`
- `npm run cli -- validate --inventory <path>`
- `npm run cli -- crawl`
- Windows wrapper:
  - `run-hsr-trash-optimizer.bat`
  - `run-hsr-trash-optimizer.ps1`

---

## Recommended Action Sequence (Historical Example)
1. **Link Ropes (HP/DEF):** Targets 7 defensive sets.
2. **Variable Slots (HP/DEF):** Targets 11 specific sets.
3. **Planar Spheres (DEF):** Targets 10 sets.
*(Run `generate_filters.js` for the current most efficient steps.)*
