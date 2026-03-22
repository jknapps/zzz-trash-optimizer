jest.mock('./analysis/process_inventory', () => ({
    processInventory: jest.fn(async () => ({
        inventoryFile: '/tmp/inventory.json',
        outputFile: '/tmp/relic_valuation.json',
        results: [],
        keepCount: 1,
        trashCount: 2,
        totalCount: 3
    })),
    resolveInventoryFile: jest.fn((_root: string, inventory: string) => inventory ? `/resolved/${inventory}` : null)
}));

jest.mock('./solver/generate_filters', () => ({
    generateFilters: jest.fn(() => ({
        valuationFile: '/tmp/relic_valuation.json',
        outputFile: '/tmp/trash_filter_sequence.txt',
        relics: [],
        summary: null,
        output: ''
    }))
}));

jest.mock('./scraper/crawler', () => ({
    runCrawler: jest.fn(async () => undefined)
}));

jest.mock('./scraper/replay', () => ({
    runCrawlerReplay: jest.fn(async () => undefined)
}));

jest.mock('child_process', () => ({
    spawnSync: jest.fn(() => ({ status: 0 }))
}));

import * as path from 'path';
import { parseCliArgs, runCli } from './cli';
import { processInventory } from './analysis/process_inventory';
import { generateFilters } from './solver/generate_filters';
import { runCrawler } from './scraper/crawler';
import { runCrawlerReplay } from './scraper/replay';
import { spawnSync } from 'child_process';

describe('CLI', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('parses commands and flags', () => {
        expect(parseCliArgs(['solve', '--inventory', 'data.json', '--steps=5', '--exhaustive'])).toEqual({
            command: 'solve',
            flags: {
                inventory: 'data.json',
                steps: '5',
                exhaustive: true
            },
            positionals: []
        });
    });

    test('dispatches score command', async () => {
        await runCli(['score', '--inventory', 'data.json', '--policy', 'strict', '--output', 'out.json']);
        expect(processInventory).toHaveBeenCalledWith({
            inventoryFile: 'data.json',
            policy: 'strict',
            outputFile: expect.stringContaining('out.json'),
            argv: []
        });
    });

    test('dispatches solve command and then generates filters', async () => {
        await runCli(['solve', '--inventory', 'data.json', '--steps', '7', '--exhaustive']);
        expect(processInventory).toHaveBeenCalled();
        const mockOutputFile = '/tmp/relic_valuation.json';
        const expectedFilterFile = path.join(path.dirname(mockOutputFile), 'trash_filter_sequence.txt');
        expect(generateFilters).toHaveBeenCalledWith({
            valuationFile: mockOutputFile,
            outputFile: expectedFilterFile,
            maxSteps: 7,
            exhaustive: true
        });
    });

    test('dispatches crawl command', async () => {
        await runCli(['crawl']);
        expect(runCrawler).toHaveBeenCalled();
    });

    test('dispatches replay-crawl command', async () => {
        await runCli(['replay-crawl']);
        expect(runCrawlerReplay).toHaveBeenCalled();
    });

    test('dispatches validate command through the validation entrypoint', async () => {
        await runCli(['validate', '--inventory', 'data.json']);
        expect(spawnSync).toHaveBeenCalledWith(
            process.execPath,
            [expect.stringContaining('validate_pipeline.js'), '--inventory=/resolved/data.json'],
            expect.objectContaining({ stdio: 'inherit' })
        );
    });

    test('rejects unknown commands', async () => {
        await expect(runCli(['bogus'])).rejects.toThrow('Unknown command: bogus');
    });

    test('requires inventory for score and solve', async () => {
        await expect(runCli(['score'])).rejects.toThrow('Missing required flag --inventory');
        await expect(runCli(['solve'])).rejects.toThrow('Missing required flag --inventory');
    });
});
