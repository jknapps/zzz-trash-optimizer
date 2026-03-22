import { getChronoSortIndex, DISC_CHRONO_ORDER } from './chrono_order';

describe('getChronoSortIndex', () => {
    test('matches exact set names case-insensitively', () => {
        const idx = getChronoSortIndex('woodpecker electro');
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(DISC_CHRONO_ORDER.length);
    });

    test('does not use loose substring matches', () => {
        expect(getChronoSortIndex('Electro')).toBe(999);
    });
});
