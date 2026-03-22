import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { resolveInventoryFile } from './analysis/process_inventory';

function getInventoryArg(argv: string[]): string | undefined {
    const arg = argv.find(value => value.startsWith('--inventory='));
    return arg ? arg.slice('--inventory='.length) : undefined;
}

function runNodeCommand(projectRoot: string, args: string[], env: NodeJS.ProcessEnv) {
    const result = spawnSync(process.execPath, args, {
        cwd: projectRoot,
        stdio: 'inherit',
        env
    });

    if (result.status !== 0) {
        throw new Error(`Command failed with exit code ${result.status ?? 1}: node ${args.join(' ')}`);
    }
}

function copyDirectory(source: string, destination: string) {
    if (!fs.existsSync(source)) {
        return;
    }

    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const sourcePath = path.join(source, entry.name);
        const destinationPath = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            copyDirectory(sourcePath, destinationPath);
            continue;
        }

        fs.copyFileSync(sourcePath, destinationPath);
    }
}

function buildProject(projectRoot: string, env: NodeJS.ProcessEnv) {
    // Avoid deleting the currently running dist entrypoints during validation on Windows.
    runNodeCommand(projectRoot, ['node_modules/typescript/bin/tsc'], env);
}

function buildValidationTests(projectRoot: string, env: NodeJS.ProcessEnv) {
    const validationOutDir = path.join(projectRoot, 'dist-validation');
    const fixtureSourceDir = path.join(projectRoot, 'src', 'scraper', 'fixtures');
    const fixtureDestinationDir = path.join(validationOutDir, 'scraper', 'fixtures');

    runNodeCommand(projectRoot, ['node_modules/rimraf/dist/esm/bin.mjs', 'dist-validation'], env);
    runNodeCommand(projectRoot, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.validation.json'], env);
    copyDirectory(fixtureSourceDir, fixtureDestinationDir);
}

function runValidation() {
    console.log("=== STARTING PIPELINE VALIDATION ===");
    const projectRoot = path.resolve(__dirname, '..');
    const tempDir = path.join(projectRoot, '.tmp');
    fs.mkdirSync(tempDir, { recursive: true });
    const validationEnv: NodeJS.ProcessEnv = {
        ...process.env,
        TMPDIR: tempDir,
        TMP: tempDir,
        TEMP: tempDir,
        NODE_PATH: path.join(projectRoot, 'node_modules')
    };
    const preferredInventory = getInventoryArg(process.argv);
    const inventoryPath = resolveInventoryFile(projectRoot, preferredInventory);

    try {
        // 1. Build
        console.log("\n[1/5] Building project...");
        buildProject(projectRoot, validationEnv);
        buildValidationTests(projectRoot, validationEnv);

        // 2. Release Validation Checks
        console.log("\n[2/5] Running release validation checks...");
        runNodeCommand(projectRoot, ['dist-validation/release_validation.js'], validationEnv);

        // 3. Crawler Sanity
        console.log("\n[3/5] Checking Crawler Data...");
        const dataDir = path.resolve(__dirname, '../data');
        const dbPath = path.join(dataDir, 'prydwen_data.json');
        
        if (!fs.existsSync(dbPath)) throw new Error(`prydwen_data.json missing at ${dbPath}`);
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        console.log(`- Database contains ${db.length} characters.`);
        if (db.length < 80) throw new Error("Database seems incomplete (< 80 characters).");

        // 4. Inventory Process Sanity
        console.log("\n[4/5] Checking Inventory Analysis...");
        const valuationPath = path.join(dataDir, 'disc_valuation.json');
        if (!inventoryPath || !fs.existsSync(inventoryPath)) {
            throw new Error(`Inventory file missing: ${preferredInventory ?? '(none specified)'}`);
        }
        const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));
        const slots = [...new Set((inventory.discs ?? []).map((r: any) => r.slotKey))].sort();
        console.log(`- Using inventory file: ${inventoryPath}`);
        console.log(`- Inventory contains ${(inventory.discs ?? []).length} discs across slots: ${slots.join(', ')}`);

        // Use the public CLI entrypoint so validation doesn't depend on internal dist paths.
        runNodeCommand(projectRoot, ['dist/cli.js', 'score', `--inventory=${inventoryPath}`], validationEnv);

        if (!fs.existsSync(valuationPath)) throw new Error("disc_valuation.json missing!");
        const valuation = JSON.parse(fs.readFileSync(valuationPath, 'utf-8'));
        const trash = valuation.filter((r: any) => !r.analysis.isKeep && r.rarity === 'S').length;
        const keep = valuation.filter((r: any) => r.analysis.isKeep && r.rarity === 'S').length;
        console.log(`- Analysis complete: ${keep} Keep / ${trash} Trash (S-rank).`);

        // 5. Filter Safety Check
        console.log("\n[5/5] Verifying Filter Safety...");
        const { FilterOptimizer } = require('./solver/filter_optimizer');
        const optimizer = new FilterOptimizer(valuation);
        const { filters } = optimizer.findAllSafeFilters();
        console.log(`- Generated ${filters.length} candidate filters.`);
        
        const unsafe = filters.filter((f: any) => {
            const res = optimizer.evaluateFilter(f);
            return res.keepsSelected > 0;
        });

        if (unsafe.length > 0) {
            throw new Error(`CRITICAL: Found ${unsafe.length} unsafe filters!`);
        }
        console.log("- Safety Check PASSED: All generated filters catch 0 keeps.");

        console.log("\n=== VALIDATION SUCCESSFUL ===");

    } catch (e: any) {
        console.error("\n=== VALIDATION FAILED ===");
        console.error(e.message);
        process.exit(1);
    }
}

runValidation();
