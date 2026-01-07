import { NewWorldScraper } from './scraper';
import * as fs from 'fs';
import * as path from 'path';
import {
  initDatabase,
  saveProducts,
  productsToRecordsAndSnapshots,
} from './storage';

const DATA_DIR = './data';
const DB_PATH = path.join(DATA_DIR, 'prices.db');

async function main() {
  console.log('🛒 New World Price Scraper\n');

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Initialize database
  console.log('💾 Initializing database...');
  initDatabase(DB_PATH);
  console.log(`✅ Database ready at ${DB_PATH}\n`);

  const scraper = new NewWorldScraper({
    headless: false, // Set to true for production
  });

  try {
    // Initialize the scraper (establishes session)
    await scraper.initialize();

    // Fetch categories
    console.log('\n📂 Fetching store categories...');
    const categories = await scraper.getCategories();
    console.log(`Found ${categories.length} top-level categories`);

    // Log category names
    categories.slice(0, 10).forEach((cat) => {
      console.log(`  - ${cat.name || cat.id}`);
    });

    // Scrape a specific category (Fruit & Vegetables > Fruit)
    console.log('\n🍎 Scraping Fruit & Vegetables > Fruit category...');
    const fruitProducts = await scraper.scrapeCategory(
      'Fruit & Vegetables',
      'Fruit',
      1 // Limit to 1 page for development
    );

    console.log(`\n✅ Scraped ${fruitProducts.length} fruit products`);

    // Display sample products
    console.log('\n📋 Sample products:');
    fruitProducts.slice(0, 10).forEach((product) => {
      console.log(
        `  - ${product.name} (${product.displayName}): $${product.price.toFixed(2)}${
          product.pricePerUnit
            ? ` ($${product.pricePerUnit.toFixed(2)}/${product.unitOfMeasure})`
            : ''
        }`
      );
    });

    // Search for milk products
    console.log('\n🥛 Searching for "milk"...');
    const milkProducts = await scraper.search('milk', 1);

    console.log(`\n✅ Found ${milkProducts.length} milk products`);

    // Display sample milk products
    console.log('\n📋 Sample milk products:');
    milkProducts.slice(0, 10).forEach((product) => {
      console.log(
        `  - ${product.brand ? product.brand + ' ' : ''}${product.name} (${product.displayName}): $${product.price.toFixed(2)}`
      );
    });

    // Combine all products for database storage
    const allProducts = [...fruitProducts, ...milkProducts];
    const scrapeDate = new Date().toISOString();

    // Save to database
    console.log('\n💾 Saving products to database...');
    const { records, snapshots } = productsToRecordsAndSnapshots(allProducts, scrapeDate);
    saveProducts(DB_PATH, records, snapshots);
    console.log(`✅ Saved ${allProducts.length} products to database`);

    // Also save JSON output as backup/debug option
    const results = {
      scrapeDate,
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      fruitProducts,
      milkProducts,
    };

    fs.writeFileSync('scrape-results.json', JSON.stringify(results, null, 2));
    console.log('💾 Results also saved to scrape-results.json (backup)');

    // Print summary
    console.log('\n=== SCRAPE SUMMARY ===');
    console.log(`Total fruit products: ${fruitProducts.length}`);
    console.log(`Total milk products: ${milkProducts.length}`);
    console.log(
      `Average fruit price: $${(fruitProducts.reduce((sum, p) => sum + p.price, 0) / fruitProducts.length).toFixed(2)}`
    );
    console.log(
      `Average milk price: $${(milkProducts.reduce((sum, p) => sum + p.price, 0) / milkProducts.length).toFixed(2)}`
    );
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await scraper.close();
  }
}

main().catch(console.error);
