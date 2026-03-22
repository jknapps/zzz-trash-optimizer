import * as fs from 'fs';
import * as path from 'path';
import { FilterOptimizer, RelicAnalysis } from './filter_optimizer';

function debugKalpagni() {
    const valuationFile = path.join(__dirname, '../../data/disc_valuation.json');
    const relics: RelicAnalysis[] = JSON.parse(fs.readFileSync(valuationFile, 'utf-8'));
    const optimizer = new FilterOptimizer(relics);

    const set = "FangedMetal";
    const mg = ['HP%', 'DEF%'];
    const varSlots = ['4', '5', '6'];

    const res = optimizer.evaluateFilter({ sets: [set], slots: varSlots, mainStats: mg });

    console.log(`
=== DEBUG: ${set} Step ===`);
    console.log(`Set: ${set}`);
    console.log(`Main Stats: ${mg}`);
    console.log(`Total Selected: ${res.totalSelected}`);
    console.log(`Trash Caught: ${res.trashSelected}`);
    console.log(`Keeps Caught: ${res.keepsSelected}`);

    if (res.keepsSelected > 0) {
        console.log(`
ERROR: This should have been marked UNSAFE.`);
        const keep = relics.find(r => r.setKey === set && varSlots.includes(r.slotKey) && mg.includes(r.mainStatKey) && r.analysis.isKeep);
        console.log(`Example Keep: ${JSON.stringify(keep)}`);
    } else {
        console.log(`
Result: Safe for this specific set.`);
        const kTotal = relics.filter(r => r.setKey === set && varSlots.includes(r.slotKey) && mg.includes(r.mainStatKey)).length;
        console.log(`Actually found ${kTotal} items total with these stats for this set.`);
    }
}

debugKalpagni();
