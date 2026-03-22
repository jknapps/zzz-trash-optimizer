import * as cheerio from 'cheerio';
import * as fs from 'fs';
import { normalizeGuideMainStatsForSlot, normalizeSetKey } from '../analysis/mapping';
import {
    CharacterSubstatDebug,
    parseSubstatLines
} from './substat_debug';

export interface StatPriority {
    slot4: string[];
    slot5: string[];
    slot6: string[];
    substats: {
        weight1: string[];
        weight05: string[];
    };
}

export interface CharacterBuild {
    name: string;
    // All disc set keys appearing in any recommended build combination,
    // normalized to lowercase alphanumeric for matching against scanner setKey values.
    bestDiscSets: string[];
    statPriority: StatPriority;
    warnings?: string[];
}

export interface ParsedCharacterPageDetailed {
    build: CharacterBuild;
    substatDebug: CharacterSubstatDebug;
}

const ELEMENTAL_DMG_STATS = [
    'Electric DMG', 'Ether DMG', 'Fire DMG', 'Ice DMG', 'Physical DMG'
];

export class PrydwenScraper {
    public parseCharacterList(html: string): string[] {
        const $ = cheerio.load(html);
        const links: string[] = [];
        $('a[href^="/zenless/characters/"]').each((_, el) => {
            let href = $(el).attr('href');
            if (href && !href.includes('tier-list') && href !== '/zenless/characters/') {
                href = href.endsWith('/') ? href.slice(0, -1) : href;
                links.push(`https://www.prydwen.gg${href}`);
            }
        });
        return [...new Set(links)];
    }

