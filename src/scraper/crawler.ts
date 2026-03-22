import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import {
    PrydwenScraper,
    CharacterBuild,
    ParsedCharacterPageDetailed
} from './prydwen';
import { validateCharacterDatabase } from '../analysis/process_inventory';
import {
    buildCrawlSubstatAuditReport,
    CharacterSubstatDebug,
    CrawlSubstatAuditEntry
} from './substat_debug';

const DELAY_MS = 2000; // 2 seconds between guide requests
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

export async function delay(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

const HTTP_TIMEOUT_MS = 30000;

interface CrawlerDeps {
    httpGet: (url: string, config?: { headers?: Record<string, string>; timeout?: number }) => Promise<{ data: string }>;
    existsSync: typeof fs.existsSync;
    mkdirSync: typeof fs.mkdirSync;
    rmSync: typeof fs.rmSync;
    unlinkSync: typeof fs.unlinkSync;
    renameSync: typeof fs.renameSync;
    writeFileSync: typeof fs.writeFileSync;
    sleep: (ms: number) => Promise<void>;
    log: (msg: string) => void;
    error: (msg: string) => void;
}

interface RunCrawlerOptions {
    scraper?: Pick<PrydwenScraper, 'parseCharacterList' | 'parseCharacterPage'> & {
        parseCharacterPageDetailed?: (html: string) => ParsedCharacterPageDetailed;
    };
    dataDir?: string;
    debugDir?: string;
    deps?: Partial<CrawlerDeps>;
}

function slugFromUrl(url: string): string {
    const lastSegment = url
        .replace(/\/+$/, '')
        .split('/')
        .pop() ?? 'unknown';

    return lastSegment.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
}

function emptySubstatDebug(build: CharacterBuild): CharacterSubstatDebug {
    return {
        rawLines: [],
        parsedSubstats: {
            weight1: [...build.statPriority.substats.weight1],
            weight05: [...build.statPriority.substats.weight05]
        },
        unknownTokens: [],
        shorthandCandidates: []
    };
}

function parseCharacterWithAudit(
    scraper: RunCrawlerOptions['scraper'],
    html: string
): { build: CharacterBuild; substatDebug: CharacterSubstatDebug } {
    if (scraper?.parseCharacterPageDetailed) {
        return scraper.parseCharacterPageDetailed(html);
    }

    const build = scraper!.parseCharacterPage(html);
    return {
        build,
        substatDebug: emptySubstatDebug(build)
    };
}

function safeWriteDebugFile(
    filePath: string,
    contents: string,
    deps: CrawlerDeps
): void {
    try {
        deps.mkdirSync(path.dirname(filePath), { recursive: true });
        deps.writeFileSync(filePath, contents);
    } catch (error: any) {
        deps.log(
            `[WARN] Failed to write debug artifact ${filePath}: ${error.message}`
        );
    }
}

export async function runCrawler(options?: RunCrawlerOptions) {
    const scraper = options?.scraper ?? new PrydwenScraper();
    const dataDir = options?.dataDir ?? path.join(__dirname, '../../data');
    const debugDir = options?.debugDir ?? path.join(__dirname, '../../logs/prydwen-last-crawl');
    const outputFile = path.join(dataDir, 'prydwen_data.json');
    const partialFile = path.join(dataDir, 'prydwen_data.partial.json');
    const backupFile = path.join(dataDir, 'prydwen_data.previous.json');
    const indexDebugFile = path.join(debugDir, 'index.html');
    const auditDebugFile = path.join(debugDir, 'substat-audit.json');
    const characterDebugDir = path.join(debugDir, 'characters');

    const deps: CrawlerDeps = {
        httpGet: axios.get,
        existsSync: fs.existsSync,
        mkdirSync: fs.mkdirSync,
        rmSync: fs.rmSync,
        unlinkSync: fs.unlinkSync,
        renameSync: fs.renameSync,
        writeFileSync: fs.writeFileSync,
        sleep: delay,
        log: console.log,
        error: console.error,
        ...(options?.deps ?? {})
    };

    if (!deps.existsSync(dataDir)) {
        deps.mkdirSync(dataDir);
    }

    try {
        deps.rmSync(debugDir, { recursive: true, force: true });
        deps.mkdirSync(characterDebugDir, { recursive: true });
    } catch (error: any) {
        deps.log(
            `[WARN] Failed to reset crawl debug directory ${debugDir}: ${error.message}`
        );
    }

    deps.log('Fetching character list...');
    const listResponse = await deps.httpGet('https://www.prydwen.gg/zenless/characters/', {
        headers: { 'User-Agent': USER_AGENT },
        timeout: HTTP_TIMEOUT_MS
    });
    safeWriteDebugFile(indexDebugFile, listResponse.data, deps);

    const characterUrls = scraper.parseCharacterList(listResponse.data);
    deps.log(`Found ${characterUrls.length} characters.`);

    let partialData: CharacterBuild[] = [];
    const auditEntries: CrawlSubstatAuditEntry[] = [];
    if (deps.existsSync(partialFile)) {
        deps.unlinkSync(partialFile);
    }

    for (const url of characterUrls) {
        deps.log(`Fetching ${url}...`);
        try {
            const response = await deps.httpGet(url, {
                headers: { 'User-Agent': USER_AGENT },
                timeout: HTTP_TIMEOUT_MS
            });
            const slug = slugFromUrl(url);
            safeWriteDebugFile(
                path.join(characterDebugDir, `${slug}.html`),
                response.data,
                deps
            );

            const { build, substatDebug } = parseCharacterWithAudit(scraper, response.data);
            partialData.push(build);
            auditEntries.push({
                name: build.name,
                url,
                slug,
                rawSubstatLines: substatDebug.rawLines,
                parsedSubstats: substatDebug.parsedSubstats,
                unknownTokens: substatDebug.unknownTokens,
                shorthandCandidates: substatDebug.shorthandCandidates
            });
            safeWriteDebugFile(
                auditDebugFile,
                JSON.stringify(buildCrawlSubstatAuditReport(auditEntries), null, 2),
                deps
            );
            deps.log(`Successfully parsed ${build.name}`);

            deps.writeFileSync(partialFile, JSON.stringify(partialData, null, 2));
            
            deps.log(`Throttling... waiting ${DELAY_MS / 1000}s`);
            await deps.sleep(DELAY_MS);
        } catch (error: any) {
            deps.error(`Failed to fetch ${url}: ${error.message}`);
            await deps.sleep(DELAY_MS);
        }
    }

    const validData = validateCharacterDatabase(partialData);
    const minimumValidCharacters = Math.max(1, Math.ceil(characterUrls.length * 0.9));
    if (validData.length < minimumValidCharacters) {
        deps.error(`Crawl validation failed: only ${validData.length}/${characterUrls.length} guides were valid.`);
        deps.error(`Keeping existing database. Partial crawl saved at ${partialFile}`);
        return;
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

    deps.log('Crawl complete!');
}

if (require.main === module) {
    runCrawler().catch(err => {
        console.error('Crawler fatal error:', err);
    });
}
