import * as fs from 'fs';
import * as path from 'path';
import { CharacterBuild } from '../scraper/prydwen';
import { getForbiddenSubstatsForMain, normalizeMainStatForSlot } from '../analysis/mapping';

export interface TrapScanResult {
    criticalTraps: number;
    tightWarnings: number;
}

export function analyzeTraps(characters: CharacterBuild[]): TrapScanResult {
    let criticalTraps = 0;
    let tightWarnings = 0;

    characters.forEach(char => {
        const tier1 = char.statPriority.substats.weight1.map(s => s.toLowerCase());
        const tier05 = char.statPriority.substats.weight05.map(s => s.toLowerCase());

        // Variable slots where main stat varies
        const varSlots = ['4', '5', '6'];
        
        varSlots.forEach(slot => {
            const mainStats = (char.statPriority as any)[`slot${slot}`];
            if (!mainStats || mainStats.length === 0) return;

            mainStats.forEach((ms: string) => {
                const canonicalMain = normalizeMainStatForSlot(slot, ms);
                if (!canonicalMain) {
                    console.log(`[CRITICAL TRAP] ${char.name} | SLOT ${slot} | ${ms} | Invalid main stat recommendation`);
                    criticalTraps++;
                    return;
                }

                const forbiddenSubstats = new Set(
                    getForbiddenSubstatsForMain(slot, canonicalMain).map(s => s.toLowerCase())
                );
                const availTier1 = tier1.filter(s => !forbiddenSubstats.has(s));
                const availTier05 = tier05.filter(s => !forbiddenSubstats.has(s));

                let maxPossible = 0;
                let slotsFilled = 0;
                const t1Count = Math.min(4, availTier1.length);
                maxPossible += t1Count * 1.0;
                slotsFilled += t1Count;
                if (slotsFilled < 4) {
                    const t05Count = Math.min(4 - slotsFilled, availTier05.length);
                    maxPossible += t05Count * 0.5;
                }

                if (maxPossible < 2.0) {
                    console.log(`[CRITICAL TRAP] ${char.name} | SLOT ${slot} | ${ms} | Max achievable: ${maxPossible}`);
                    criticalTraps++;
                } else {
                    // TIGHT WARNING
                    if (availTier1.length > 0) {
                        let scoreMissingOneT1 = (t1Count - 1) * 1.0;
                        let remainingSlots = 4 - (t1Count - 1);
                        scoreMissingOneT1 += Math.min(remainingSlots, availTier05.length) * 0.5;

                        if (scoreMissingOneT1 < 2.0) {
                            console.log(`[TIGHT WARNING] ${char.name} | SLOT ${slot} | ${ms} | Max: ${maxPossible}. Missing one T1 drops to ${scoreMissingOneT1}`);
                            tightWarnings++;
                        }
                    }
                }
            });
        });

        // Fixed slots (1=HP, 2=ATK, 3=DEF) where main stat is immutable.
        const fixedSlotMains: Record<string, string> = { '1': 'HP', '2': 'ATK', '3': 'DEF' };
        Object.entries(fixedSlotMains).forEach(([slot, main]) => {
            const forbiddenSubstats = new Set(
                getForbiddenSubstatsForMain(slot, main).map(s => s.toLowerCase())
            );
            const availTier1 = tier1.filter(s => !forbiddenSubstats.has(s));
            const availTier05 = tier05.filter(s => !forbiddenSubstats.has(s));

            let maxPossible = 0;
            let slotsFilled = 0;
            const t1Count = Math.min(4, availTier1.length);
            maxPossible += t1Count * 1.0;
            slotsFilled += t1Count;
            if (slotsFilled < 4) {
                const t05Count = Math.min(4 - slotsFilled, availTier05.length);
                maxPossible += t05Count * 0.5;
            }

            if (maxPossible < 2.0) {
                console.log(`[CRITICAL TRAP] ${char.name} | SLOT ${slot} | Fixed Main (${main}) | Max achievable: ${maxPossible}`);
                criticalTraps++;
            } else if (availTier1.length > 0) {
                let scoreMissingOneT1 = (t1Count - 1) * 1.0;
                let remainingSlots = 4 - (t1Count - 1);
                scoreMissingOneT1 += Math.min(remainingSlots, availTier05.length) * 0.5;

                if (scoreMissingOneT1 < 2.0) {
                    console.log(`[TIGHT WARNING] ${char.name} | SLOT ${slot} | Fixed Main (${main}) | Max: ${maxPossible}. Missing one T1 drops to ${scoreMissingOneT1}`);
                    tightWarnings++;
                }
            }
        });
    });

    return { criticalTraps, tightWarnings };
}

export function detectTraps() {
    const dataDir = path.resolve(__dirname, '../../data');
    const dbFile = path.join(dataDir, 'prydwen_data.json');
    const characters: CharacterBuild[] = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));

    console.log(`\n=== REFINED SCORING TRAP DETECTOR ===`);
    console.log(`Scanning ${characters.length} characters for low-scoring builds...`);

    const result = analyzeTraps(characters);

    console.log(`\nScan complete:`);
    console.log(`- Critical Traps: ${result.criticalTraps}`);
    console.log(`- Tight Warnings: ${result.tightWarnings}`);
}

if (require.main === module) {
    detectTraps();
}
