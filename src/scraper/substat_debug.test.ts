import {
    buildCrawlSubstatAuditReport,
    parseSubstatLines
} from './substat_debug';

describe('substat_debug', () => {
    test('keeps >= comparisons in the same priority tier', () => {
        const parsed = parseSubstatLines(['CRIT Rate = HP% >= DEF% > AP']);

        expect(parsed.parsedSubstats.weight1).toEqual(['CRIT Rate', 'HP%', 'DEF%']);
        expect(parsed.parsedSubstats.weight05).toEqual(['Anomaly Proficiency']);
        expect(parsed.unknownTokens).toEqual([]);
    });

    test('recognizes shorthand aliases and skips non-substat priority lines', () => {
        const parsed = parseSubstatLines([
            'CRIT Rate > AP = ER',
            'Skill > Ultimate > Basic'
        ]);

        expect(parsed.parsedSubstats.weight1).toEqual(['CRIT Rate', 'Anomaly Proficiency', 'Energy Regen']);
        expect(parsed.parsedSubstats.weight05).toEqual([]);
        expect(parsed.unknownTokens).toEqual([]);
    });

    test('recognizes CR and CD shorthand aliases', () => {
        // Need 2 weight1 stats before tier drops to weight05
        const parsed = parseSubstatLines(['ATK% = HP% > CR = CD > PEN']);

        expect(parsed.parsedSubstats.weight1).toEqual(['ATK%', 'HP%']);
        expect(parsed.parsedSubstats.weight05).toContain('CRIT Rate');
        expect(parsed.parsedSubstats.weight05).toContain('CRIT DMG');
        expect(parsed.unknownTokens).toEqual([]);
    });

    test('aggregates unmatched tokens and repeated shorthand candidates', () => {
        const report = buildCrawlSubstatAuditReport([
            {
                name: 'One',
                url: 'https://example.com/one',
                slug: 'one',
                rawSubstatLines: ['ATK% > XYZ'],
                parsedSubstats: { weight1: ['ATK%'], weight05: [] },
                unknownTokens: ['xyz'],
                shorthandCandidates: ['XYZ']
            },
            {
                name: 'Two',
                url: 'https://example.com/two',
                slug: 'two',
                rawSubstatLines: ['CRIT Rate > XYZ'],
                parsedSubstats: { weight1: ['CRIT Rate'], weight05: [] },
                unknownTokens: ['xyz'],
                shorthandCandidates: ['XYZ']
            },
            {
                name: 'Three',
                url: 'https://example.com/three',
                slug: 'three',
                rawSubstatLines: ['ATK% > QQQ'],
                parsedSubstats: { weight1: ['ATK%'], weight05: [] },
                unknownTokens: ['qqq'],
                shorthandCandidates: ['QQQ']
            }
        ]);

        expect(report.unknownTokens).toEqual([
            { token: 'xyz', count: 2, characters: ['One', 'Two'] },
            { token: 'qqq', count: 1, characters: ['Three'] }
        ]);
        expect(report.shorthandCandidates).toEqual([
            { token: 'XYZ', count: 2, characters: ['One', 'Two'] }
        ]);
    });
});
