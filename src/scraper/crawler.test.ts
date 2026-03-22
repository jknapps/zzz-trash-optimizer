import * as path from 'path';
import { CharacterBuild, ParsedCharacterPageDetailed } from './prydwen';
import { runCrawler } from './crawler';

describe('runCrawler', () => {
    const mkBuild = (name: string): CharacterBuild => ({
        name,
        bestDiscSets: ['chaoticmetal'],
        statPriority: {
            slot4: ['CRIT Rate', 'CRIT DMG'],
            slot5: ['Ether DMG'],
            slot6: ['ATK%'],
            substats: { weight1: ['CRIT Rate', 'CRIT DMG'], weight05: ['ATK%'] }
        },
        warnings: []
    });

    const mkDetailedBuild = (name: string): ParsedCharacterPageDetailed => ({
        build: mkBuild(name),
        substatDebug: {
            rawLines: ['CRIT Rate = CRIT DMG > ATK%'],
            parsedSubstats: { weight1: ['CRIT Rate', 'CRIT DMG'], weight05: ['ATK%'] },
            unknownTokens: [],
            shorthandCandidates: []
        }
    });

    test('creates data dir, writes debug crawl artifacts, and promotes the final database atomically', async () => {
        const dataDir = path.join('tmp', 'crawl-data');
        const debugDir = path.join('tmp', 'crawl-debug');
        const outputFile = path.join(dataDir, 'prydwen_data.json');
        const partialFile = path.join(dataDir, 'prydwen_data.partial.json');
        const auditFile = path.join(debugDir, 'substat-audit.json');
        const indexFile = path.join(debugDir, 'index.html');
        const c1File = path.join(debugDir, 'characters', 'c1.html');
        const c2File = path.join(debugDir, 'characters', 'c2.html');
        const existing = new Set<string>();

        const existsSync = jest.fn((p: string) => existing.has(p));
        const mkdirSync = jest.fn((p: string) => {
            existing.add(p);
        });
        const rmSync = jest.fn((p: string) => {
            existing.delete(p);
        });
        const unlinkSync = jest.fn();
        const renameSync = jest.fn((from: string, to: string) => {
            existing.delete(from);
            existing.add(to);
        });
        const writeFileSync = jest.fn((p: string) => {
            existing.add(p);
        });
        const sleep = jest.fn(async () => undefined);

        const httpGet = jest.fn()
            .mockResolvedValueOnce({ data: '<list />' })
            .mockResolvedValueOnce({ data: '<char-1 />' })
            .mockResolvedValueOnce({ data: '<char-2 />' });

        const scraper = {
            parseCharacterList: jest.fn(() => ['https://example.com/c1', 'https://example.com/c2']),
            parseCharacterPage: jest.fn((html: string) => html.includes('char-1') ? mkBuild('C1') : mkBuild('C2')),
            parseCharacterPageDetailed: jest.fn((html: string) => html.includes('char-1') ? mkDetailedBuild('C1') : mkDetailedBuild('C2'))
        };

        await runCrawler({
            dataDir,
            debugDir,
            scraper,
            deps: {
                httpGet,
                existsSync: existsSync as any,
                mkdirSync: mkdirSync as any,
                rmSync: rmSync as any,
                unlinkSync: unlinkSync as any,
                renameSync: renameSync as any,
                writeFileSync: writeFileSync as any,
                sleep,
                log: jest.fn(),
                error: jest.fn()
            }
        });

        expect(mkdirSync).toHaveBeenCalledWith(dataDir);
        expect(rmSync).toHaveBeenCalledWith(debugDir, { recursive: true, force: true });
        expect(unlinkSync).not.toHaveBeenCalled();
        expect(writeFileSync).toHaveBeenCalledWith(indexFile, '<list />');
        expect(writeFileSync).toHaveBeenCalledWith(c1File, '<char-1 />');
        expect(writeFileSync).toHaveBeenCalledWith(c2File, '<char-2 />');
        expect(writeFileSync).toHaveBeenCalledWith(
            auditFile,
            expect.stringContaining('"slug": "c2"')
        );
        expect(writeFileSync).toHaveBeenLastCalledWith(
            partialFile,
            expect.stringContaining('"name": "C2"')
        );
        expect(renameSync).toHaveBeenCalledWith(partialFile, outputFile);
        expect(sleep).toHaveBeenCalledTimes(2);
    });

    test('continues after per-character fetch error and still throttles', async () => {
        const dataDir = path.join('tmp', 'crawl-data-2');
        const debugDir = path.join('tmp', 'crawl-debug-2');
        const sleep = jest.fn(async () => undefined);
        const error = jest.fn();
        const renameSync = jest.fn();

        const httpGet = jest.fn()
            .mockResolvedValueOnce({ data: '<list />' })
            .mockResolvedValueOnce({ data: '<char-1 />' })
            .mockRejectedValueOnce(new Error('boom'));

        const scraper = {
            parseCharacterList: jest.fn(() => ['https://example.com/c1', 'https://example.com/c2']),
            parseCharacterPage: jest.fn(() => mkBuild('C1'))
        };

        const writeFileSync = jest.fn();
        await runCrawler({
            dataDir,
            debugDir,
            scraper,
            deps: {
                httpGet,
                existsSync: jest.fn(() => true) as any,
                mkdirSync: jest.fn() as any,
                rmSync: jest.fn() as any,
                unlinkSync: jest.fn() as any,
                renameSync: renameSync as any,
                writeFileSync: writeFileSync as any,
                sleep,
                log: jest.fn(),
                error
            }
        });

        expect(writeFileSync).toHaveBeenCalledWith(
            path.join(debugDir, 'index.html'),
            '<list />'
        );
        expect(writeFileSync).toHaveBeenCalledWith(
            path.join(debugDir, 'characters', 'c1.html'),
            '<char-1 />'
        );
        expect(writeFileSync).toHaveBeenCalledWith(
            path.join(debugDir, 'substat-audit.json'),
            expect.stringContaining('"slug": "c1"')
        );
        expect(writeFileSync).toHaveBeenCalledWith(
            path.join(dataDir, 'prydwen_data.partial.json'),
            expect.stringContaining('"name": "C1"')
        );
        expect(error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch https://example.com/c2'));
        expect(renameSync).not.toHaveBeenCalled();
        expect(sleep).toHaveBeenCalledTimes(2);
    });

    test('logs warnings when debug artifact writes fail but still completes the crawl', async () => {
        const dataDir = path.join('tmp', 'crawl-data-4');
        const debugDir = path.join('tmp', 'crawl-debug-4');
        const log = jest.fn();
        const renameSync = jest.fn();
        const writeFileSync = jest.fn((p: string) => {
            if (p.includes('prydwen-last-crawl') || p.includes('crawl-debug-4')) {
                throw new Error('debug write failed');
            }
        });

        const httpGet = jest.fn()
            .mockResolvedValueOnce({ data: '<list />' })
            .mockResolvedValueOnce({ data: '<char-1 />' });

        const scraper = {
            parseCharacterList: jest.fn(() => ['https://example.com/c1']),
            parseCharacterPage: jest.fn(() => mkBuild('C1')),
            parseCharacterPageDetailed: jest.fn(() => mkDetailedBuild('C1'))
        };

        await runCrawler({
            dataDir,
            debugDir,
            scraper,
            deps: {
                httpGet,
                existsSync: jest.fn(() => true) as any,
                mkdirSync: jest.fn() as any,
                rmSync: jest.fn() as any,
                unlinkSync: jest.fn() as any,
                renameSync: renameSync as any,
                writeFileSync: writeFileSync as any,
                sleep: jest.fn(async () => undefined),
                log,
                error: jest.fn()
            }
        });

        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('[WARN] Failed to write debug artifact')
        );
        expect(renameSync).toHaveBeenCalled();
    });

    test('keeps the existing database when the crawl result is semantically incomplete', async () => {
        const dataDir = path.join('tmp', 'crawl-data-3');
        const debugDir = path.join('tmp', 'crawl-debug-3');
        const outputFile = path.join(dataDir, 'prydwen_data.json');
        const partialFile = path.join(dataDir, 'prydwen_data.partial.json');
        const existing = new Set<string>([dataDir, outputFile]);
        const error = jest.fn();
        const renameSync = jest.fn((from: string, to: string) => {
            existing.delete(from);
            existing.add(to);
        });

        const scraper = {
            parseCharacterList: jest.fn(() => Array.from({ length: 83 }, (_, idx) => `https://example.com/c${idx}`)),
            parseCharacterPage: jest.fn(() => ({
                name: 'Broken',
                bestDiscSets: [],
                statPriority: {
                    slot4: [],
                    slot5: [],
                    slot6: [],
                    substats: { weight1: [], weight05: [] }
                },
                warnings: []
            }))
        };

        const httpGet = jest.fn()
            .mockResolvedValueOnce({ data: '<list />' })
            .mockResolvedValue({ data: '<character />' });

        await runCrawler({
            dataDir,
            debugDir,
            scraper: scraper as any,
            deps: {
                httpGet,
                existsSync: jest.fn((p: string) => existing.has(p)) as any,
                mkdirSync: jest.fn() as any,
                rmSync: jest.fn() as any,
                unlinkSync: jest.fn((p: string) => existing.delete(p)) as any,
                renameSync: renameSync as any,
                writeFileSync: jest.fn((p: string) => existing.add(p)) as any,
                sleep: jest.fn(async () => undefined),
                log: jest.fn(),
                error
            }
        });

        expect(error).toHaveBeenCalledWith(expect.stringContaining('Crawl validation failed'));
        expect(renameSync).not.toHaveBeenCalledWith(partialFile, outputFile);
        expect(existing.has(outputFile)).toBe(true);
        expect(existing.has(partialFile)).toBe(true);
    });
});
