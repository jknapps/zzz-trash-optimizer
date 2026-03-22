# ZZZ Trash Optimizer

ZZZ Trash Optimizer analyzes a Zenless Zone Zero disc export from AdeptiScanner_ZZZ, scores each disc against a bundled character recommendation database, and generates a safe in-game trash filter sequence.

The main goal is simple:

- take a `*.ZOD.json` file from AdeptiScanner_ZZZ
- decide which discs are worth keeping
- generate filter steps that only target discs marked as trash for discarding

## What It Produces

The tool provides two main outputs, both saved to [`data/`](data/) for later viewing:

- [`data/disc_valuation.json`](data/disc_valuation.json)
  - scored disc inventory with keep/trash decisions
- [`data/trash_filter_sequence.txt`](data/trash_filter_sequence.txt)
  - step-by-step trash filter instructions for the in-game disc filter UI

## How To Use

Run [`run-zzz-trash-optimizer.bat`](run-zzz-trash-optimizer.bat).

You can use it in two ways:

1. Double-click the batch file.
   It will prompt you to select a `*.ZOD.json` file from AdeptiScanner_ZZZ.
2. Pass a JSON file path directly.

Examples:

```bat
run-zzz-trash-optimizer.bat "D:\path\to\export2026-03-21 22-33-01.ZOD.json"
```

```powershell
.\run-zzz-trash-optimizer.ps1 -InventoryPath "D:\path\to\export2026-03-21 22-33-01.ZOD.json"
```

[`disc-jsons/`](disc-jsons/) is the local folder used for example and test inventory exports.

## Input Requirements

This project expects an AdeptiScanner_ZZZ JSON export with a top-level `discs` array.

## How Discs Are Scored

The bundled character database is built from Prydwen guides.

At a high level, the scorer:

- checks whether the disc's set matches one of the recommended disc sets for a character
- checks whether the disc's main stat matches that character's recommended stats for the slot
- scores matching substats against the guide's substat priorities

Substat scoring is weighted:

- top-priority substats are worth `1.0`
- lower-priority substats are worth `0.5`

By default, a disc needs at least `2.0` score for a character to be kept.

That usually means combinations like:

- `2` top-priority substats
- `1` top-priority substat plus `2` lower-priority substats
- `4` lower-priority substats

There are also extra safety rules for tighter builds, including cases where a recommended substat cannot appear because it is already the main stat. In conservative mode, those cases can lower the keep threshold to `1.0` instead of `2.0`.

If a disc clears the policy threshold for at least one character, it is marked as keep. Otherwise it is treated as trash.

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
- Forked from [EnderSyth/hsr-trash-optimizer](https://github.com/EnderSyth/hsr-trash-optimizer).
