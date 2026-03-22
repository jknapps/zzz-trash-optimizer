import * as fs from 'fs';
import * as path from 'path';
import { validateCharacterDatabase } from '../analysis/process_inventory';
import {
    CharacterBuild,
    ParsedCharacterPageDetailed,
    PrydwenScraper
} from './prydwen';
import { buildCrawlSubstatAuditReport, CrawlSubstatAuditEntry } from './substat_debug';

interface ReplayDeps {
    existsSync: typeof fs.existsSync;
    mkdirSync: typeof fs.mkdirSync;
    readdirSync: typeof fs.readdirSync;
    readFileSync: typeof fs.readFileSync;
    unlinkSync: typeof fs.unlinkSync;
    renameSync: typeof fs.renameSync;
    writeFileSync: typeof fs.writeFileSync;
    log: (msg: string) => void;
    error: (msg: string) => void;
}

interface ReplayOptions {
    scraper?: Pick<PrydwenScraper, 'parseCharacterPage'> & {
        parseCharacterPageDetailed?: (html: string) => ParsedCharacterPageDetailed;
    };
    dataDir?: string;
    debugDir?: string;
    deps?: Partial<ReplayDeps>;
}

function toCharacterUrl(slug: string): string {
    return `https://www.prydwen.gg/star-rail/characters/${slug}`;
}

function parseCharacterWithAudit(
    scraper: ReplayOptions['scraper'],
    html: string
): ParsedCharacterPageDetailed {
    if (scraper?.parseCharacterPageDetailed) {
        return scraper.parseCharacterPageDetailed(html);
    }

    const build = scraper!.parseCharacterPage(html);
    return {
        build,
        substatDebug: {
            rawLines: [],
            parsedSubstats: {
                weight1: [...build.statPriority.substats.weight1],
                weight05: [...build.statPriority.substats.weight05]
            },
            unknownTokens: [],
            shorthandCandidates: []
        }
    };
}

export async function runCrawlerReplay(options?: ReplayOptions) {
    const scraper = options?.scraper ?? new PrydwenScraper();
    const dataDir = options?.dataDir ?? path.join(__dirname, '../../data');
    const debugDir = options?.debugDir ?? path.join(__dirname, '../../logs/prydwen-last-crawl');
    const charactersDir = path.join(debugDir, 'characters');
    const outputFile = path.join(dataDir, 'prydwen_data.json');
    const partialFile = path.join(dataDir, 'prydwen_data.partial.json');
    const backupFile = path.join(dataDir, 'prydwen_data.previous.json');
    const auditFile = path.join(debugDir, 'substat-audit.json');

    const deps: ReplayDeps = {
        existsSync: fs.existsSync,
        mkdirSync: fs.mkdirSync,
        readdirSync: fs.readdirSync,
        readFileSync: fs.readFileSync,
        unlinkSync: fs.unlinkSync,
        renameSync: fs.renameSync,
        writeFileSync: fs.writeFileSync,
        log: console.log,
        error: console.error,
        ...(options?.deps ?? {})
    };

    if (!deps.existsSync(charactersDir)) {
        throw new Error(`Replay crawl directory not found: ${charactersDir}`);
    }

    if (!deps.existsSync(dataDir)) {
        deps.mkdirSync(dataDir);
    }

    const characterFiles = deps.readdirSync(charactersDir)
        .filter(file => file.endsWith('.html'))
        .sort();

    deps.log(`Replaying ${characterFiles.length} saved character pages...`);

    const partialData: CharacterBuild[] = [];
    const auditEntries: CrawlSubstatAuditEntry[] = [];

    for (const file of characterFiles) {
        const slug = file.slice(0, -'.html'.length);
        const html = deps.readFileSync(path.join(charactersDir, file), 'utf8');
        const { build, substatDebug } = parseCharacterWithAudit(scraper, html);

        partialData.push(build);
        auditEntries.push({
            name: build.name,
            url: toCharacterUrl(slug),
            slug,
            rawSubstatLines: substatDebug.rawLines,
            parsedSubstats: substatDebug.parsedSubstats,
            unknownTokens: substatDebug.unknownTokens,
            shorthandCandidates: substatDebug.shorthandCandidates
        });
    }

    deps.writeFileSync(
        auditFile,
        JSON.stringify(buildCrawlSubstatAuditReport(auditEntries), null, 2)
    );

    const validData = validateCharacterDatabase(partialData);
    const minimumValidCharacters = Math.max(1, Math.ceil(characterFiles.length * 0.9));
    if (validData.length < minimumValidCharacters) {
        deps.error(`Replay validation failed: only ${validData.length}/${characterFiles.length} guides were valid.`);
        throw new Error('Replay crawl output was semantically incomplete.');
    }

    deps.writeFileSync(partialFile, JSON.stringify(validData, null, 2));
    if (deps.existsSync(backupFile)) {
        deps.unlinkSync(backupFile);
    }
    if (deps.existsSync(outputFile)) {
        deps.renameSync(outputFile, backupFile);
    }

    try {
        deps.renameSync(partialFile, outputFile);
        if (deps.existsSync(backupFile)) {
            deps.unlinkSync(backupFile);
        }
    } catch (error: any) {
        if (deps.existsSync(backupFile) && !deps.existsSync(outputFile)) {
            deps.renameSync(backupFile, outputFile);
        }
        throw error;
    }

    deps.log('Replay crawl complete!');
}
