import * as path from 'path';
import { CharacterBuild, ParsedCharacterPageDetailed } from './prydwen';
import { runCrawlerReplay } from './replay';

describe('runCrawlerReplay', () => {
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

    test('replays saved html files into the database and audit report', async () => {
        const dataDir = path.join('tmp', 'replay-data');
        const debugDir = path.join('tmp', 'replay-debug');
        const charactersDir = path.join(debugDir, 'characters');
        const outputFile = path.join(dataDir, 'prydwen_data.json');
        const partialFile = path.join(dataDir, 'prydwen_data.partial.json');
        const auditFile = path.join(debugDir, 'substat-audit.json');
        const existing = new Set<string>([charactersDir, outputFile]);

        const scraper = {
            parseCharacterPage: jest.fn((html: string) => html.includes('char-1') ? mkBuild('C1') : mkBuild('C2')),
            parseCharacterPageDetailed: jest.fn((html: string) => html.includes('char-1') ? mkDetailedBuild('C1') : mkDetailedBuild('C2'))
        };

        await runCrawlerReplay({
            dataDir,
            debugDir,
            scraper,
            deps: {
                existsSync: jest.fn((p: string) => existing.has(p)) as any,
                mkdirSync: jest.fn((p: string) => existing.add(p)) as any,
                readdirSync: jest.fn(() => ['c2.html', 'c1.html']) as any,
                readFileSync: jest.fn((p: string) => p.includes('c1') ? '<char-1 />' : '<char-2 />') as any,
                unlinkSync: jest.fn((p: string) => existing.delete(p)) as any,
                renameSync: jest.fn((from: string, to: string) => {
                    existing.delete(from);
                    existing.add(to);
                }) as any,
                writeFileSync: jest.fn((p: string) => existing.add(p)) as any,
                log: jest.fn(),
                error: jest.fn()
            }
        });

        expect(scraper.parseCharacterPageDetailed).toHaveBeenCalledTimes(2);
        expect(scraper.parseCharacterPageDetailed).toHaveBeenNthCalledWith(1, '<char-1 />');
        expect(scraper.parseCharacterPageDetailed).toHaveBeenNthCalledWith(2, '<char-2 />');
        expect(existing.has(auditFile)).toBe(true);
        expect(existing.has(outputFile)).toBe(true);
        expect(existing.has(partialFile)).toBe(false);
    });
});
