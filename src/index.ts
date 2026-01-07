import { Camoufox } from 'camoufox';

async function main() {
  console.log('Starting Camoufox example...');

  // Launch a new Camoufox browser instance
  const browser = await Camoufox.launch({
    headless: false, // Set to true for headless mode
  });

  try {
    // Create a new page
    const page = await browser.newPage();

    // Navigate to a website
    await page.goto('https://example.com', {
      waitUntil: 'networkidle',
    });

    // Get the page title
    const title = await page.title();
    console.log('Page title:', title);

    // Example: Extract some content
    const content = await page.evaluate(() => {
      return document.querySelector('h1')?.textContent;
    });
    console.log('H1 content:', content);

  } finally {
    // Clean up: close the browser
    await browser.close();
  }
}

main().catch(console.error);
