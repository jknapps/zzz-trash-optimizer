import * as fs from 'fs';
import * as path from 'path';
import { normalizeAndValidateDiscs, findLatestInventoryInProject } from './process_inventory';
import { normalizeMainStatForSlot } from './mapping';

const projectRoot = path.resolve(__dirname, '../..');
const inventoryPath = findLatestInventoryInProject(projectRoot);

if (inventoryPath && fs.existsSync(inventoryPath)) {
    describe('live inventory schema', () => {
        const raw = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));
        const discs = normalizeAndValidateDiscs(raw);

        test('matches the expected top-level and disc schema', () => {
            expect(raw).toHaveProperty('discs');
            expect(Array.isArray(raw.discs)).toBe(true);
            expect(discs.length).toBeGreaterThan(0);
        });

        test('uses the expected live slot domain', () => {
            const slots = [...new Set(discs.map(d => d.slotKey))].sort();
            expect(slots).toEqual(['1', '2', '3', '4', '5', '6']);
        });

        test('normalizes live variable-slot main stats to their canonical families', () => {
            const slot4Discs = discs.filter(d => d.slotKey === '4');
            const slot5Discs = discs.filter(d => d.slotKey === '5');
            const slot6Discs = discs.filter(d => d.slotKey === '6');

            expect(slot4Discs.length).toBeGreaterThan(0);
            expect(slot5Discs.length).toBeGreaterThan(0);
            expect(slot6Discs.length).toBeGreaterThan(0);

            const allVarDiscs = [...slot4Discs, ...slot5Discs, ...slot6Discs];
            const allNormalize = allVarDiscs.every(d => {
                const normalized = normalizeMainStatForSlot(d.slotKey, d.mainStatKey);
                return normalized !== null;
            });
            expect(allNormalize).toBe(true);
        });
    });
} else {
    test.skip('live inventory schema (no inventory file found)', () => {});
}
