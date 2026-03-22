import * as fs from 'fs';
import * as path from 'path';
import { DiscScorer, Disc, ScorerOptions } from './scorer';
import { CharacterBuild } from '../scraper/prydwen';

export const INVENTORY_DIR_NAME = 'disc-jsons';

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(v => typeof v === 'string');
}

export function validateCharacterDatabase(input: unknown): CharacterBuild[] {
    if (!Array.isArray(input)) {
        throw new Error('Invalid character database: expected an array.');
    }

    const validChars: CharacterBuild[] = [];
    input.forEach((raw, idx) => {
        const c = raw as any;
        const baseOk =
            c &&
            typeof c.name === 'string' &&
            isStringArray(c.bestDiscSets) &&
            c.statPriority &&
            isStringArray(c.statPriority.slot4) &&
            isStringArray(c.statPriority.slot5) &&
            isStringArray(c.statPriority.slot6) &&
            c.statPriority.substats &&
            isStringArray(c.statPriority.substats.weight1) &&
            isStringArray(c.statPriority.substats.weight05);

        if (!baseOk) {
            console.warn(`[WARN] Skipping invalid character at index ${idx}: Missing required fields.`);
            return;
        }

        const hasRequiredRecommendations =
            c.bestDiscSets.length > 0 &&
            c.statPriority.slot4.length > 0 &&
            c.statPriority.slot5.length > 0 &&
            c.statPriority.slot6.length > 0;

        if (!hasRequiredRecommendations) {
            console.warn(`[WARN] Skipping character "${c.name}": Incomplete guide recommendations.`);
            return;
        }

        const hasStats = c.statPriority.substats.weight1.length > 0 || c.statPriority.substats.weight05.length > 0;
        if (!hasStats) {
            console.warn(`[WARN] Skipping character "${c.name}": No substat priorities found (likely incomplete guide).`);
            return;
        }

        validChars.push(c);
    });

    return validChars;
}

function isValidSubstat(value: unknown): value is { key: string; upgrades: number } {
    const s = value as any;
    return !!s && typeof s.key === 'string' && typeof s.upgrades === 'number' && Number.isFinite(s.upgrades);
}

export function normalizeAndValidateDiscs(input: unknown): Disc[] {
    const discs = (input as any)?.discs;
    if (!Array.isArray(discs)) {
        throw new Error('Invalid inventory JSON: missing discs array.');
    }

    const normalized: Disc[] = [];
    const invalidEntries: string[] = [];

    discs.forEach((raw, idx) => {
        const r = raw as any;
        const substats = Array.isArray(r.substats) ? r.substats : null;
        const isValid =
            r &&
            typeof r.setKey === 'string' &&
            typeof r.slotKey === 'string' &&
            typeof r.mainStatKey === 'string' &&
            Array.isArray(substats) &&
            substats.every(isValidSubstat) &&
            typeof r.rarity === 'string' &&
            typeof r.level === 'number' &&
            Number.isFinite(r.level);

        if (!isValid) {
            invalidEntries.push(`index ${idx}`);
            return;
        }

        normalized.push({
            setKey: r.setKey.trim(),
            slotKey: r.slotKey.trim(),
            mainStatKey: r.mainStatKey.trim(),
            rarity: r.rarity.trim(),
            level: r.level,
            substats: substats.map((s: any) => ({
                key: s.key.trim(),
                upgrades: s.upgrades
            }))
        });
    });

    if (invalidEntries.length > 0) {
        throw new Error(
            `Invalid disc entries in inventory: ${invalidEntries.slice(0, 10).join(', ')}${invalidEntries.length > 10 ? ' ...' : ''}`
        );
    }

    return normalized;
}

export function findLatestInventoryFile(dir: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.ZOD.json') || (f.startsWith('ZZZ') && f.endsWith('.json')));
    if (files.length === 0) return null;
    files.sort((a, b) => b.localeCompare(a));
    return path.join(dir, files[0]);
}

