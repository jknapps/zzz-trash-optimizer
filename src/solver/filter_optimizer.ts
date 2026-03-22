import { normalizeStat } from '../analysis/mapping';

export interface DiscAnalysis {
    setKey: string;
    slotKey: string;
    mainStatKey: string;
    substats: { key: string; upgrades: number }[];
    rarity: string;
    analysis: {
        isKeep: boolean;
        bestCharacter?: string;
        matchCount: number;
    }
}

// Alias kept for compatibility with generate_filters.ts references.
export type RelicAnalysis = DiscAnalysis;

export interface RelicFilter {
    slots?: string[];
    sets?: string[];
    mainStats?: string[];
    // Include mode in HSR: match if at least subStatsMinMatches selected substats are present.
    subStats?: string[];
    // Requested include threshold (k in "k-of-n"), clamped to [1, min(selected, 4)].
    subStatsMinMatches?: number;
    // Exclude mode in HSR: exclude on OR; match only if NONE are present.
    excludeSubStats?: string[];
    label?: string;
    trashCount?: number;
}

export interface OptimizerOptions {
    exhaustive: boolean;
    maxCandidates: number;
}

export interface OptimizerStats {
    candidatesTried: number;
    workItemsTried: number;
    evaluationChecks: number;
    candidateAdds: number;
}

const VALID_SLOT_MAINS: Record<string, string[]> = {
    '1': ['HP'],
    '2': ['ATK'],
    '3': ['DEF'],
    '4': ['HP%', 'ATK%', 'DEF%', 'CRIT Rate', 'CRIT DMG', 'Anomaly Proficiency'],
    '5': ['HP%', 'ATK%', 'DEF%', 'PEN Ratio', 'Electric DMG', 'Ether DMG', 'Fire DMG', 'Ice DMG', 'Physical DMG', 'Elemental DMG'],
    '6': ['HP%', 'ATK%', 'DEF%', 'Energy Regen', 'Anomaly Mastery', 'Impact']
};

const ZZZ_ELEMENTAL_DMG = ['Electric DMG', 'Ether DMG', 'Fire DMG', 'Ice DMG', 'Physical DMG'];

export class FilterOptimizer {
    constructor(private allRelics: DiscAnalysis[]) {}

    public getTrashPool(): DiscAnalysis[] {
        return this.allRelics.filter(r => !r.analysis.isKeep && r.rarity === 'S');
    }

    private getRelevantSlots(mainStats: string[]): string[] {
        const slots = ['4', '5', '6'];
        return slots.filter(slot => {
            const validMains = VALID_SLOT_MAINS[slot];
            const expandedMains = mainStats.flatMap(ms =>
                ms === 'Elemental DMG' ? ZZZ_ELEMENTAL_DMG : [ms]
            );
            return expandedMains.some(ms => validMains.includes(ms));
        });
    }

    private isMatch(relic: DiscAnalysis, filter: RelicFilter): boolean {
        const slotMatch = !filter.slots || filter.slots.includes(relic.slotKey);
        const setMatch = !filter.sets || filter.sets.includes(relic.setKey);
        const isFixedSlot = relic.slotKey === '1' || relic.slotKey === '2' || relic.slotKey === '3';
        const relicMainNormalized = normalizeStat(relic.mainStatKey);
        const relicSubSet = new Set(relic.substats.map(rs => normalizeStat(rs.key)));

        let mainMatch = true;
        if (!isFixedSlot) {
            if (filter.mainStats) {
                const expandedMains = filter.mainStats.flatMap(ms =>
                    ms === 'Elemental DMG' ? [...ZZZ_ELEMENTAL_DMG, 'Elemental DMG'] : [ms]
                );
                mainMatch = expandedMains.includes(relicMainNormalized);
            }
        } else {
            if (filter.mainStats) mainMatch = filter.mainStats.includes(relicMainNormalized);
        }

        // INCLUDE LOGIC (HSR): selected substats + required match count (k-of-n).
        let includeMatch = true;
        if (filter.subStats && filter.subStats.length > 0) {
            const selected = [...new Set(filter.subStats)];
            const maxSelectableRequired = Math.min(selected.length, 4);
            const requestedRequired = filter.subStatsMinMatches ?? maxSelectableRequired;
            const requiredMatches = Math.max(1, Math.min(requestedRequired, maxSelectableRequired));
            const matchedCount = selected.filter(s => relicSubSet.has(s)).length;
            includeMatch = matchedCount >= requiredMatches;
        }

        // EXCLUDE LOGIC (OR - "Exclude anything with any of these")
        // A relic matches the "Trash View" if it is NOT excluded.
        // It is excluded if it has ANY of the excludeSubStats.
        // So it matches if it has NONE of them.
        let excludeMatch = true;
        if (filter.excludeSubStats) {
            const hasExcludedStat = filter.excludeSubStats.some(es => 
                relicSubSet.has(es)
            );
            excludeMatch = !hasExcludedStat;
        }

        return slotMatch && setMatch && mainMatch && includeMatch && excludeMatch;
    }

