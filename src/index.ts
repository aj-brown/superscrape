import * as fs from 'fs';
import * as path from 'path';
import { parseCliArgs, printUsage } from './cli';
import { parseCategories, selectCategories, type CategoryNode } from './categories';
import { MultiCategoryScraper } from './multi-scraper';
import { initDatabase, getDatabaseTotals } from './storage';
import { resolveResumeState } from './resume';

const CATEGORIES_PATH = './categories.json';

async function main() {
  // Parse CLI arguments
  const args = process.argv.slice(2);
  const options = parseCliArgs(args);
  const dbPath = options.dbPath;
  const dataDir = path.dirname(dbPath);

  if (options.help) {
    printUsage();
    return;
  }

  console.log('🛒 New World Multi-Category Scraper\n');

  // Load and parse categories
  console.log('📂 Loading categories...');
  if (!fs.existsSync(CATEGORIES_PATH)) {
    console.error(`❌ Categories file not found: ${CATEGORIES_PATH}`);
    process.exit(1);
  }

  const rawCategories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf-8')) as CategoryNode[];
  const allCategories = parseCategories(rawCategories);
  console.log(`📊 Parsed ${allCategories.length} subcategories (excluding Featured)`);

  // Select categories based on filter
  const selectedCategories = selectCategories(allCategories, options.filter);

  if (selectedCategories.length === 0) {
    console.error('❌ No categories matched your filter');
    process.exit(1);
  }

  console.log(`🎯 Selected ${selectedCategories.length} categories to scrape\n`);

  // Dry run mode - just list categories
  if (options.dryRun) {
    console.log('📋 Categories to scrape (dry-run mode):\n');
    for (const cat of selectedCategories) {
      console.log(`  - ${cat.category0} > ${cat.category1}`);
    }
    console.log(`\nTotal: ${selectedCategories.length} categories`);
    console.log('\n(Use without --dry-run to start scraping)');
    return;
  }

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Initialize database
  console.log('💾 Initializing database...');
  initDatabase(dbPath);
  console.log(`✅ Database ready at ${dbPath}\n`);

  // Capture database totals before scraping
  const dbTotalsBefore = getDatabaseTotals(dbPath);

  // Handle resume mode
  let resumeState;
  try {
    resumeState = resolveResumeState(dbPath, selectedCategories, {
      resume: options.resume,
      runId: options.runId,
    });
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (resumeState.message) {
    if (resumeState.isResuming) {
      console.log(`🔄 ${resumeState.message}`);
    } else {
      console.log(`ℹ️  ${resumeState.message}`);
    }
  }

  if (resumeState.allCompleted) {
    console.log('✅ All categories already completed!');
    return;
  }

  const { runId, categoriesToScrape } = resumeState;

  // Run multi-category scraper
  const scraper = new MultiCategoryScraper({
    categories: categoriesToScrape,
    maxPages: options.maxPages,
    headless: options.headless,
    dbPath,
    runId,
    concurrency: options.concurrency,
    onProgress: (progress) => {
      const pct = Math.round(((progress.completed + progress.failed) / progress.total) * 100);
      process.stdout.write(`\r📈 Progress: ${pct}% (${progress.completed} done, ${progress.failed} failed)`);
    },
  });

  const result = await scraper.run();

  // Print summary
  console.log('\n\n=== SCRAPE SUMMARY ===');
  console.log(`Total categories: ${result.total}`);
  console.log(`Completed: ${result.completed}`);
  console.log(`Failed: ${result.failed}`);

  const totalProducts = result.results.reduce((sum, r) => sum + r.productCount, 0);
  console.log(`Total products scraped: ${totalProducts}`);

  if (result.failed > 0) {
    console.log('\n❌ Failed categories:');
    for (const r of result.results.filter((r) => !r.success)) {
      console.log(`  - ${r.category}: ${r.error}`);
    }
  }

  // Print database totals with before/after comparison
  const dbTotalsAfter = getDatabaseTotals(dbPath);
  const formatChange = (before: number, after: number) => {
    const diff = after - before;
    return diff >= 0 ? `+${diff}` : `${diff}`;
  };
  console.log('\n=== DATABASE TOTALS ===');
  console.log('                  Before    After    Change');
  console.log(
    `Products:     ${dbTotalsBefore.totalProducts.toString().padStart(10)}${dbTotalsAfter.totalProducts.toString().padStart(9)}${formatChange(dbTotalsBefore.totalProducts, dbTotalsAfter.totalProducts).padStart(10)}`
  );
  console.log(
    `Snapshots:    ${dbTotalsBefore.totalSnapshots.toString().padStart(10)}${dbTotalsAfter.totalSnapshots.toString().padStart(9)}${formatChange(dbTotalsBefore.totalSnapshots, dbTotalsAfter.totalSnapshots).padStart(10)}`
  );
  console.log(
    `On promo:     ${dbTotalsBefore.productsOnPromo.toString().padStart(10)}${dbTotalsAfter.productsOnPromo.toString().padStart(9)}${formatChange(dbTotalsBefore.productsOnPromo, dbTotalsAfter.productsOnPromo).padStart(10)}`
  );

  console.log('\n✅ Scraping complete!');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