export function getInventorySearchDirs(projectRoot: string): string[] {
    return [
        path.join(projectRoot, INVENTORY_DIR_NAME),
        projectRoot
    ];
}

export function findLatestInventoryInProject(projectRoot: string): string | null {
    for (const dir of getInventorySearchDirs(projectRoot)) {
        const file = findLatestInventoryFile(dir);
        if (file) {
            return file;
        }
    }

    return null;
}

export function getInventoryArg(argv: string[] = process.argv): string | undefined {
    const arg = argv.find(value => value.startsWith('--inventory='));
    return arg ? arg.slice('--inventory='.length) : undefined;
}

export function resolveInventoryFile(projectRoot: string, explicitInventory?: string): string | null {
    if (explicitInventory) {
        if (path.isAbsolute(explicitInventory)) {
            return explicitInventory;
        }

        const candidates = [
            path.resolve(projectRoot, explicitInventory),
            path.resolve(projectRoot, INVENTORY_DIR_NAME, explicitInventory)
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        return candidates[0];
    }
    return findLatestInventoryInProject(projectRoot);
}

export interface ProcessInventoryOptions {
    inventoryFile?: string;
    argv?: string[];
    policy?: ScorerOptions['policy'];
    outputFile?: string;
}

export async function processInventory(options?: ProcessInventoryOptions) {
    const dataDir = path.join(__dirname, '../../data');
    const projectRoot = path.join(__dirname, '../../');
    const dbFile = path.join(dataDir, 'prydwen_data.json');
    const outputFile = options?.outputFile ?? path.join(dataDir, 'disc_valuation.json');

    const argv = options?.argv ?? process.argv;
    const inventoryArg = options?.inventoryFile ?? getInventoryArg(argv);
    const inventoryFile = resolveInventoryFile(projectRoot, inventoryArg);
    if (!inventoryFile || !fs.existsSync(inventoryFile)) {
        if (inventoryArg) {
            console.error(`Inventory file not found: ${inventoryArg}`);
            return;
        }
        console.error(`No .ZOD.json file found in ${path.join(projectRoot, INVENTORY_DIR_NAME)} or ${projectRoot}`);
        return;
    }

    if (!fs.existsSync(dbFile)) {
        console.error('Prydwen database not found! Run crawler first.');
        return;
    }

    const scorerOptions: ScorerOptions = {
        policy: options?.policy ?? (argv.includes('--strict') ? 'strict' : 'conservative')
    };

    console.log(`Using inventory file: ${inventoryFile}`);
    console.log(`Scoring Policy: ${scorerOptions.policy}`);

    const characters = validateCharacterDatabase(JSON.parse(fs.readFileSync(dbFile, 'utf-8')));
    
    // FAIL-SAFE: Abort if we have no valid character builds.
    // Proceeding with 0 characters would mark the entire inventory as TRASH.
    if (characters.length === 0) {
        throw new Error('CRITICAL FAILURE: No valid character builds found in database. Aborting to prevent trashing entire inventory.');
    }

    const inventoryRaw = JSON.parse(fs.readFileSync(inventoryFile, 'utf-8'));
    const relics = normalizeAndValidateDiscs(inventoryRaw);

    console.log(`Processing ${relics.length} discs against ${characters.length} characters...`);

    const scorer = new DiscScorer(characters, scorerOptions);
    const results = relics.map(relic => {
        const score = scorer.scoreDisc(relic);
        return {
            ...relic,
            analysis: score
        };
    });

    const keepCount = results.filter(r => r.analysis.isKeep).length;
    const trashCount = results.length - keepCount;

    console.log(`Analysis Complete:`);
    console.log(`- Total: ${results.length}`);
    console.log(`- Keep: ${keepCount}`);
    console.log(`- Trash: ${trashCount}`);

    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`Results saved to ${outputFile}`);
    return {
        inventoryFile,
        outputFile,
        results,
        keepCount,
        trashCount,
        totalCount: results.length
    };
}

if (require.main === module) {
    processInventory().catch(err => {
        console.error(err.message);
        process.exit(1);
    });
}
