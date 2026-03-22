import * as fs from 'fs';
import * as path from 'path';
import { RelicAnalysis } from './filter_optimizer';

function diagnostic() {
    const valuationFile = path.join(__dirname, '../../data/disc_valuation.json');
    const relics: RelicAnalysis[] = JSON.parse(fs.readFileSync(valuationFile, 'utf-8'));
    
    const trashSubstats = ['HP', 'ATK', 'DEF'];
    
    // Find KEEPS that have at least one flat stat
    const endangeredKeeps = relics.filter(r => 
        r.analysis.isKeep && 
        r.substats.some(s => trashSubstats.includes(s.key))
    );

    console.log(`
=== SAFETY DIAGNOSTIC ===`);
    console.log(`If you checked Flat HP, ATK, and DEF globally:`);
    console.log(`- Total KEEPS in danger: ${endangeredKeeps.length}`);
    
    console.log(`
Example of a "KEEP" item that would be trashed:`);
    if (endangeredKeeps.length > 0) {
        const example = endangeredKeeps[0];
        console.log(`Set: ${example.setKey}`);
        console.log(`Main Stat: ${example.mainStatKey}`);
        console.log(`Substats: ${JSON.stringify(example.substats)}`);
        console.log(`Best Character: ${example.analysis.bestCharacter} (Score: ${example.analysis.matchCount})`);
    }
}

diagnostic();
