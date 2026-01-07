import { parseArgs } from 'node:util';
import { existsSync, writeFileSync } from 'node:fs';
import {
  getOverallStats,
  formatPriceChange,
  formatPromoProduct,
} from './stats';
import {
  getPriceHistory,
  getPriceChanges,
  getProductsByCategory,
  getProductsOnPromo,
  searchProducts,
  listRuns,
} from './storage/queries';
import { getRunStatus } from './storage/repository';
import { getDatabase } from './storage/database';
import { exportData, formatCsv, formatJson } from './export';
import type { ProductRecord } from './storage/types';

const DEFAULT_DB = './data/prices.db';

interface CliOptions {
  db: string;
  command: string;
  args: string[];
  format: 'csv' | 'json';
  since?: string;
  category?: string;
  output?: string;
}

function parseCliArgs(args: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      db: {
        type: 'string',
        short: 'd',
        default: DEFAULT_DB,
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
      format: {
        type: 'string',
        short: 'f',
        default: 'csv',
      },
      since: {
        type: 'string',
        short: 's',
      },
      category: {
        type: 'string',
        short: 'c',
      },
      output: {
        type: 'string',
        short: 'o',
      },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  return {
    db: values.db as string,
    command: positionals[0] || 'summary',
    args: positionals.slice(1),
    format: (values.format as 'csv' | 'json') || 'csv',
    since: values.since as string | undefined,
    category: values.category as string | undefined,
    output: values.output as string | undefined,
  };
}

function printUsage(): void {
  console.log(`
Usage: npx tsx src/stats-cli.ts [options] <command> [args]

Options:
  --db, -d        Database path (default: ./data/prices.db)
  --help, -h      Show this help message
  --format, -f    Export format: csv or json (default: csv)
  --since, -s     Filter by date (e.g., 7d, 30d, 24h)
  --category, -c  Filter by category
  --output, -o    Output file (default: stdout)

Commands:
  summary                 Show overall database statistics (default)
  promos                  List products currently on promotion
  search <query>          Search products by name or brand
  category <name>         List products in a category
  history <product_id>    Show price history for a product
  changes <product_id>    Show price changes for a product
  export                  Export data to CSV or JSON
  runs                    List scrape runs
  run <id>                Show details for a specific scrape run

Examples:
  npx tsx src/stats-cli.ts summary
  npx tsx src/stats-cli.ts promos
  npx tsx src/stats-cli.ts search "milk"
  npx tsx src/stats-cli.ts category "Pantry"
  npx tsx src/stats-cli.ts history "product-123"
  npx tsx src/stats-cli.ts export --format csv --since 7d
  npx tsx src/stats-cli.ts export --format json --category "Pantry" -o export.json
  npx tsx src/stats-cli.ts runs
  npx tsx src/stats-cli.ts run 1
`);
}

function showSummary(dbPath: string): void {
  const stats = getOverallStats(dbPath);

  console.log('\n=== Database Summary ===\n');
  console.log(`Total Products: ${stats.totalProducts}`);
  console.log(`Total Price Snapshots: ${stats.totalSnapshots}`);
  console.log(`Products on Promo: ${stats.productsOnPromo}`);
  console.log(`\nCategories (${stats.categories.length}):`);
  stats.categories.forEach((cat) => console.log(`  - ${cat}`));

  if (stats.dateRange.earliest && stats.dateRange.latest) {
    console.log(`\nDate Range:`);
    console.log(`  Earliest: ${stats.dateRange.earliest}`);
    console.log(`  Latest: ${stats.dateRange.latest}`);
  }
}

function showPromos(dbPath: string): void {
  const promos = getProductsOnPromo(dbPath);
  const db = getDatabase(dbPath);

  console.log(`\n=== Products on Promo (${promos.length}) ===\n`);

  if (promos.length === 0) {
    console.log('No products currently on promotion.');
    return;
  }

  promos.forEach((promo) => {
    const product = db
      .prepare('SELECT name, brand FROM products WHERE product_id = ?')
      .get(promo.product_id) as { name: string; brand: string | null } | undefined;
    const name = product?.name || promo.display_name || promo.product_id;
    const brand = product?.brand ? ` (${product.brand})` : '';
    console.log(`${name}${brand}`);
    console.log(`  ${formatPromoProduct(promo)}`);
    if (promo.promo_description) {
      console.log(`  ${promo.promo_description}`);
    }
    console.log();
  });
}

function showSearch(dbPath: string, query: string): void {
  const results = searchProducts(dbPath, query);

  console.log(`\n=== Search Results for "${query}" (${results.length}) ===\n`);

  if (results.length === 0) {
    console.log('No products found.');
    return;
  }

  formatProductList(results);
}

function showCategory(dbPath: string, category: string): void {
  const products = getProductsByCategory(dbPath, category);

  console.log(`\n=== Products in "${category}" (${products.length}) ===\n`);

  if (products.length === 0) {
    console.log('No products found in this category.');
    return;
  }

  formatProductList(products);
}

function formatProductList(products: ProductRecord[]): void {
  products.forEach((p) => {
    const brand = p.brand ? ` (${p.brand})` : '';
    const subcategory = p.subcategory ? ` [${p.subcategory}]` : '';
    console.log(`${p.name}${brand}${subcategory}`);
    console.log(`  ID: ${p.product_id}`);
    console.log();
  });
}

function showHistory(dbPath: string, productId: string): void {
  const history = getPriceHistory(dbPath, productId);

  console.log(`\n=== Price History for ${productId} ===\n`);

  if (history.length === 0) {
    console.log('No price history found for this product.');
    return;
  }

  history.forEach((snapshot) => {
    const promo = snapshot.promo_price
      ? ` (promo: $${snapshot.promo_price.toFixed(2)})`
      : '';
    console.log(`${snapshot.scraped_at}: $${snapshot.price.toFixed(2)}${promo}`);
  });
}

function showChanges(dbPath: string, productId: string): void {
  const changes = getPriceChanges(dbPath, productId);

  console.log(`\n=== Price Changes for ${productId} ===\n`);

  if (changes.length === 0) {
    console.log('No price changes found (need at least 2 snapshots).');
    return;
  }

  changes.forEach((change) => {
    console.log(formatPriceChange(change));
  });
}

function runExport(options: CliOptions): void {
  const records = exportData(options.db, {
    category: options.category,
    since: options.since,
  });

  const formatted =
    options.format === 'json' ? formatJson(records) : formatCsv(records);

  if (options.output) {
    writeFileSync(options.output, formatted);
    console.error(`Exported ${records.length} records to ${options.output}`);
  } else {
    console.log(formatted);
  }
}

function showRuns(dbPath: string): void {
  const runs = listRuns(dbPath);

  console.log(`\n=== Scrape Runs (${runs.length}) ===\n`);

  if (runs.length === 0) {
    console.log('No scrape runs found.');
    return;
  }

  console.log('ID    Started At                Status        Categories');
  console.log('----  ------------------------  ------------  ----------');

  runs.forEach((run) => {
    const id = run.id.toString().padEnd(4);
    const started = run.startedAt.padEnd(24);
    const status = run.status.padEnd(12);
    const categories = `${run.completedCategories}/${run.totalCategories}`;
    console.log(`${id}  ${started}  ${status}  ${categories}`);
  });
}

function showRun(dbPath: string, runId: number): void {
  const run = getRunStatus(dbPath, runId);

  if (!run) {
    console.error(`Run ${runId} not found.`);
    process.exit(1);
  }

  console.log(`\n=== Scrape Run #${run.id} ===\n`);
  console.log(`Started:    ${run.startedAt}`);
  if (run.completedAt) {
    console.log(`Completed:  ${run.completedAt}`);
  }
  console.log(`Status:     ${run.status}`);
  console.log(`Progress:   ${run.completedCategories}/${run.totalCategories} categories\n`);

  if (run.categories.length === 0) {
    console.log('No category data.');
    return;
  }

  console.log('Categories:');
  console.log('  Status       Pages  Products  Name');
  console.log('  -----------  -----  --------  ----');

  run.categories.forEach((cat) => {
    const status = cat.status.padEnd(11);
    const pages = (cat.lastPage?.toString() ?? '-').padStart(5);
    const products = (cat.productCount?.toString() ?? '-').padStart(8);
    console.log(`  ${status}  ${pages}  ${products}  ${cat.categorySlug}`);
    if (cat.error) {
      console.log(`               Error: ${cat.error}`);
    }
  });
}

function main(): void {
  const options = parseCliArgs(process.argv.slice(2));

  if (!existsSync(options.db)) {
    console.error(`Error: Database not found at ${options.db}`);
    process.exit(1);
  }

  switch (options.command) {
    case 'summary':
      showSummary(options.db);
      break;
    case 'promos':
      showPromos(options.db);
      break;
    case 'search':
      if (!options.args[0]) {
        console.error('Error: search requires a query argument');
        process.exit(1);
      }
      showSearch(options.db, options.args[0]);
      break;
    case 'category':
      if (!options.args[0]) {
        console.error('Error: category requires a category name');
        process.exit(1);
      }
      showCategory(options.db, options.args[0]);
      break;
    case 'history':
      if (!options.args[0]) {
        console.error('Error: history requires a product_id');
        process.exit(1);
      }
      showHistory(options.db, options.args[0]);
      break;
    case 'changes':
      if (!options.args[0]) {
        console.error('Error: changes requires a product_id');
        process.exit(1);
      }
      showChanges(options.db, options.args[0]);
      break;
    case 'export':
      runExport(options);
      break;
    case 'runs':
      showRuns(options.db);
      break;
    case 'run':
      if (!options.args[0]) {
        console.error('Error: run requires a run_id');
        process.exit(1);
      }
      showRun(options.db, parseInt(options.args[0], 10));
      break;
    default:
      console.error(`Unknown command: ${options.command}`);
      printUsage();
      process.exit(1);
  }
}

main();
