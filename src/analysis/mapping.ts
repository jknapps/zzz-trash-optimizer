// Stat keys as used by AdeptiScanner_ZZZ (scanner keys) and Prydwen guide text (display names).
// All are normalized to a single canonical form for internal use.
export const STAT_MAP: Record<string, string> = {
    // Scanner keys (AdeptiScanner_ZZZ format)
    'hp': 'HP',
    'atk': 'ATK',
    'def': 'DEF',
    'hp_': 'HP%',
    'atk_': 'ATK%',
    'def_': 'DEF%',
    'crit_': 'CRIT Rate',
    'crit_dmg_': 'CRIT DMG',
    'anomProf': 'Anomaly Proficiency',
    'pen': 'PEN',
    'pen_': 'PEN Ratio',
    'anomMas_': 'Anomaly Mastery',
    'enerRegen_': 'Energy Regen',
    'impact_': 'Impact',
    'electric_dmg_': 'Electric DMG',
    'ether_dmg_': 'Ether DMG',
    'fire_dmg_': 'Fire DMG',
    'ice_dmg_': 'Ice DMG',
    'physical_dmg_': 'Physical DMG',
    // Canonical / guide display names (pass-through)
    'HP': 'HP',
    'ATK': 'ATK',
    'DEF': 'DEF',
    'HP%': 'HP%',
    'ATK%': 'ATK%',
    'DEF%': 'DEF%',
    'CRIT Rate': 'CRIT Rate',
    'CRIT DMG': 'CRIT DMG',
    'Anomaly Proficiency': 'Anomaly Proficiency',
    'PEN': 'PEN',
    'PEN Ratio': 'PEN Ratio',
    'Anomaly Mastery': 'Anomaly Mastery',
    'Energy Regen': 'Energy Regen',
    'Impact': 'Impact',
    'Electric DMG': 'Electric DMG',
    'Ether DMG': 'Ether DMG',
    'Fire DMG': 'Fire DMG',
    'Ice DMG': 'Ice DMG',
    'Physical DMG': 'Physical DMG',
    // Elemental DMG grouping (used in scraper / guide parsing)
    'Elemental DMG': 'Elemental DMG'
};

// Slot keys are the numeric string slots "1"-"6" used by AdeptiScanner_ZZZ.
export const SLOT_MAP: Record<string, string> = {
    '1': '1', '2': '2', '3': '3',
    '4': '4', '5': '5', '6': '6'
};

const CASE_INSENSITIVE_STAT_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(STAT_MAP).map(([key, value]) => [key.toLowerCase(), value])
);

export function normalizeStat(stat: string): string {
    const trimmed = stat.trim();
    return STAT_MAP[trimmed] || CASE_INSENSITIVE_STAT_MAP[trimmed.toLowerCase()] || trimmed;
}

// All elemental DMG types that are grouped under 'Elemental DMG' when matching filters.
const ELEMENTAL_DMG_STATS = new Set([
    'Electric DMG',
    'Ether DMG',
    'Fire DMG',
    'Ice DMG',
    'Physical DMG',
    'Elemental DMG'
]);

// Valid main stats per variable slot (slots 4, 5, 6).
// Maps guide recommendation text → canonical stat name.
const VARIABLE_SLOT_MAIN_MAP: Record<string, Record<string, string>> = {
    '4': {
        'HP': 'HP%',
        'HP%': 'HP%',
        'ATK': 'ATK%',
        'ATK%': 'ATK%',
        'DEF': 'DEF%',
        'DEF%': 'DEF%',
        'CRIT Rate': 'CRIT Rate',
        'CRIT DMG': 'CRIT DMG',
        'Anomaly Proficiency': 'Anomaly Proficiency'
    },
    '5': {
        'HP': 'HP%',
        'HP%': 'HP%',
        'ATK': 'ATK%',
        'ATK%': 'ATK%',
        'DEF': 'DEF%',
        'DEF%': 'DEF%',
        'PEN Ratio': 'PEN Ratio',
        'Elemental DMG': 'Elemental DMG'
    },
    '6': {
        'HP': 'HP%',
        'HP%': 'HP%',
        'ATK': 'ATK%',
        'ATK%': 'ATK%',
        'DEF': 'DEF%',
        'DEF%': 'DEF%',
        'Energy Regen': 'Energy Regen',
        'Anomaly Mastery': 'Anomaly Mastery',
        'Impact': 'Impact'
    }
};

// Fixed slots: slot 1 = HP, slot 2 = ATK, slot 3 = DEF (always).
const FIXED_SLOT_MAIN_MAP: Record<string, Record<string, string>> = {
    '1': { 'HP': 'HP' },
    '2': { 'ATK': 'ATK' },
    '3': { 'DEF': 'DEF' }
};

export function normalizeSlot(slot: string): string {
    return SLOT_MAP[slot] || slot.trim();
}

function normalizeMainToken(stat: string): string {
    const normalized = normalizeStat(stat);
    if (ELEMENTAL_DMG_STATS.has(normalized)) {
        return 'Elemental DMG';
    }
    return normalized;
}

export function normalizeMainStatForSlot(slot: string, stat: string): string | null {
    const slotKey = normalizeSlot(slot);
    const normalized = normalizeMainToken(stat);

    if (slotKey === '1' || slotKey === '2' || slotKey === '3') {
        return FIXED_SLOT_MAIN_MAP[slotKey]?.[normalized] ?? null;
    }

    return VARIABLE_SLOT_MAIN_MAP[slotKey]?.[normalized] ?? null;
}

export function normalizeGuideMainStatsForSlot(slot: string, stats: string[]): { normalized: string[]; invalid: string[] } {
    const normalized = new Set<string>();
    const invalid: string[] = [];

    for (const stat of stats) {
        const canonical = normalizeMainStatForSlot(slot, stat);
        if (!canonical) {
            invalid.push(stat);
            continue;
        }
        normalized.add(canonical);
    }

    return { normalized: [...normalized], invalid };
}

export function areMainStatsEquivalent(slot: string, left: string, right: string): boolean {
    const leftNormalized = normalizeMainStatForSlot(slot, left);
    const rightNormalized = normalizeMainStatForSlot(slot, right);
    return leftNormalized !== null && leftNormalized === rightNormalized;
}

export function getForbiddenSubstatsForMain(slot: string, stat: string): string[] {
    const slotKey = normalizeSlot(slot);
    const normalized = normalizeMainStatForSlot(slotKey, stat);

    if (!normalized) return [];

    // Fixed slots: the flat version of the main stat cannot appear as a substat.
    if (slotKey === '1') return ['HP'];
    if (slotKey === '2') return ['ATK'];
    if (slotKey === '3') return ['DEF'];

    // Variable slots: the % version of the main stat cannot appear as a substat.
    if (normalized === 'HP%') return ['HP%'];
    if (normalized === 'ATK%') return ['ATK%'];
    if (normalized === 'DEF%') return ['DEF%'];
    if (normalized === 'CRIT Rate') return ['CRIT Rate'];
    if (normalized === 'CRIT DMG') return ['CRIT DMG'];
    // Anomaly Proficiency can appear as both main (slot 4) and substat.
    if (normalized === 'Anomaly Proficiency') return ['Anomaly Proficiency'];

    // PEN Ratio, Elemental DMG, Energy Regen, Anomaly Mastery, Impact
    // are not available as substats, so no conflict possible.
    return [];
}

/**
 * Normalize a disc set key or display name to a lowercase alphanumeric form
 * for loose comparison between scanner keys (e.g. "BranchBladeSong") and
 * Prydwen display names (e.g. "Branch & Blade Song").
 */
export function normalizeSetKey(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
