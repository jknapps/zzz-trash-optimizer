import {
    areMainStatsEquivalent,
    getForbiddenSubstatsForMain,
    normalizeGuideMainStatsForSlot,
    normalizeMainStatForSlot
} from './mapping';

describe('stat normalization', () => {
    test('normalizes variable-slot guide shorthand to percentage mains', () => {
        expect(normalizeMainStatForSlot('4', 'ATK')).toBe('ATK%');
        expect(normalizeMainStatForSlot('5', 'HP')).toBe('HP%');
        expect(normalizeMainStatForSlot('6', 'DEF')).toBe('DEF%');
    });

    test('keeps fixed-slot mains flat', () => {
        expect(normalizeMainStatForSlot('1', 'HP')).toBe('HP');
        expect(normalizeMainStatForSlot('2', 'ATK')).toBe('ATK');
        expect(normalizeMainStatForSlot('3', 'DEF')).toBe('DEF');
    });

    test('collapses elemental DMG types and scanner key aliases', () => {
        // All elemental DMG types collapse to Elemental DMG on slot 5
        expect(normalizeMainStatForSlot('5', 'Ether DMG')).toBe('Elemental DMG');
        expect(normalizeMainStatForSlot('5', 'ether_dmg_')).toBe('Elemental DMG');
        // Scanner key for Energy Regen
        expect(normalizeMainStatForSlot('6', 'enerRegen_')).toBe('Energy Regen');
        // CRIT Rate scanner key on slot 4
        expect(normalizeMainStatForSlot('4', 'crit_')).toBe('CRIT Rate');
    });

    test('matches guide shorthand to inventory export mains exactly by slot family', () => {
        expect(areMainStatsEquivalent('4', 'ATK', 'atk_')).toBe(true);
        expect(areMainStatsEquivalent('6', 'HP', 'hp_')).toBe(true);
        expect(areMainStatsEquivalent('5', 'Elemental DMG', 'fire_dmg_')).toBe(true);
        expect(areMainStatsEquivalent('4', 'ATK', 'hp_')).toBe(false);
    });

    test('rejects impossible variable-slot mains after normalization', () => {
        // PEN Ratio is only valid on slot 5, not slot 4
        expect(normalizeMainStatForSlot('4', 'PEN Ratio')).toBeNull();
        const { normalized, invalid } = normalizeGuideMainStatsForSlot('4', ['ATK', 'PEN Ratio']);
        expect(normalized).toEqual(['ATK%']);
        expect(invalid).toEqual(['PEN Ratio']);
    });

    test('only forbids the exact impossible substat for a main stat', () => {
        expect(getForbiddenSubstatsForMain('4', 'ATK')).toEqual(['ATK%']);
        expect(getForbiddenSubstatsForMain('4', 'HP')).toEqual(['HP%']);
        expect(getForbiddenSubstatsForMain('1', 'HP')).toEqual(['HP']);
        expect(getForbiddenSubstatsForMain('5', 'Elemental DMG')).toEqual([]);
    });
});
