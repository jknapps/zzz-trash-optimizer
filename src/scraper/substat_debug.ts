export interface ParsedSubstatWeights {
    weight1: string[];
    weight05: string[];
}

export interface CharacterSubstatDebug {
    rawLines: string[];
    parsedSubstats: ParsedSubstatWeights;
    unknownTokens: string[];
    shorthandCandidates: string[];
}

export interface CrawlSubstatAuditEntry {
    name: string;
    url: string;
    slug: string;
    rawSubstatLines: string[];
    parsedSubstats: ParsedSubstatWeights;
    unknownTokens: string[];
    shorthandCandidates: string[];
}

export interface AggregatedTokenStat {
    token: string;
    count: number;
    characters: string[];
}

export interface CrawlSubstatAuditReport {
    generatedAt: string;
    characters: CrawlSubstatAuditEntry[];
    unknownTokens: AggregatedTokenStat[];
    shorthandCandidates: AggregatedTokenStat[];
}

const SUBSTAT_ALIASES: Record<string, string> = {
    // CRIT
    'crit rate': 'CRIT Rate',
    'crit rate%': 'CRIT Rate',
    'crit': 'CRIT Rate',
    'cr': 'CRIT Rate',
    'crit dmg': 'CRIT DMG',
    'crit dmg%': 'CRIT DMG',
    'cd': 'CRIT DMG',
    // ATK / HP / DEF
    'atk%': 'ATK%',
    'atk': 'ATK',
    'hp%': 'HP%',
    'hp': 'HP',
    'def%': 'DEF%',
    'def': 'DEF',
    // Anomaly
    'anomaly proficiency': 'Anomaly Proficiency',
    'anom proficiency': 'Anomaly Proficiency',
    'anomaly prof': 'Anomaly Proficiency',
    'anom prof': 'Anomaly Proficiency',
    'ap': 'Anomaly Proficiency',
    'anomaly mastery': 'Anomaly Mastery',
    'anom mastery': 'Anomaly Mastery',
    // PEN
    'pen ratio': 'PEN Ratio',
    'pen ratio%': 'PEN Ratio',
    'pen%': 'PEN Ratio',
    'pen': 'PEN',
    // Energy / Impact
    'energy regen': 'Energy Regen',
    'energy regeneration': 'Energy Regen',
    'er': 'Energy Regen',
    'impact': 'Impact',
    // Elemental DMG
    'electric dmg': 'Electric DMG',
    'ether dmg': 'Ether DMG',
    'fire dmg': 'Fire DMG',
    'ice dmg': 'Ice DMG',
    'physical dmg': 'Physical DMG',
    'elemental dmg': 'Elemental DMG'
};

const SORTED_ALIASES = Object.entries(SUBSTAT_ALIASES).sort(
    ([left], [right]) => right.length - left.length
);

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAliasPattern(alias: string): RegExp {
    if (alias === 'crit') {
        return new RegExp('(^|[^a-z0-9])crit(?!\\s+(?:dmg|rate))(?!%)($|[^a-z0-9])', 'i');
    }

    const suffix = alias.endsWith('%') ? '($|[^a-z0-9])' : '(?!%)($|[^a-z0-9])';
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}${suffix}`, 'i');
}

function normalizeToken(rawToken: string): string {
    return rawToken
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[\[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractCanonicalStats(normalizedToken: string): string[] {
    const matched = new Set<string>();

    for (const [alias, canonical] of SORTED_ALIASES) {
        if (buildAliasPattern(alias).test(normalizedToken)) {
            matched.add(canonical);
        }
    }

    return [...matched];
}

function extractShorthandCandidate(rawToken: string): string | null {
    const stripped = rawToken
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[\[\]]/g, ' ')
        .trim();

    if (/^[A-Z][A-Z0-9%]{1,6}$/.test(stripped)) {
        return stripped;
    }

    return null;
}

function splitPriorityTiers(line: string): string[] {
    return line
        .replace(/>=/g, '__GE__')
        .split('>')
        .map(tier => tier.trim())
        .filter(Boolean)
        .map(tier => tier.replace(/__GE__/g, ', '));
}

function isSubstatCandidateLine(line: string): boolean {
    const firstTier = splitPriorityTiers(line)[0];
    if (!firstTier) {
        return false;
    }

    const firstTierTokens = firstTier
        .split(/[=|,]/)
        .map(token => normalizeToken(token))
        .filter(Boolean);

    return firstTierTokens.some(token => extractCanonicalStats(token).length > 0);
}

export function parseSubstatLines(rawLines: string[]): CharacterSubstatDebug {
    const weight1 = new Set<string>();
    const weight05 = new Set<string>();
    const unknownTokens = new Set<string>();
    const shorthandCandidates = new Set<string>();

    rawLines.forEach(line => {
        if (!/[>=]/.test(line) || !isSubstatCandidateLine(line)) {
            return;
        }

        const tiers = splitPriorityTiers(line);

        tiers.forEach(tier => {
            const rawTokens = tier
                .split(/[=|,]/)
                .map(token => token.trim())
                .filter(Boolean);
            const tierMatches = new Set<string>();

            rawTokens.forEach(rawToken => {
                const normalizedToken = normalizeToken(rawToken);
                if (!normalizedToken) {
                    return;
                }

                const matches = extractCanonicalStats(normalizedToken);
                if (matches.length === 0) {
                    unknownTokens.add(normalizedToken);
                    const shorthandCandidate = extractShorthandCandidate(rawToken);
                    if (shorthandCandidate) {
                        shorthandCandidates.add(shorthandCandidate);
                    }
                    return;
                }

                matches.forEach(match => {
                    tierMatches.add(match);
                });
            });

            const isFullWeightTier = weight1.size < 2;
            tierMatches.forEach(match => {
                if (isFullWeightTier) {
                    weight05.delete(match);
                    weight1.add(match);
                } else if (!weight1.has(match)) {
                    weight05.add(match);
                }
            });
        });
    });

    return {
        rawLines,
        parsedSubstats: {
            weight1: [...weight1],
            weight05: [...weight05]
        },
        unknownTokens: [...unknownTokens].sort(),
        shorthandCandidates: [...shorthandCandidates].sort()
    };
}

function aggregateTokenStats(
    entries: CrawlSubstatAuditEntry[],
    getTokens: (entry: CrawlSubstatAuditEntry) => string[],
    minCount = 1
): AggregatedTokenStat[] {
    const aggregate = new Map<string, { count: number; characters: Set<string> }>();

    entries.forEach(entry => {
        getTokens(entry).forEach(token => {
            const existing = aggregate.get(token) ?? {
                count: 0,
                characters: new Set<string>()
            };
            existing.count += 1;
            existing.characters.add(entry.name);
            aggregate.set(token, existing);
        });
    });

    return [...aggregate.entries()]
        .map(([token, value]) => ({
            token,
            count: value.count,
            characters: [...value.characters].sort()
        }))
        .filter(entry => entry.count >= minCount)
        .sort((left, right) => right.count - left.count || left.token.localeCompare(right.token));
}

export function buildCrawlSubstatAuditReport(
    entries: CrawlSubstatAuditEntry[]
): CrawlSubstatAuditReport {
    return {
        generatedAt: new Date().toISOString(),
        characters: entries,
        unknownTokens: aggregateTokenStats(entries, entry => entry.unknownTokens),
        shorthandCandidates: aggregateTokenStats(
            entries,
            entry => entry.shorthandCandidates,
            2
        )
    };
}
