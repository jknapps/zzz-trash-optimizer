import * as fs from 'fs';
import * as path from 'path';
import { resolveInventoryFile } from '../analysis/process_inventory';

function validateRelicIntegrity() {
    const projectRoot = path.join(__dirname, '../../');
    const inventoryFile = resolveInventoryFile(projectRoot);

    if (!inventoryFile) {
        console.error("No inventory file found.");
        return;
    }

    console.log(`Validating integrity for: ${inventoryFile}`);
    const data = JSON.parse(fs.readFileSync(inventoryFile, 'utf-8'));
    const relics = data.relics || [];

    let missingMain = 0;
    let lessThanFour = 0;
    let exactlyThree = 0;
    let total = relics.length;

    relics.forEach((r: any, idx: number) => {
        // 1. Check Main Stat
        if (!r.mainstat || r.mainstat.trim() === "") {
            missingMain++;
            console.log(`[FAIL] Relic ${idx} (${r.name}): Missing Main Stat`);
        }

        // 2. Check Substats
        const subCount = (r.substats ? r.substats.length : 0) + (r.unactivated_substats ? r.unactivated_substats.length : 0);
        if (subCount < 4) {
            lessThanFour++;
            if (subCount === 3) exactlyThree++;
            
            // Only log if it's really weird (like 0, 1, or 2 subs)
            if (subCount < 3) {
                console.log(`[FAIL] Relic ${idx} (${r.name}): Only has ${subCount} substats!`);
            }
        }
    });

    console.log(`
=== INTEGRITY REPORT ===`);
    console.log(`Total Relics Scanned: ${total}`);
    console.log(`- Missing Main Stat:  ${missingMain}`);
    console.log(`- Fewer than 4 subs:  ${lessThanFour}`);
    console.log(`  - Exactly 3 subs:   ${exactlyThree}`);
    console.log(`  - 2 or fewer subs:  ${lessThanFour - exactlyThree}`);
    
    if (missingMain === 0 && (lessThanFour - exactlyThree) === 0) {
        console.log(`
Result: Data is structurally sound. (3-substat relics are normal for unlevelled 5-stars).`);
    } else {
        console.log(`
Result: structural issues detected.`);
    }
}

validateRelicIntegrity();