    public parseCharacterPageDetailed(html: string): ParsedCharacterPageDetailed {
        const $ = cheerio.load(html);
        const warnings: string[] = [];

        // --- Character name ---
        const title = $('title').text();
        const nameMatch = title.match(/^(.*?)(?:\s+Guide|\s+Build)/);
        let charName = nameMatch ? nameMatch[1].trim() : $('h1').first().text().trim();
        charName = charName.replace(/\s*(Guide|Build).*$/i, '').trim();
        if (!charName) warnings.push('Character name not found');

        // --- Disc sets ---
        // Prydwen ZZZ shows disc set recommendations inside build sections with set images.
        // We collect all unique set display names and normalize for scanner key matching.
        const bestDiscSets: Set<string> = new Set();
        const buildSection = $('.build-tips');
        const setContainer = buildSection.length ? buildSection : $('body');

        // Find the disc drives section header, then collect images beneath it
        const discSectionHeader = setContainer.find('h6, .content-header').filter((_, el) => {
            const t = $(el).text().toLowerCase();
            return t.includes('disk') || t.includes('disc') || t.includes('drive');
        }).first();

        // On live Prydwen pages, the disc header is a sibling of the disc section div,
        // not its parent. Use the next sibling .build-tips if present; fall back to parent
        // for simpler structures (e.g. test HTML where images are siblings of the header).
        const discSection = discSectionHeader.length
            ? (discSectionHeader.next('.build-tips').length
                ? discSectionHeader.next('.build-tips')
                : discSectionHeader.parent())
            : setContainer;

        discSection.find('img[alt]').each((_, el) => {
            const alt = $(el).attr('alt') || '';
            if (!alt || alt.length <= 2) return;
            const lower = alt.toLowerCase();
            // Skip stat icons and other non-set images
            if (lower.includes('dmg') || lower.includes('%') || lower.includes(' rate') ||
                lower.includes('ratio') || lower.includes('mastery') || lower.includes('proficiency') ||
                lower.includes('regen') || lower.includes('impact') || lower.includes('atk') ||
                lower.includes(' def') || alt === 'HP' || lower.startsWith('hp') ||
                lower.includes('w-engine') || lower.includes('wengine') || lower.includes('bangboo')) {
                return;
            }
            bestDiscSets.add(normalizeSetKey(alt));
        });

        // Fallback: text inside set name containers
        if (bestDiscSets.size === 0) {
            discSection.find('.single-item, .set-name, [class*="disc-set"]').each((_, el) => {
                const text = $(el).text().trim();
                if (text && text.length > 3 && text.length < 60) {
                    bestDiscSets.add(normalizeSetKey(text));
                }
            });
        }

        if (bestDiscSets.size === 0) warnings.push('No disc sets found');

        // --- Main stats for slots 4, 5, 6 ---
        const statPriority: StatPriority = {
            slot4: [], slot5: [], slot6: [],
            substats: { weight1: [], weight05: [] }
        };

        const slotLabelMap: Record<string, keyof Omit<StatPriority, 'substats'>> = {
            '4': 'slot4', '5': 'slot5', '6': 'slot6',
            'disk 4': 'slot4', 'disk 5': 'slot5', 'disk 6': 'slot6',
            'disc 4': 'slot4', 'disc 5': 'slot5', 'disc 6': 'slot6',
            'slot 4': 'slot4', 'slot 5': 'slot5', 'slot 6': 'slot6'
        };

        $('.main-stats .box, .moc-stats .col').each((_, el) => {
            const headerText = $(el).find('strong, .stats-header span, h6').first().text().toLowerCase().trim();
            const slotKey = slotLabelMap[headerText];
            if (!slotKey) return;

            const stats: string[] = [];
            $(el).find('.list-stats .zzz-stat img[alt], .list-stats img[alt], .moc-stats-list img[alt]').each((_, img) => {
                let statName = $(img).attr('alt') || '';
                if (!statName.trim()) return;
                if (ELEMENTAL_DMG_STATS.some(e => statName.includes(e))) {
                    statName = 'Elemental DMG';
                }
                if (!stats.includes(statName)) stats.push(statName);
            });

            // Fallback: parse text like "CRIT DMG% = CRIT Rate% > ATK%"
            if (stats.length === 0) {
                const rawText = $(el).find('.list-stats, .stat-list').text().trim();
                if (rawText) {
                    rawText.split(/[>=]/).forEach(part => {
                        const s = part.trim().replace(/%$/, '').trim();
                        if (s.length > 0) stats.push(s);
                    });
                }
            }

            if (stats.length === 0) return;

            const internalSlot = slotKey.replace('slot', '');
            const { normalized, invalid } = normalizeGuideMainStatsForSlot(internalSlot, stats);
            if (invalid.length > 0) {
                warnings.push(`Invalid slot ${internalSlot} stats: ${invalid.join(', ')}`);
            }
            if (normalized.length > 0) {
                statPriority[slotKey] = normalized;
            }
        });

        // --- Substats ---
        let rawSubstatLines = $('.sub-stats p')
            .map((_, el) => $(el).text().trim())
            .get()
            .filter(Boolean);

        if (rawSubstatLines.length === 0) {
            rawSubstatLines = $('.substats p, .priority p, [class*="substat"] p')
                .map((_, el) => $(el).text().trim())
                .get()
                .filter(Boolean);
        }

        const substatDebug = parseSubstatLines(rawSubstatLines);
        statPriority.substats = substatDebug.parsedSubstats;

        // --- Validation ---
        if (statPriority.slot4.length === 0) warnings.push('No slot 4 stats found');
        if (statPriority.slot5.length === 0) warnings.push('No slot 5 stats found');
        if (statPriority.slot6.length === 0) warnings.push('No slot 6 stats found');
        if (statPriority.substats.weight1.length === 0) warnings.push('No substats found');

        return {
            build: {
                name: charName,
                bestDiscSets: [...bestDiscSets],
                statPriority,
                warnings
            },
            substatDebug
        };
    }

    public parseCharacterPage(html: string): CharacterBuild {
        return this.parseCharacterPageDetailed(html).build;
    }

    public async scrapeLocalFile(filePath: string): Promise<CharacterBuild> {
        const html = fs.readFileSync(filePath, 'utf-8');
        return this.parseCharacterPage(html);
    }
}
