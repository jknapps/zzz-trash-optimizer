import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RelicAnalysis } from './filter_optimizer';
import { buildFilterSequence, generateFilters } from './generate_filters';

describe('buildFilterSequence', () => {
    const baseRelics: RelicAnalysis[] = [
        {
            setKey: 'Set A',
            slotKey: '1',
            mainStatKey: 'hp',
            substats: [{ key: 'HP', upgrades: 100 }, { key: 'DEF', upgrades: 20 }],
            rarity: 'S',
            analysis: { isKeep: false, matchCount: 0 }
        }
    ];

    test('flags truncated when step limit is reached with remaining trash', () => {
        const summary = buildFilterSequence(baseRelics, { exhaustive: false, maxSteps: 0 });
        expect(summary.truncated).toBe(true);
        expect(summary.remainingTrash).toBeGreaterThan(0);
    });

    test('reports non-truncated when all trash is resolved in budget', () => {
        const summary = buildFilterSequence(baseRelics, { exhaustive: false, maxSteps: 5 });
        expect(summary.totalTrash).toBe(1);
        expect(summary.caughtTotal).toBeGreaterThanOrEqual(1);
        expect(summary.truncated).toBe(false);
    });

    test('writes rendered filter output to disk', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zzz-filters-'));
        const valuationFile = path.join(tempDir, 'disc_valuation.json');
        const outputFile = path.join(tempDir, 'trash_filter_sequence.txt');

        fs.writeFileSync(valuationFile, JSON.stringify(baseRelics, null, 2));

        const result = generateFilters({ valuationFile, outputFile, maxSteps: 5 });

        expect(result?.outputFile).toBe(outputFile);
        expect(fs.existsSync(outputFile)).toBe(true);
        expect(fs.readFileSync(outputFile, 'utf-8')).toContain('ZZZ TRASH OPTIMIZER FILTER SEQUENCE');
    });
});
