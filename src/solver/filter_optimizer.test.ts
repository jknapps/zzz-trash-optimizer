import { FilterOptimizer, RelicAnalysis, RelicFilter } from './filter_optimizer';

describe('FilterOptimizer', () => {
    const mockRelics: RelicAnalysis[] = [
        {
            setKey: "Set A",
            slotKey: "4",
            mainStatKey: "HP%",
            substats: [],
            rarity: 'S',
            analysis: { isKeep: false, matchCount: 0 }
        },
        {
            setKey: "Set B",
            slotKey: "4",
            mainStatKey: "HP%",
            substats: [],
            rarity: 'S',
            analysis: { isKeep: false, matchCount: 0 }
        },
        {
            setKey: "Set C",
            slotKey: "4",
            mainStatKey: "HP%",
            substats: [],
            rarity: 'S',
            analysis: { isKeep: true, matchCount: 2 }  // This makes Set C unsafe for HP% trashing
        }
    ];

    const optimizer = new FilterOptimizer(mockRelics);

    test('should aggregate safe sets into a single MULTI-SET candidate', () => {
        const { filters } = optimizer.findAllSafeFilters({ exhaustive: false });
        // The algorithm should find that [Set A, Set B] are safe for slot 4/5/6 with HP%/DEF%
        const multiSetFilter = filters.find(f => f.label?.includes('MULTI-SET') && f.sets?.length === 2);

        expect(multiSetFilter).toBeDefined();
        expect(multiSetFilter?.sets).toContain("Set A");
        expect(multiSetFilter?.sets).toContain("Set B");
        expect(multiSetFilter?.sets).not.toContain("Set C");
        expect(multiSetFilter?.trashCount).toBe(2);
    });

    test('getMatchedRelics should match evaluateFilter counts', () => {
        const filter: RelicFilter = { sets: ["Set A"] };
        const evalRes = optimizer.evaluateFilter(filter);
        const matched = optimizer.getMatchedRelics(filter);
        expect(matched.length).toBe(evalRes.totalSelected);
    });

    test('should reject unsafe filters (safety guarantee)', () => {
        const unsafeFilter: RelicFilter = { sets: ["Set C"], slots: ["4"], mainStats: ["HP%"] };
        const res = optimizer.evaluateFilter(unsafeFilter);
        expect(res.keepsSelected).toBe(1);
    });

    test('should normalize main stats when evaluating filters', () => {
        const rawRelic: RelicAnalysis = {
            setKey: "Test Set",
            slotKey: "6",
            mainStatKey: "enerRegen_",  // AdeptiScanner key for Energy Regen
            substats: [],
            rarity: 'S',
            analysis: { isKeep: false, matchCount: 0 }
        };

        const localOpt = new FilterOptimizer([rawRelic]);
        const res = localOpt.evaluateFilter({ mainStats: ["Energy Regen"] });
        expect(res.trashSelected).toBe(1);
    });

    test('should model include substats as k-of-n matching', () => {
        const includeRelics: RelicAnalysis[] = [
            {
                setKey: "Set A",
                slotKey: "1",
                mainStatKey: "hp",
                substats: [{ key: "HP", upgrades: 100 }, { key: "DEF", upgrades: 20 }, { key: "ATK", upgrades: 20 }],
                rarity: 'S',
                analysis: { isKeep: false, matchCount: 0 }
            }
        ];

        const localOpt = new FilterOptimizer(includeRelics);
        const k2 = localOpt.evaluateFilter({ subStats: ["HP", "DEF", "CRIT Rate"], subStatsMinMatches: 2 });
        const k3 = localOpt.evaluateFilter({ subStats: ["HP", "DEF", "CRIT Rate"], subStatsMinMatches: 3 });

        expect(k2.totalSelected).toBe(1);  // 2 of 3 matched
        expect(k3.totalSelected).toBe(0);  // 3 of 3 not matched
    });

    test('should model exclude substats as OR exclusion', () => {
        const excludeRelics: RelicAnalysis[] = [
            {
                setKey: "Set A",
                slotKey: "1",
                mainStatKey: "hp",
                substats: [{ key: "crit_", upgrades: 2 }, { key: "HP", upgrades: 100 }],
                rarity: 'S',
                analysis: { isKeep: false, matchCount: 0 }
            },
            {
                setKey: "Set A",
                slotKey: "1",
                mainStatKey: "hp",
                substats: [{ key: "HP", upgrades: 100 }, { key: "DEF", upgrades: 20 }],
                rarity: 'S',
                analysis: { isKeep: false, matchCount: 0 }
            }
        ];

        const localOpt = new FilterOptimizer(excludeRelics);
        const res = localOpt.evaluateFilter({ excludeSubStats: ["CRIT Rate", "ATK%"] });
        expect(res.totalSelected).toBe(1);  // only disc without CRIT Rate/ATK% remains
    });

    test('should generate fixed-slot safe candidates in non-exhaustive mode', () => {
        const fixedSlotRelics: RelicAnalysis[] = [
            {
                setKey: "Set A",
                slotKey: "1",
                mainStatKey: "hp",
                substats: [{ key: "HP", upgrades: 100 }, { key: "ATK", upgrades: 20 }],
                rarity: 'S',
                analysis: { isKeep: false, matchCount: 0 }
            },
            {
                setKey: "Set A",
                slotKey: "2",
                mainStatKey: "atk",
                substats: [{ key: "HP", upgrades: 100 }, { key: "ATK", upgrades: 20 }],
                rarity: 'S',
                analysis: { isKeep: false, matchCount: 0 }
            },
            {
                setKey: "Set B",
                slotKey: "1",
                mainStatKey: "hp",
                substats: [{ key: "HP", upgrades: 100 }, { key: "ATK", upgrades: 20 }],
                rarity: 'S',
                analysis: { isKeep: true, matchCount: 2 }
            }
        ];

        const localOpt = new FilterOptimizer(fixedSlotRelics);
        const { filters } = localOpt.findAllSafeFilters({ exhaustive: false, maxCandidates: 200 });
        const fixedSlotFilter = filters.find(f =>
            f.slots?.includes("1") &&
            f.slots?.includes("2") &&
            f.subStats?.includes("HP") &&
            f.subStats?.includes("ATK")
        );

        expect(fixedSlotFilter).toBeDefined();
        expect(fixedSlotFilter?.sets).toContain("Set A");
        expect(fixedSlotFilter?.sets).not.toContain("Set B");
    });

    test('should respect exhaustive flag', () => {
        const { stats: stdStats } = optimizer.findAllSafeFilters({ exhaustive: false });
        const { stats: exStats } = optimizer.findAllSafeFilters({ exhaustive: true });
        expect(exStats.candidatesTried).toBeGreaterThan(stdStats.candidatesTried);
    });

    test('should respect maxCandidates ceiling globally', () => {
        const { stats, filters } = optimizer.findAllSafeFilters({ exhaustive: false, maxCandidates: 1 });
        expect(stats.candidatesTried).toBeLessThanOrEqual(1);
        expect(filters.length).toBeLessThanOrEqual(1);
    });
});
