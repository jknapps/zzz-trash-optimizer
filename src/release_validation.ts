import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateCharacterDatabase } from './analysis/process_inventory';
import { areMainStatsEquivalent, normalizeMainStatForSlot } from './analysis/mapping';
import { DiscScorer } from './analysis/scorer';
import { PrydwenScraper, CharacterBuild } from './scraper/prydwen';
import { runCrawler } from './scraper/crawler';
import { analyzeTraps } from './solver/trap_detector';

function buildCharacter(overrides?: Partial<CharacterBuild>): CharacterBuild {
    return {
        name: 'Validator',
        bestDiscSets: ['seta'],  // normalizeSetKey('Set A')
        statPriority: {
            slot4: ['CRIT Rate', 'CRIT DMG'],
            slot5: ['Elemental DMG', 'ATK%'],
            slot6: ['ATK%'],
            substats: {
                weight1: ['CRIT Rate', 'CRIT DMG', 'ATK%'],
                weight05: ['Anomaly Proficiency']
            }
        },
        warnings: [],
        ...overrides
    };
}

function assertCurrentLayoutParsing(scraper: PrydwenScraper) {
    const html = `
        <html>
            <head><title>Zhu Yuan Guide and Build</title></head>
            <body>
                <div class="build-tips">
                    <h6>Best Disk Drives Sets</h6>
                    <img alt="Chaotic Metal" />
                    <img alt="Branch Blade Song" />
                    <div class="main-stats">
                        <div class="box">
                            <strong>Disk 4</strong>
                            <div class="list-stats">
                                <div class="zzz-stat"><img alt="CRIT Rate" /></div>
                                <div class="zzz-stat"><img alt="CRIT DMG" /></div>
                            </div>
                        </div>
                        <div class="box">
                            <strong>Disk 5</strong>
                            <div class="list-stats">
                                <div class="zzz-stat"><img alt="Ether DMG" /></div>
                            </div>
                        </div>
                        <div class="box">
                            <strong>Disk 6</strong>
                            <div class="list-stats">
                                <div class="zzz-stat"><img alt="ATK%" /></div>
                            </div>
                        </div>
                    </div>
                    <div class="sub-stats">
                        <p>CRIT Rate > CRIT DMG = ATK%</p>
                    </div>
                </div>
            </body>
        </html>
    `;

    const build = scraper.parseCharacterPage(html);
    assert.deepStrictEqual(build.statPriority.slot4, ['CRIT Rate', 'CRIT DMG']);
    assert.deepStrictEqual(build.statPriority.slot5, ['Elemental DMG']);
    assert.deepStrictEqual(build.statPriority.slot6, ['ATK%']);
    assert.ok(build.bestDiscSets.length > 0, 'Expected disc sets to be parsed');
}

function assertStatNormalization() {
    assert.strictEqual(normalizeMainStatForSlot('4', 'ATK'), 'ATK%');
    assert.strictEqual(normalizeMainStatForSlot('6', 'HP'), 'HP%');
    assert.strictEqual(areMainStatsEquivalent('4', 'ATK', 'ATK%'), true);
    assert.strictEqual(areMainStatsEquivalent('1', 'HP', 'ATK'), false);
}

function assertScorerBehavior() {
    const scorer = new DiscScorer([buildCharacter()]);
    const keepDisc = {
        setKey: 'SetA',          // normalizes to 'seta' — matches buildCharacter's 'seta'
        slotKey: '4',
        mainStatKey: 'atk_',     // ATK%
        substats: [
            { key: 'crit_', upgrades: 2 },
            { key: 'crit_dmg_', upgrades: 2 }
        ],
        rarity: 'S',
        level: 15
    };
    const trashDisc = {
        ...keepDisc,
        mainStatKey: 'def_'      // DEF% — not recommended
    };

    assert.strictEqual(scorer.scoreDisc(keepDisc).isKeep, true);
    assert.strictEqual(scorer.scoreDisc(trashDisc).isKeep, false);
}

function assertCharacterValidation() {
    const valid = buildCharacter();
    const invalid = buildCharacter({
        name: 'Incomplete',
        statPriority: {
            slot4: [],
            slot5: [],
            slot6: [],
            substats: {
                weight1: ['CRIT Rate'],
                weight05: []
            }
        }
    });

    const result = validateCharacterDatabase([valid, invalid]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'Validator');
}

function assertTrapDetection() {
    const trapChar = buildCharacter({
        name: 'Trap',
        statPriority: {
            slot4: ['HP%'],
            slot5: ['Elemental DMG'],
            slot6: ['ATK%'],
            substats: {
                weight1: ['HP%'],
                weight05: []
            }
        }
    });

    const result = analyzeTraps([trapChar]);
    assert.ok(result.criticalTraps > 0);
}

async function assertCrawlerAtomicity() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zzz-opt-release-'));
    const outputFile = path.join(tempDir, 'prydwen_data.json');
    const previousData = [buildCharacter({ name: 'Existing' })];
    fs.writeFileSync(outputFile, JSON.stringify(previousData, null, 2));

    await runCrawler({
        dataDir: tempDir,
        scraper: {
            parseCharacterList: () => ['https://example.test/char'],
            parseCharacterPage: () => buildCharacter({
                name: 'Broken',
                bestDiscSets: [],
                statPriority: {
                    slot4: [],
                    slot5: [],
                    slot6: [],
                    substats: {
                        weight1: [],
                        weight05: []
                    }
                }
            })
        },
        deps: {
            httpGet: async (url: string) => ({ data: url.includes('/characters/') ? '<html></html>' : '<html></html>' }),
            sleep: async () => undefined,
            log: () => undefined,
            error: () => undefined
        }
    });

    const finalData = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    assert.deepStrictEqual(finalData, previousData);
    assert.ok(fs.existsSync(path.join(tempDir, 'prydwen_data.partial.json')));
}

export async function runReleaseValidation() {
    const scraper = new PrydwenScraper();
    assertCurrentLayoutParsing(scraper);
    assertStatNormalization();
    assertScorerBehavior();
    assertCharacterValidation();
    assertTrapDetection();
    await assertCrawlerAtomicity();
    console.log('Release validation checks passed.');
}

if (require.main === module) {
    runReleaseValidation().catch(err => {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    });
}