    public evaluateFilter(filter: RelicFilter): { totalSelected: number; keepsSelected: number; trashSelected: number } {
        let total = 0;
        let keeps = 0;
        let trash = 0;
        for (const relic of this.allRelics) {
            if (relic.rarity !== 'S') continue;
            if (this.isMatch(relic, filter)) {
                total++;
                if (relic.analysis.isKeep) keeps++;
                else trash++;
            }
        }
        return { totalSelected: total, keepsSelected: keeps, trashSelected: trash };
    }

    public getMatchedRelics(filter: RelicFilter): DiscAnalysis[] {
        return this.allRelics.filter(r => r.rarity === 'S' && this.isMatch(r, filter));
    }

    private getCombinations(array: string[], size: number): string[][] {
        const result: string[][] = [];
        const f = (start: number, prev: string[]) => {
            if (prev.length === size) {
                result.push(prev);
                return;
            }
            for (let i = start; i < array.length; i++) f(i + 1, [...prev, array[i]]);
        };
        f(0, []);
        return result;
    }

    public findAllSafeFilters(options?: Partial<OptimizerOptions>): { filters: RelicFilter[], stats: OptimizerStats } {
        const settings: OptimizerOptions = {
            exhaustive: false,
            maxCandidates: 25000,
            ...options
        };

        const varSlots = ['4', '5', '6'];
        const fixedSlots = ['1', '2', '3'];
        const allSets = [...new Set(this.allRelics.map(r => r.setKey))];
        const allMainStats = [...new Set(this.allRelics.map(r => normalizeStat(r.mainStatKey)))];
        // Flat substats are universally bad in ZZZ — useful for exhaustive trash filters.
        const trashSubstats = ['HP', 'ATK', 'DEF'];
        
        let candidates: RelicFilter[] = [];
        let limitReached = false;
        let workItemsTried = 0;
        let evaluationChecks = 0;
        let candidateAdds = 0;

        const canDoMoreWork = () => !limitReached && workItemsTried < settings.maxCandidates;
        const markWork = () => {
            workItemsTried++;
            if (workItemsTried >= settings.maxCandidates) {
                limitReached = true;
            }
        };

        const evaluateForGeneration = (f: RelicFilter): { totalSelected: number; keepsSelected: number; trashSelected: number } | null => {
            if (!canDoMoreWork()) {
                limitReached = true;
                return null;
            }
            markWork();
            evaluationChecks++;
            return this.evaluateFilter(f);
        };

        const addCandidate = (f: RelicFilter) => {
            if (!canDoMoreWork() || candidates.length >= settings.maxCandidates) {
                limitReached = true;
                return false;
            }
            markWork();
            candidateAdds++;
            candidates.push(f);
            return true;
        };

        // --- STRATEGY 0: EXCLUDE FILTERS ---
        // "Exclude [Good Stats]" for fixed slots (1/2/3) on all sets.
        if (!limitReached) {
            const excludeGroups = [
                { stats: ['CRIT Rate', 'CRIT DMG'], label: 'Exclude CRIT' },
                { stats: ['CRIT Rate', 'CRIT DMG', 'Anomaly Proficiency'], label: 'Exclude CRIT/AnoProf' },
                { stats: ['CRIT Rate', 'CRIT DMG', 'ATK%'], label: 'Exclude CRIT/ATK%' }
            ];

            for (const eg of excludeGroups) {
                const safeSets: string[] = [];
                for (const set of allSets) {
                    const res = evaluateForGeneration({ sets: [set], slots: fixedSlots, excludeSubStats: eg.stats });
                    if (!res) break;
                    if (res.trashSelected > 0 && res.keepsSelected === 0) safeSets.push(set);
                }
                if (limitReached) break;
                if (safeSets.length > 0) {
                    if (!addCandidate({ 
                        sets: safeSets, slots: fixedSlots, excludeSubStats: eg.stats, 
                        label: `MULTI-SET (${safeSets.length} sets) | HEAD/HANDS | Exclude: [${eg.stats.join(' OR ')}]` 
                    })) break;
                }
            }
        }

        // --- STRATEGY 1: MULTI-SET AGGREGATION ---
        const mainGroups = [['HP%', 'DEF%'], ['HP%', 'DEF%', 'ATK%'], ['Elemental DMG']];
        for (const mg of mainGroups) {
            if (limitReached) break;
            const vSlots = this.getRelevantSlots(mg);
            const safeSets: string[] = [];
            for (const set of allSets) {
                const res = evaluateForGeneration({ sets: [set], slots: vSlots, mainStats: mg });
                if (!res) break;
                if (res.trashSelected > 0 && res.keepsSelected === 0) safeSets.push(set);
            }
            if (limitReached) break;
            if (safeSets.length > 0) {
                if (!addCandidate({ sets: safeSets, slots: vSlots, mainStats: mg, label: `MULTI-SET (${safeSets.length} sets) | ${vSlots.join('/')} | Main: ${mg.join('/')}` })) break;
            }
        }

        // --- STRATEGY 2: FIXED SLOT AGGREGATION ---
        // Fixed slots 1/2/3: look for discs with 2+ flat (bad) substats.
        if (!limitReached) {
            const flatPairs = this.getCombinations(['HP', 'ATK', 'DEF'], 2);
            for (const pair of flatPairs) {
                const safeSets: string[] = [];
                for (const set of allSets) {
                    const res = evaluateForGeneration({ sets: [set], slots: fixedSlots, subStats: pair });
                    if (!res) break;
                    if (res.trashSelected > 0 && res.keepsSelected === 0) safeSets.push(set);
                }
                if (limitReached) break;
                if (safeSets.length > 0) {
                    if (!addCandidate({
                        sets: safeSets,
                        slots: fixedSlots,
                        subStats: pair,
                        subStatsMinMatches: pair.length,
                        label: `MULTI-SET (${safeSets.length} sets) | SLOTS 1/2/3 | Include: [${pair.join(', ')}] | Need ${pair.length}`
                    })) break;
                }
            }
        }

        // --- STRATEGY 3: INDIVIDUAL MAIN AGGREGATED ---
        if (!limitReached) {
            for (const slot of varSlots) {
                for (const ms of allMainStats) {
                    if (!this.getRelevantSlots([ms]).includes(slot)) continue;
                    const safeSets: string[] = [];
                    for (const set of allSets) {
                        const res = evaluateForGeneration({ sets: [set], slots: [slot], mainStats: [ms] });
                        if (!res) break;
                        if (res.trashSelected > 0 && res.keepsSelected === 0) safeSets.push(set);
                    }
                    if (limitReached) break;
                    if (safeSets.length > 0) {
                        if (!addCandidate({ 
                            sets: safeSets, slots: [slot], mainStats: [ms], 
                            label: `MULTI-SET (${safeSets.length} sets) | Slot: ${slot} | Main: ${ms}` 
                        })) break;
                    }
                }
                if (limitReached) break;
            }
        }

        // --- STRATEGY 4: EXHAUSTIVE ---
        if (settings.exhaustive && !limitReached) {
            const triplets = this.getCombinations(trashSubstats, 3);
            for (const triplet of triplets) {
                if (!addCandidate({ subStats: triplet, subStatsMinMatches: triplet.length, label: `GLOBAL | Include: [${triplet.join(', ')}] | Need ${triplet.length}` })) break;
                for (const set of allSets) {
                    if (!addCandidate({ sets: [set], subStats: triplet, subStatsMinMatches: triplet.length, label: `Set: ${set} | Include: [${triplet.join(', ')}] | Need ${triplet.length}` })) break;
                }
                if (limitReached) break;
            }

            if (!limitReached) {
                const subPairs = this.getCombinations(trashSubstats, 2);
                for (const slot of varSlots) {
                    for (const ms of allMainStats) {
                        if (!this.getRelevantSlots([ms]).includes(slot)) continue;
                        for (const pair of subPairs) {
                            if (!addCandidate({
                                slots: [slot],
                                mainStats: [ms],
                                subStats: pair,
                                subStatsMinMatches: pair.length,
                                label: `GLOBAL | ${slot} ${ms} | Include: [${pair.join(', ')}] | Need ${pair.length}`
                            })) break;
                            for (const set of allSets) {
                                if (!addCandidate({
                                    sets: [set],
                                    slots: [slot],
                                    mainStats: [ms],
                                    subStats: pair,
                                    subStatsMinMatches: pair.length,
                                    label: `Set: ${set} | ${slot} ${ms} | Include: [${pair.join(', ')}] | Need ${pair.length}`
                                })) break;
                            }
                            if (limitReached) break;
                        }
                        if (limitReached) break;
                    }
                    if (limitReached) break;
                }
            }
        }

        if (limitReached) {
            console.warn(`WARNING: Search space hit ceiling (${settings.maxCandidates}). Results may be incomplete.`);
        }

        const results = candidates.map(f => ({ filter: f, res: this.evaluateFilter(f) }))
            .filter(item => item.res.trashSelected > 0 && item.res.keepsSelected === 0)
            .map(item => ({ ...item.filter, trashCount: item.res.trashSelected, label: `${item.filter.label} (Catches ${item.res.trashSelected})` }));

        return {
            filters: results.sort((a, b) => (b.trashCount || 0) - (a.trashCount || 0)),
            stats: {
                candidatesTried: candidates.length,
                workItemsTried,
                evaluationChecks,
                candidateAdds
            }
        };
    }
}
