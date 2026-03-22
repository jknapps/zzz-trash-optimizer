import * as fs from 'fs';
import { processInventory } from './process_inventory';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('processInventory abort logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should throw critical failure error when character database is empty', async () => {
        // Mock finding a ZZZ inventory file
        mockedFs.readdirSync.mockReturnValue(['ZZZScanData_20260303_210726.json'] as any);
        mockedFs.existsSync.mockReturnValue(true);

        // Mock empty character DB after validation
        mockedFs.readFileSync.mockReturnValueOnce('[]'); // DB file content
        mockedFs.readFileSync.mockReturnValueOnce('{"discs":[]}'); // Inventory file content

        // We expect processInventory to throw
        await expect(processInventory()).rejects.toThrow('CRITICAL FAILURE: No valid character builds found in database');
    });
});
