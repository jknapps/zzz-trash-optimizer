import { CharacterBuild } from '../scraper/prydwen';
import {
    areMainStatsEquivalent,
    getForbiddenSubstatsForMain,
    normalizeMainStatForSlot,
    normalizeSlot,
    normalizeStat
} from './mapping';

export interface Disc {
    setKey: string;
    slotKey: string;
    mainStatKey: string;
    substats: { key: string; upgrades: number }[];
    rarity: string;  // 'S', 'A', 'B'
    level: number;
}

export interface ScoreResult {
    isKeep: boolean;
    bestCharacter?: string;
    matchCount: number;
}

export interface ScorerOptions {
    policy: 'conservative' | 'strict';
}

export class DiscScorer {
    private options: ScorerOptions;

    constructor(private characterDatabase: CharacterBuild[], options?: Partial<ScorerOptions>) {
        this.options = {
            policy: 'conservative',
            ...options
        };
    }

    private isMainStatMatch(slotKey: string, recommendedMainStats: string[], discMainStat: string): boolean {
        // Fixed slots (1=HP, 2=ATK, 3=DEF) always pass the main stat check.
        if (slotKey === '1' || slotKey === '2' || slotKey === '3') {
            return true;
        }
        return recommendedMainStats.some((recommended: string) =>
            areMainStatsEquivalent(slotKey, recommended, discMainStat)
        );
    }

    public scoreDisc(disc: Disc): ScoreResult {
        // Only score S-rank discs.
        if (disc.rarity !== 'S') return { isKeep: false, matchCount: 0 };

        let bestScore = -1;
        let bestChar = '';

        const slotKey = normalizeSlot(disc.slotKey);
        const mainStatNormalized = normalizeMainStatForSlot(slotKey, disc.mainStatKey);

        if (!mainStatNormalized) {
            return { isKeep: false, matchCount: 0 };
        }

        const discSetNormalized = disc.setKey.toLowerCase().replace(/[^a-z0-9]/g, '');

        for (const char of this.characterDatabase) {
            // bestDiscSets are already stored as normalized keys.
            const isSetMatch = char.bestDiscSets.includes(discSetNormalized);
            if (!isSetMatch) continue;

            const slotStatKey = `slot${slotKey}` as 'slot4' | 'slot5' | 'slot6';
            const recommendedMainStats = (char.statPriority as any)[slotStatKey] || [];
            const isMainMatch = this.isMainStatMatch(slotKey, recommendedMainStats, mainStatNormalized);
            if (!isMainMatch) continue;

            let currentScore = 0;
            disc.substats.forEach(s => {
                // Flat HP/ATK/DEF are universally poor substats — skip scoring them.
                if (['HP', 'ATK', 'DEF'].includes(normalizeStat(s.key))) return;
                const normalizedSub = normalizeStat(s.key);

                if (char.statPriority.substats.weight1.includes(normalizedSub)) {
                    currentScore += 1.0;
                } else if (char.statPriority.substats.weight05.includes(normalizedSub)) {
                    currentScore += 0.5;
                }
            });

            // Calculate threshold based on policy.
            let charThreshold = 2.0;

            if (this.options.policy === 'conservative') {
                const tier1 = char.statPriority.substats.weight1.map(s => s.toLowerCase());
                const tier05 = char.statPriority.substats.weight05.map(s => s.toLowerCase());
                const forbiddenSubstats = new Set(
                    getForbiddenSubstatsForMain(slotKey, mainStatNormalized).map(s => s.toLowerCase())
                );
                const availTier1 = tier1.filter(s => !forbiddenSubstats.has(s));
                const availTier05 = tier05.filter(s => !forbiddenSubstats.has(s));

                const t1Count = Math.min(4, availTier1.length);
                const t05Count = Math.min(4 - t1Count, availTier05.length);
                const maxPossible = t1Count * 1.0 + t05Count * 0.5;

                let isTightBuild = false;
                if (availTier1.length > 0) {
                    let scoreMissingOneT1 = (t1Count - 1) * 1.0;
                    const remainingSlots = 4 - (t1Count - 1);
                    scoreMissingOneT1 += Math.min(remainingSlots, availTier05.length) * 0.5;
                    isTightBuild = scoreMissingOneT1 < 2.0;
                }

                if (maxPossible < 2.0 || isTightBuild) {
                    charThreshold = 1.0;
                }

                // Critical main stat protections for rare/hard-to-roll mains.
                if (slotKey === '4' && (mainStatNormalized === 'CRIT Rate' || mainStatNormalized === 'CRIT DMG')) {
                    charThreshold = Math.min(charThreshold, 1.0);
                }
                if (slotKey === '5' && mainStatNormalized === 'PEN Ratio') {
                    charThreshold = Math.min(charThreshold, 1.0);
                }
                if (slotKey === '6' && (mainStatNormalized === 'Energy Regen' || mainStatNormalized === 'Anomaly Mastery' || mainStatNormalized === 'Impact')) {
                    charThreshold = Math.min(charThreshold, 1.0);
                }
            }

            if (currentScore >= charThreshold) {
                if (currentScore > bestScore) {
                    bestScore = currentScore;
                    bestChar = char.name;
                }
            }
        }

        const isKeep = bestScore > -1;
        return { isKeep, bestCharacter: bestChar, matchCount: bestScore };
    }
}
