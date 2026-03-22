import { CharacterBuild } from '../scraper/prydwen';
import { analyzeTraps } from './trap_detector';

describe('analyzeTraps', () => {
    test('counts critical traps when 2.0 is mathematically impossible', () => {
        const chars: CharacterBuild[] = [{
            name: 'Critical Char',
            bestDiscSets: [],
            statPriority: {
                slot4: ['HP%'],
                slot5: [],
                slot6: [],
                substats: { weight1: [], weight05: [] }
            },
            warnings: []
        }];

        const result = analyzeTraps(chars);
        // slot4 (1) + fixed slots 1/2/3 (3) = 4 critical traps (no tier-1 stats at all)
        expect(result.criticalTraps).toBe(4);
        expect(result.tightWarnings).toBe(0);
    });

    test('counts tight warnings when missing one tier-1 drops below 2.0', () => {
        const chars: CharacterBuild[] = [{
            name: 'Tight Char',
            bestDiscSets: [],
            statPriority: {
                slot4: ['HP%'],
                slot5: [],
                slot6: [],
                substats: { weight1: ['CRIT Rate', 'CRIT DMG'], weight05: [] }
            },
            warnings: []
        }];

        const result = analyzeTraps(chars);
        // slot4 HP%: 2 tier-1 available, maxPossible=2.0, but missing one T1 → 1.0 → tight
        // Fixed slots 1/2/3: same tier-1 pool, same outcome → tight each
        // Total: slot4 + slots 1/2/3 = 4 tight warnings
        expect(result.criticalTraps).toBe(0);
        expect(result.tightWarnings).toBe(4);
    });

    test('correctly excludes forbidden main stats for fixed slots (slot 1 excludes HP substat)', () => {
        const chars: CharacterBuild[] = [{
            name: 'Head HP Char',
            bestDiscSets: [],
            statPriority: {
                slot4: ['DEF%'],
                slot5: ['DEF%'],
                slot6: ['DEF%'],
                substats: {
                    weight1: ['HP'],  // Character wants flat HP!
                    weight05: []
                }
            },
            warnings: []
        }];

        const result = analyzeTraps(chars);
        // Slot 1 (fixed HP): 'HP' substat is forbidden → availTier1=[] → maxPossible=0 → critical
        // Slot 2 (fixed ATK): 'HP' available → maxPossible=1.0 < 2.0 → critical
        // Slot 3 (fixed DEF): 'HP' available → maxPossible=1.0 < 2.0 → critical
        // Slot 4 DEF%: forbidden=['DEF%'], 'HP' available → maxPossible=1.0 < 2.0 → critical
        // Slot 5 DEF%: same → critical
        // Slot 6 DEF%: same → critical
        expect(result.criticalTraps).toBe(6);
    });

    test('correctly excludes forbidden main stats for fixed slots (slot 2 excludes flat ATK)', () => {
        const chars: CharacterBuild[] = [{
            name: 'ATK Slot Char',
            bestDiscSets: [],
            statPriority: {
                slot4: ['DEF%'],
                slot5: ['DEF%'],
                slot6: ['DEF%'],
                substats: {
                    weight1: ['ATK%', 'CRIT Rate', 'atk'],  // 3 T1s including flat ATK
                    weight05: []
                }
            },
            warnings: []
        }];

        const result = analyzeTraps(chars);
        // Slot 2 (fixed ATK): 'atk' substat is forbidden → available=['atk%','crit rate']
        //   t1Count=2, maxPossible=2.0. scoreMissingOneT1=1.0 < 2.0 → tight warning.
        //
        // Slot 1 (fixed HP), Slot 3 (fixed DEF): forbidden=['hp']/['def'], all 3 T1s available
        //   t1Count=3, maxPossible=3.0. scoreMissingOneT1=2.0 → safe.
        //
        // Slot 4/5/6 DEF%: forbidden=['DEF%']. 'ATK%'/'CRIT Rate'/'atk' available.
        //   t1Count=3, maxPossible=3.0. scoreMissingOneT1=2.0 → safe.
        expect(result.criticalTraps).toBe(0);
        expect(result.tightWarnings).toBe(1);  // Only slot 2 (ATK) is tight
    });

    test('treats variable-slot ATK recommendations as ATK% without invalidating flat ATK substats', () => {
        const chars: CharacterBuild[] = [{
            name: 'ATK Percent Char',
            bestDiscSets: [],
            statPriority: {
                slot4: ['ATK%'],
                slot5: [],
                slot6: [],
                substats: {
                    weight1: ['atk', 'CRIT Rate'],  // 'atk' = flat ATK (not ATK%)
                    weight05: []
                }
            },
            warnings: []
        }];

        const result = analyzeTraps(chars);
        // Slot 4 ATK%: forbidden=['ATK%']. 'atk' (flat) and 'CRIT Rate' are available.
        //   t1Count=2, maxPossible=2.0. scoreMissingOneT1=1.0 → tight.
        // Slot 2 (fixed ATK): forbidden=['atk']. Available=['CRIT Rate'].
        //   t1Count=1, maxPossible=1.0 < 2.0 → critical.
        // Slot 1 (fixed HP), Slot 3 (fixed DEF): forbidden=['hp']/['def'].
        //   Both 'atk' and 'CRIT Rate' available. t1Count=2, maxPossible=2.0.
        //   scoreMissingOneT1=1.0 → tight.
        expect(result.criticalTraps).toBe(1);   // Slot 2: flat ATK is forbidden there
        expect(result.tightWarnings).toBe(3);   // Slot 4, Slot 1, Slot 3
    });
});
