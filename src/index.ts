import * as fs from 'fs';
import * as path from 'path';
import { parseCliArgs, printUsage } from './cli';
import { parseCategories, selectCategories, type CategoryNode, type FlatCategory } from './categories';
import { MultiCategoryScraper } from './multi-scraper';
import { initDatabase, getIncompleteRun, getRunStatus, getDatabaseTotals } from './storage';

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
  let runId: number | undefined;
  let categoriesToScrape: FlatCategory[] = selectedCategories;

  if (options.resume || options.runId) {
    let incompleteRun;

    if (options.runId) {
      // Resume specific run
      const runStatus = getRunStatus(dbPath, options.runId);
      if (!runStatus) {
        console.error(`❌ Run ${options.runId} not found`);
        process.exit(1);
      }
      if (runStatus.status === 'completed') {
        console.error(`❌ Run ${options.runId} is already completed`);
        process.exit(1);
      }
      incompleteRun = {
        id: runStatus.id,
        startedAt: runStatus.startedAt,
        pendingCategories: runStatus.categories
          .filter((c) => c.status === 'pending' || c.status === 'failed')
          .map((c) => c.categorySlug),
      };
    } else {
      // Resume last incomplete run
      incompleteRun = getIncompleteRun(dbPath);
    }

    if (!incompleteRun) {
      console.log('ℹ️  No incomplete run found, starting fresh');
    } else {
      runId = incompleteRun.id;
      console.log(`🔄 Resuming run ${runId} (started ${incompleteRun.startedAt})`);
      console.log(`📋 ${incompleteRun.pendingCategories.length} categories remaining\n`);

      // Filter categories to only pending ones
      categoriesToScrape = selectedCategories.filter((cat) => {
        const categoryPath = `${cat.category0} > ${cat.category1}`;
        return incompleteRun.pendingCategories.includes(categoryPath);
      });

      if (categoriesToScrape.length === 0) {
        console.log('✅ All categories already completed!');
        return;
      }
    }
  }

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
