import * as fs from 'fs';
import * as path from 'path';
import { parseCliArgs, printUsage } from './cli';
import { parseCategories, selectCategories, type CategoryNode } from './categories';
import { MultiCategoryScraper } from './multi-scraper';
import { initDatabase } from './storage';

const DATA_DIR = './data';
const DB_PATH = path.join(DATA_DIR, 'prices.db');
const CATEGORIES_PATH = './docs/categories.json';

async function main() {
  // Parse CLI arguments
  const args = process.argv.slice(2);
  const options = parseCliArgs(args);

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
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Initialize database
  console.log('💾 Initializing database...');
  initDatabase(DB_PATH);
  console.log(`✅ Database ready at ${DB_PATH}\n`);

  // Run multi-category scraper
  const scraper = new MultiCategoryScraper({
    categories: selectedCategories,
    maxPages: options.maxPages,
    headless: options.headless,
    dbPath: DB_PATH,
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

  console.log('\n✅ Scraping complete!');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
