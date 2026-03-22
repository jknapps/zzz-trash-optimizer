import { PrydwenScraper } from './prydwen';

const MOCK_HTML = `
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
                    <p>CRIT Rate = CRIT DMG > ATK%</p>
                </div>
            </div>
        </body>
    </html>
`;

describe('PrydwenScraper', () => {
    const scraper = new PrydwenScraper();

    it('should parse character name correctly', () => {
        const build = scraper.parseCharacterPage(MOCK_HTML);
        expect(build.name).toBe('Zhu Yuan');
    });

    it('should parse disc sets correctly', () => {
        const build = scraper.parseCharacterPage(MOCK_HTML);
        expect(build.bestDiscSets).toContain('chaoticmetal');
        expect(build.bestDiscSets).toContain('branchbladesong');
    });

    it('should parse main stats correctly', () => {
        const build = scraper.parseCharacterPage(MOCK_HTML);
        expect(build.statPriority.slot4).toEqual(['CRIT Rate', 'CRIT DMG']);
        // "Ether DMG" should be normalized to "Elemental DMG" by the scraper logic
        expect(build.statPriority.slot5).toEqual(['Elemental DMG']);
        expect(build.statPriority.slot6).toEqual(['ATK%']);
    });

    it('should parse substat tiers correctly', () => {
        const build = scraper.parseCharacterPage(MOCK_HTML);
        // "CRIT Rate = CRIT DMG > ATK%"
        // Tier 1: CRIT Rate, CRIT DMG
        // Tier 2: ATK%
        expect(build.statPriority.substats.weight1).toContain('CRIT Rate');
        expect(build.statPriority.substats.weight1).toContain('CRIT DMG');
        expect(build.statPriority.substats.weight05).toEqual(['ATK%']);
    });

    it('should capture raw substat lines for audit output', () => {
        const parsed = scraper.parseCharacterPageDetailed(MOCK_HTML);

        expect(parsed.substatDebug.rawLines).toEqual(['CRIT Rate = CRIT DMG > ATK%']);
        expect(parsed.substatDebug.parsedSubstats).toEqual(parsed.build.statPriority.substats);
    });

    it('should recognize shorthand aliases and ignore parenthetical notes', () => {
        const html = `
            <html>
                <head><title>Nicole Guide and Build</title></head>
                <body>
                    <div class="build-tips">
                        <h6>Best Disk Drives Sets</h6>
                        <img alt="Chaotic Metal" />
                        <div class="main-stats">
                            <div class="box">
                                <strong>Disk 4</strong>
                                <div class="list-stats">
                                    <div class="zzz-stat"><img alt="CRIT Rate" /></div>
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
                            <p>CRIT Rate = CRIT DMG > ATK% (If Needed) = Anomaly Proficiency</p>
                        </div>
                    </div>
                </body>
            </html>
        `;

        const parsed = scraper.parseCharacterPageDetailed(html);

        expect(parsed.build.statPriority.substats.weight1).toContain('CRIT Rate');
        expect(parsed.build.statPriority.substats.weight1).toContain('CRIT DMG');
        expect(parsed.substatDebug.unknownTokens).toEqual([]);
    });

    it('should report warnings for missing sections', () => {
        const badHtml = '<html><body><h1>No Data</h1></body></html>';
        const build = scraper.parseCharacterPage(badHtml);
        expect(build.warnings).toBeDefined();
        expect(build.warnings?.length).toBeGreaterThan(0);
        expect(build.warnings).toContain('No disc sets found');
    });

    it('should parse current main-stats layout with Disk 4/5/6 headers', () => {
        const html = `
            <html>
                <head><title>Ellen Joe Guide and Build</title></head>
                <body>
                    <div class="build-tips">
                        <h6>Best Disk Drives Sets</h6>
                        <img alt="Polar Metal" />
                        <div class="main-stats">
                            <div class="box">
                                <strong>Disk 4</strong>
                                <div class="list-stats">
                                    <div class="zzz-stat"><img alt="" /><img alt="CRIT Rate" /></div>
                                </div>
                            </div>
                            <div class="box">
                                <strong>Disk 5</strong>
                                <div class="list-stats">
                                    <div class="zzz-stat"><img alt="Ice DMG" /></div>
                                    <div class="zzz-stat"><img alt="ATK%" /></div>
                                </div>
                            </div>
                            <div class="box">
                                <strong>Disk 6</strong>
                                <div class="list-stats">
                                    <div class="zzz-stat"><img alt="ATK%" /></div>
                                    <div class="zzz-stat"><img alt="Energy Regen" /></div>
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
        expect(build.statPriority.slot4).toEqual(['CRIT Rate']);
        expect(build.statPriority.slot5).toEqual(['Elemental DMG', 'ATK%']);
        expect(build.statPriority.slot6).toEqual(['ATK%', 'Energy Regen']);
    });

    it('should parse character list links for ZZZ characters', () => {
        const indexHtml = `
            <html>
                <body>
                    <a href="/zenless/characters/zhu-yuan">Zhu Yuan</a>
                    <a href="/zenless/characters/ellen-joe">Ellen Joe</a>
                    <a href="/zenless/characters/">Characters</a>
                    <a href="/zenless/characters/tier-list">Tier List</a>
                    <a href="/hsr/characters/some-char">HSR Char</a>
                </body>
            </html>
        `;

        const links = scraper.parseCharacterList(indexHtml);
        expect(links).toContain('https://www.prydwen.gg/zenless/characters/zhu-yuan');
        expect(links).toContain('https://www.prydwen.gg/zenless/characters/ellen-joe');
        expect(links).not.toContain('https://www.prydwen.gg/zenless/characters/');
        expect(links).not.toContain('https://www.prydwen.gg/zenless/characters/tier-list');
        // HSR links should not match the ZZZ selector
        expect(links.some(l => l.includes('/hsr/'))).toBe(false);
    });
});
