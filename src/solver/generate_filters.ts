import * as fs from 'fs';
import * as path from 'path';
import { FilterOptimizer, RelicAnalysis, RelicFilter } from './filter_optimizer';
import { getChronoSortIndex } from '../analysis/chrono_order';

const DEFAULT_MAX_STEPS = 10;

export interface SequenceOptions {
    exhaustive?: boolean;
    maxSteps?: number;
}

export interface SequenceResult {
    filterSequence: RelicFilter[];
    caughtTotal: number;
    totalTrash: number;
    remainingTrash: number;
    stepsExecuted: number;
    truncated: boolean;
}

export interface GenerateFilterOptions extends SequenceOptions {
    valuationFile?: string;
    outputFile?: string;
}

export function buildFilterSequence(relics: RelicAnalysis[], options?: SequenceOptions): SequenceResult {
    const exhaustive = options?.exhaustive ?? false;
    const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;

    const initialOptimizer = new FilterOptimizer(relics);
    const totalTrash = initialOptimizer.getTrashPool().length;
    const filterSequence: RelicFilter[] = [];
    let remainingRelics = [...relics];
    let caughtTotal = 0;
    let stepsExecuted = 0;

    for (let i = 0; i < maxSteps; i++) {
        const currentOptimizer = new FilterOptimizer(remainingRelics);
        const { filters } = currentOptimizer.findAllSafeFilters({ exhaustive });
        if (filters.length === 0) break;

        const best = filters[0];
        filterSequence.push(best);
        stepsExecuted++;

        const matchedRelics = currentOptimizer.getMatchedRelics(best);
        const trashCaught = matchedRelics.length;
        caughtTotal += trashCaught;

        const matchedSet = new Set(matchedRelics);
        remainingRelics = remainingRelics.filter(r => !matchedSet.has(r));
    }

    const remainingTrash = new FilterOptimizer(remainingRelics).getTrashPool().length;
    const truncated = stepsExecuted === maxSteps && remainingTrash > 0;

    return { filterSequence, caughtTotal, totalTrash, remainingTrash, stepsExecuted, truncated };
}

function loadValuationFile(valuationFile: string): RelicAnalysis[] {
    return JSON.parse(fs.readFileSync(valuationFile, 'utf-8'));
}

export function renderFilterSequence(relics: RelicAnalysis[], options?: SequenceOptions): string {
    const isExhaustive = options?.exhaustive ?? false;
    const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;
    const summary = buildFilterSequence(relics, { exhaustive: isExhaustive, maxSteps });
    const lines: string[] = [];

    lines.push(``);
    lines.push(`=== ZZZ TRASH OPTIMIZER FILTER SEQUENCE ===`);
    lines.push(`Targeting ${summary.totalTrash} trash items (S-rank only)`);
    if (isExhaustive) lines.push(`[Exhaustive Mode Enabled]`);
    if (maxSteps !== DEFAULT_MAX_STEPS) lines.push(`[Custom Step Limit: ${maxSteps}]`);

    let remainingRelics = [...relics];
    for (let i = 0; i < summary.filterSequence.length; i++) {
        const currentOptimizer = new FilterOptimizer(remainingRelics);
        const { filters, stats } = currentOptimizer.findAllSafeFilters({ exhaustive: isExhaustive });
        if (filters.length === 0) break;

        const best = summary.filterSequence[i];
        const matchedRelics = currentOptimizer.getMatchedRelics(best);
        const matchedSet = new Set(matchedRelics);
        remainingRelics = remainingRelics.filter(r => !matchedSet.has(r));

        lines.push(``);
        lines.push(`---------------------------------------------------------`);
        lines.push(`STEP #${i + 1}: ${best.label}`);
        lines.push(`[Telemetry: Generated ${stats.candidatesTried} candidates | Work checks ${stats.workItemsTried} | Safety evals ${stats.evaluationChecks}]`);
        lines.push(`---------------------------------------------------------`);
        if (best.slots) lines.push(`Slot:       ${best.slots.join(', ')}`);
        if (best.mainStats) lines.push(`Main Stat:  ${best.mainStats.join(', ')}`);
        if (best.subStats) {
            const required = best.subStatsMinMatches ?? Math.min(best.subStats.length, 4);
            lines.push(`Substats (Include): ${best.subStats.join(', ')} | Need ${required}`);
        }
        if (best.excludeSubStats) lines.push(`Substats (Exclude): [Any of] ${best.excludeSubStats.join(' OR ')}`);
        
        if (best.sets && best.sets.length > 0) {
            lines.push(``);
            lines.push(`Select these Sets:`);
            const setList = [...best.sets].sort((a, b) => getChronoSortIndex(a) - getChronoSortIndex(b));
            for (let j = 0; j < setList.length; j += 2) {
                const col1 = setList[j].padEnd(40);
                const col2 = setList[j+1] || '';
                lines.push(`  - ${col1}${col2 ? '- ' + col2 : ''}`);
            }
        } else {
            lines.push(`Apply to:   ALL SETS (Global Filter)`);
        }
    }

    if (summary.truncated) {
        lines.push(`WARNING: Sequence reached step limit (${maxSteps}) with ${summary.remainingTrash} trash discs still uncaught.`);
    }

    lines.push(``);
    lines.push(`=========================================================`);
    lines.push(`SEQUENCE SUMMARY:`);
    const pct = summary.totalTrash > 0 ? ((summary.caughtTotal / summary.totalTrash) * 100).toFixed(1) : '0.0';
    lines.push(`- Total Trash Caught: ${summary.caughtTotal} / ${summary.totalTrash} (${pct}%)`);
    lines.push(`- Steps Used: ${summary.stepsExecuted} / ${maxSteps}`);
    lines.push(`- Remaining Trash: ${summary.remainingTrash}`);
    lines.push(`=========================================================`);

    return lines.join('\n');
}

export function generateFilters(options?: GenerateFilterOptions) {
    const dataDir = path.resolve(__dirname, '../../data');
    const valuationFile = options?.valuationFile ?? path.join(dataDir, 'disc_valuation.json');
    const outputFile = options?.outputFile ?? path.join(path.dirname(valuationFile), 'trash_filter_sequence.txt');

    if (!fs.existsSync(valuationFile)) {
        console.error('Valuation file not found! Run score command first.');
        return null;
    }

    const relics = loadValuationFile(valuationFile);
    const argv = process.argv;
    const isExhaustive = options?.exhaustive ?? argv.includes('--exhaustive');
    const maxStepsArg = argv.find(arg => arg.startsWith('--steps='));
    const parsedSteps = maxStepsArg ? Number(maxStepsArg.split('=')[1]) : NaN;
    const maxSteps = options?.maxSteps ?? (Number.isFinite(parsedSteps) && parsedSteps > 0 ? Math.floor(parsedSteps) : DEFAULT_MAX_STEPS);
    const output = renderFilterSequence(relics, { exhaustive: isExhaustive, maxSteps });
    fs.writeFileSync(outputFile, output);
    console.log(output);
    console.log(`Trash filter sequence saved to ${outputFile}`);
    return {
        valuationFile,
        outputFile,
        relics,
        summary: buildFilterSequence(relics, { exhaustive: isExhaustive, maxSteps }),
        output
    };
}

if (require.main === module) {
    generateFilters();
}
