# HSR Trash Optimizer

## Purpose

HSR Trash Optimizer is a Honkai: Star Rail relic analysis tool built around one main goal:

- take an `HSRScanData_*.json` inventory export
- score relics against a maintained character recommendation database
- generate safe trash-filter steps that never select relics marked as keep

The project is designed so normal users only need to provide their relic export. Maintainers can refresh the bundled character database separately.

## Primary User Flow

For most users, the project should be treated as a single-step tool:

- run [`run-hsr-trash-optimizer.bat`](run-hsr-trash-optimizer.bat)
- select an `HSRScanData_*.json` file if one was not passed in
- wait for scoring and filter generation to complete
- review the generated output files in [`data/`](data/)

Inventory exports used for local testing/examples live under [`relic-jsons/`](relic-jsons/), not in the repo root.

The wrapper is the intended Windows-facing entrypoint. It handles:

- JSON file picking
- basic inventory validation
- launching the CLI
- keeping the console open when launched from Explorer

## Outputs

The tool currently writes these user-facing outputs:

- [`data/relic_valuation.json`](data/relic_valuation.json)
  Scored relic inventory with keep/trash decisions and match metadata.
- [`data/trash_filter_sequence.txt`](data/trash_filter_sequence.txt)
  Human-readable step-by-step trash filter sequence.

## Architecture

### 1. Character Data Collection

Files:

- [`src/scraper/prydwen.ts`](src/scraper/prydwen.ts)
- [`src/scraper/crawler.ts`](src/scraper/crawler.ts)

Responsibilities:

- parse Prydwen character list and guide pages
- extract:
  - recommended relic sets
  - recommended planar sets
  - main-stat priorities
  - substat priorities
- write the maintained character database to [`data/prydwen_data.json`](data/prydwen_data.json)

Important behavior:

- crawler refresh is atomic
- incomplete crawls do not destroy the last good DB
- semantically incomplete character guides are rejected instead of silently accepted

### 2. Stat Normalization and Scoring

Files:

- [`src/analysis/mapping.ts`](src/analysis/mapping.ts)
- [`src/analysis/scorer.ts`](src/analysis/scorer.ts)
- [`src/analysis/process_inventory.ts`](src/analysis/process_inventory.ts)

Responsibilities:

- normalize guide stats and inventory stats into comparable canonical forms
- distinguish fixed-slot flat mains from variable-slot percentage mains
- score each relic against the maintained character DB
- mark relics as keep or trash under the current policy

Important behavior:

- guide `ATK/HP/DEF` on variable slots are interpreted as `ATK%/HP%/DEF%`
- fixed-slot mains remain flat
- elemental sphere recommendations are normalized into a shared elemental family
- substring-based stat matching has been removed in favor of exact canonical matching

### 3. Trash Filter Optimization

Files:

- [`src/solver/filter_optimizer.ts`](src/solver/filter_optimizer.ts)
- [`src/solver/generate_filters.ts`](src/solver/generate_filters.ts)
- [`src/solver/trap_detector.ts`](src/solver/trap_detector.ts)

Responsibilities:

- search for safe trash-filter candidates
- sequence the best filters into step-by-step instructions
- protect against unsafe or overly narrow character stat profiles

Important behavior:

- generated filters are checked against scored keeps
- safe filters must select zero keep relics
- trap analysis shares the same normalization/exclusion rules as the scorer

## Public Interfaces

### Windows Wrapper

- [`run-hsr-trash-optimizer.bat`](run-hsr-trash-optimizer.bat)
- [`run-hsr-trash-optimizer.ps1`](run-hsr-trash-optimizer.ps1)

This is the preferred interface for end users.

### CLI

File:

- [`src/cli.ts`](src/cli.ts)

Supported commands:

- `optimize --inventory <file>`
- `score --inventory <file>`
- `solve --inventory <file>`
- `validate --inventory <file>`
- `crawl`

Intended usage split:

- `optimize` is the main user path
- `score`, `validate`, and `crawl` are primarily maintenance/dev paths

## Validation and Testing

### Regression Tests

- `npm test`

Coverage includes:

- scraper fixtures
- scorer behavior
- normalization rules
- filter optimization behavior
- trap detection
- CLI dispatch
- crawler atomicity

### Release Validation

Files:

- [`src/validate_pipeline.ts`](src/validate_pipeline.ts)
- [`src/release_validation.ts`](src/release_validation.ts)

Purpose:

- validate the project without relying on `ts-jest` in the Windows wrapper path
- run compiled release checks
- verify build, DB sanity, inventory processing, and safe filter generation

### Fixtures and Reference Inputs

- live scraper fixtures under [`src/scraper/fixtures/`](src/scraper/fixtures/)
- real inventory export example:
  [`relic-jsons/HSRScanData_20260305_080215.json`](relic-jsons/HSRScanData_20260305_080215.json)

## Suggested Documentation Split

- [`PROJECT.md`](PROJECT.md)
  Canonical high-level project overview.
- [`docs/GEMINI.md`](docs/GEMINI.md)
  Working notes, historical context, and ad hoc maintainer details.

## Maintenance Notes

If the project continues to be maintained, the normal maintainer loop is:

1. refresh the Prydwen character DB when needed
2. run validation
3. publish updated code and bundled data

Normal users should not need to crawl or rebuild the DB themselves unless maintenance stops.
