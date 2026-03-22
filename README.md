# HSR Trash Optimizer

HSR Trash Optimizer analyzes a Honkai: Star Rail relic export from HSR-Scanner, scores each relic against a bundled character recommendation database, and generates a safe in-game trash filter sequence.

The main goal is simple:

- take an `HSRScanData_*.json` file
- decide which relics are worth keeping
- generate filter steps that only target relics marked as trash for salvaging

## What It Produces

The tool provides two main outputs, both saved to [`data/`](data/) for later viewing:

- [`data/relic_valuation.json`](data/relic_valuation.json)
  - scored relic inventory with keep/trash decisions
- [`data/trash_filter_sequence.txt`](data/trash_filter_sequence.txt)
  - step-by-step trash filter instructions for the in-game relic filter UI

## How To Use

Run [`run-hsr-trash-optimizer.bat`](run-hsr-trash-optimizer.bat).

You can use it in two ways:

1. Double-click the batch file.
   It will prompt you to select an `HSRScanData_*.json` file.
2. Pass a JSON file path directly.

Examples:

```bat
run-hsr-trash-optimizer.bat "D:\path\to\HSRScanData_20260306_123845.json"
```

```powershell
.\run-hsr-trash-optimizer.ps1 -InventoryPath "D:\path\to\HSRScanData_20260306_123845.json"
```

[`relic-jsons/`](relic-jsons/) is the local folder used for example and test inventory exports.

## Input Requirements

This project expects an HSR-Scanner JSON export with a top-level `relics` array.

Current compatibility notes:

- supports active `substats`
- supports `unactivated_substats` from newer HSR-Scanner exports

## How Relics Are Scored

The bundled character database is built from Prydwen guides.

At a high level, the scorer:

- checks whether the relic's set matches one of the tracked recommended relic or planar sets for a character
- checks whether the relic's main stat matches that character's recommended stats for the slot
- scores matching substats against the guide's substat priorities

Substat scoring is weighted:

- top-priority substats are worth `1.0`
- lower-priority substats are worth `0.5`

By default, a relic needs at least `2.0` score for a character to be kept.

That usually means combinations like:

- `2` top-priority substats
- `1` top-priority substat plus `2` lower-priority substats
- `4` lower-priority substats

There are also extra safety rules for tighter builds, including cases where a recommended substat cannot appear because it is already the main stat. In conservative mode, those cases can lower the keep threshold to `1.0` instead of `2.0`. This matters for builds such as Break Effect rope setups on sets like Iron Cavalry, where the normal threshold would otherwise be too strict and could incorrectly trash viable relics.

If a relic clears the policy threshold for at least one character, it is marked as keep. Otherwise it is treated as trash.

## CLI

If you want to run the tool manually instead of using the batch file, the main command is:

```bash
node dist/cli.js
```

Available commands:

```text
optimize --inventory <file> [--policy conservative|strict] [--steps <n>] [--exhaustive] [--output <file>]
score    --inventory <file> [--policy conservative|strict] [--output <file>]
solve    --inventory <file> [--policy conservative|strict] [--steps <n>] [--exhaustive] [--output <file>]
validate --inventory <file>
crawl
```

## Notes

- The repo currently includes a bundled Windows `node.exe` under [`tools/node/`](tools/node/), so the Windows wrapper can run without requiring a separate Node install.
- [`PROJECT.md`](PROJECT.md) contains additional details.
