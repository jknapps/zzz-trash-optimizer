import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getInventoryArg, normalizeAndValidateDiscs, resolveInventoryFile, validateCharacterDatabase } from './process_inventory';

describe('process_inventory validation', () => {
    test('validates character DB shape', () => {
        const valid = [{
            name: 'Char',
            bestDiscSets: ['chaoticmetal'],
            statPriority: {
                slot4: ['CRIT Rate', 'CRIT DMG'],
                slot5: ['Ether DMG'],
                slot6: ['ATK%'],
                substats: { weight1: ['CRIT Rate'], weight05: [] }
            }
        }];

        expect(validateCharacterDatabase(valid)).toHaveLength(1);

        const incomplete = [{
            ...valid[0],
            bestDiscSets: []
        }];
        expect(validateCharacterDatabase(incomplete)).toHaveLength(0);

        // Invalid entries are skipped with a warning, not thrown
        const invalid = [{ name: 'bad' }];
        expect(validateCharacterDatabase(invalid)).toHaveLength(0);
    });

    test('validates and normalizes disc inventory rows', () => {
        const valid = {
            discs: [{
                setKey: ' ChaoticMetal ',
                slotKey: ' 4 ',
                mainStatKey: ' crit_ ',
                substats: [{ key: ' crit_dmg_ ', upgrades: 2 }],
                rarity: 'S',
                level: 15
            }]
        };

        const out = normalizeAndValidateDiscs(valid);
        expect(out[0].setKey).toBe('ChaoticMetal');
        expect(out[0].slotKey).toBe('4');
        expect(out[0].mainStatKey).toBe('crit_');
        expect(out[0].substats).toEqual([{ key: 'crit_dmg_', upgrades: 2 }]);
        expect(() => normalizeAndValidateDiscs({ discs: [{}] })).toThrow(/Invalid disc entries/);
    });

    test('resolves explicit inventory args before falling back to latest file discovery', () => {
        expect(getInventoryArg(['node', 'script', '--inventory=data/custom.json'])).toBe('data/custom.json');

        // Use os.tmpdir() for a real platform-compatible absolute path
        const absPath = path.join(os.tmpdir(), 'custom.json');
        expect(resolveInventoryFile(os.tmpdir(), 'custom.json')).toBe(path.resolve(os.tmpdir(), 'custom.json'));
        expect(resolveInventoryFile(os.tmpdir(), absPath)).toBe(absPath);
    });

    test('resolves bare inventory filenames from disc-jsons when present', () => {
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zzz-resolve-'));
        const inventoryDir = path.join(projectRoot, 'disc-jsons');
        const inventoryPath = path.join(inventoryDir, 'scan.ZOD.json');

        fs.mkdirSync(inventoryDir, { recursive: true });
        fs.writeFileSync(inventoryPath, '{}');

        expect(resolveInventoryFile(projectRoot, 'scan.ZOD.json')).toBe(inventoryPath);
    });
});
