import * as path from 'path';
import { processInventory, resolveInventoryFile } from './analysis/process_inventory';
import { runCrawler } from './scraper/crawler';
import { runCrawlerReplay } from './scraper/replay';
import { generateFilters } from './solver/generate_filters';

export interface ParsedCliArgs {
    command: string | null;
    flags: Record<string, string | boolean>;
    positionals: string[];
}

function printUsage() {
    console.log(`ZZZ Trash Optimizer CLI

Usage:
  node dist/cli.js optimize --inventory <file> [--policy conservative|strict] [--steps <n>] [--exhaustive] [--output <file>]
  node dist/cli.js score --inventory <file> [--policy conservative|strict] [--output <file>]
  node dist/cli.js solve --inventory <file> [--policy conservative|strict] [--steps <n>] [--exhaustive] [--output <file>]
  node dist/cli.js validate --inventory <file>
  node dist/cli.js crawl
  node dist/cli.js replay-crawl
`);
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
    const [command, ...rest] = argv;
    const flags: Record<string, string | boolean> = {};
    const positionals: string[] = [];

    for (let i = 0; i < rest.length; i++) {
        const arg = rest[i];
        if (!arg.startsWith('--')) {
            positionals.push(arg);
            continue;
        }

        const trimmed = arg.slice(2);
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
            flags[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
            continue;
        }

        const next = rest[i + 1];
        if (next && !next.startsWith('--')) {
            flags[trimmed] = next;
            i++;
        } else {
            flags[trimmed] = true;
        }
    }

    return {
        command: command ?? null,
        flags,
        positionals
    };
}

function getRequiredStringFlag(flags: Record<string, string | boolean>, name: string): string {
    const value = flags[name];
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Missing required flag --${name}`);
    }
    return value;
}

function getOptionalStringFlag(flags: Record<string, string | boolean>, name: string): string | undefined {
    const value = flags[name];
    return typeof value === 'string' ? value : undefined;
}

function getOptionalBooleanFlag(flags: Record<string, string | boolean>, name: string): boolean {
    return flags[name] === true;
}

function getOptionalNumberFlag(flags: Record<string, string | boolean>, name: string): number | undefined {
    const value = getOptionalStringFlag(flags, name);
    if (!value) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid value for --${name}: ${value}`);
    }
    return Math.floor(parsed);
}

function getPolicyFlag(flags: Record<string, string | boolean>): 'conservative' | 'strict' {
    const policy = getOptionalStringFlag(flags, 'policy') ?? 'conservative';
    if (policy !== 'conservative' && policy !== 'strict') {
        throw new Error(`Invalid value for --policy: ${policy}`);
    }
    return policy;
}

async function runScoreCommand(flags: Record<string, string | boolean>) {
    const inventory = getRequiredStringFlag(flags, 'inventory');
    const output = getOptionalStringFlag(flags, 'output');
    const policy = getPolicyFlag(flags);
    await processInventory({
        inventoryFile: inventory,
        policy,
        outputFile: output ? path.resolve(output) : undefined,
        argv: []
    });
}

async function runSolveCommand(flags: Record<string, string | boolean>) {
    const inventory = getRequiredStringFlag(flags, 'inventory');
    const output = getOptionalStringFlag(flags, 'output');
    const policy = getPolicyFlag(flags);
    const maxSteps = getOptionalNumberFlag(flags, 'steps');
    const exhaustive = getOptionalBooleanFlag(flags, 'exhaustive');

    const scoreResult = await processInventory({
        inventoryFile: inventory,
        policy,
        outputFile: output ? path.resolve(output) : undefined,
        argv: []
    });
    if (!scoreResult) {
        throw new Error('Failed to score inventory before solving.');
    }

    console.log('');
    console.log('Optimization is starting.');
    console.log('The solver can take a few minutes, and the console may appear quiet between updates.');
    console.log('');

    generateFilters({
        valuationFile: scoreResult.outputFile,
        outputFile: path.join(path.dirname(scoreResult.outputFile), 'trash_filter_sequence.txt'),
        maxSteps,
        exhaustive
    });
}

async function runOptimizeCommand(flags: Record<string, string | boolean>) {
    await runSolveCommand(flags);
}

async function runValidateCommand(flags: Record<string, string | boolean>) {
    const inventory = getRequiredStringFlag(flags, 'inventory');
    const resolved = resolveInventoryFile(process.cwd(), inventory);
    if (!resolved) {
        throw new Error(`Inventory file not found: ${inventory}`);
    }
    const validationPath = path.resolve(__dirname, 'validate_pipeline.js');
    const { spawnSync } = await import('child_process');
    const result = spawnSync(process.execPath, [validationPath, `--inventory=${resolved}`], {
        stdio: 'inherit',
        env: process.env
    });
    if (result.status !== 0) {
        throw new Error(`Validation failed with exit code ${result.status ?? 1}`);
    }
}

export async function runCli(argv: string[] = process.argv.slice(2)) {
    const { command, flags } = parseCliArgs(argv);

    if (!command || command === 'help' || flags.help === true) {
        printUsage();
        return;
    }

    switch (command) {
        case 'optimize':
            await runOptimizeCommand(flags);
            return;
        case 'score':
            await runScoreCommand(flags);
            return;
        case 'solve':
            await runSolveCommand(flags);
            return;
        case 'validate':
            await runValidateCommand(flags);
            return;
        case 'crawl':
            await runCrawler();
            return;
        case 'replay-crawl':
            await runCrawlerReplay();
            return;
        default:
            throw new Error(`Unknown command: ${command}`);
    }
}

if (require.main === module) {
    runCli().catch(err => {
        console.error(err.message);
        process.exit(1);
    });
}
