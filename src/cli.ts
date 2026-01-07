import { parseArgs } from 'node:util';
import type { CategoryFilter } from './categories';
import type { LogLevel, LogFormat } from './reliability/types';

export interface CliOptions {
  filter: CategoryFilter;
  maxPages: number;
  headless: boolean;
  dryRun: boolean;
  help: boolean;
  logFormat: LogFormat;
  logLevel: LogLevel;
  configPath?: string;
  resume: boolean;
  runId?: number;
}

/**
 * Parses command-line arguments into CLI options.
 */
export function parseCliArgs(args: string[]): CliOptions {
  const { values } = parseArgs({
    args,
    options: {
      all: {
        type: 'boolean',
        short: 'a',
        default: false,
      },
      category: {
        type: 'string',
        short: 'c',
        multiple: true,
        default: [],
      },
      pages: {
        type: 'string',
        short: 'p',
        default: '10',
      },
      headless: {
        type: 'boolean',
        default: true,
      },
      'no-headless': {
        type: 'boolean',
        default: false,
      },
      'dry-run': {
        type: 'boolean',
        default: false,
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
      'log-format': {
        type: 'string',
        default: 'text',
      },
      'log-level': {
        type: 'string',
        default: 'info',
      },
      config: {
        type: 'string',
      },
      resume: {
        type: 'boolean',
        default: false,
      },
      'run-id': {
        type: 'string',
      },
    },
    allowPositionals: true,
  });

  const categories = values.category as string[];
  const hasSpecificCategories = categories.length > 0;

  const filter: CategoryFilter = hasSpecificCategories
    ? { mode: 'specific', categories }
    : { mode: 'all' };

  const noHeadless = values['no-headless'] as boolean;
  const headless = noHeadless ? false : (values.headless as boolean);

  const runIdStr = values['run-id'] as string | undefined;
  const runId = runIdStr ? parseInt(runIdStr, 10) : undefined;

  return {
    filter,
    maxPages: parseInt(values.pages as string, 10),
    headless,
    dryRun: values['dry-run'] as boolean,
    help: values.help as boolean,
    logFormat: values['log-format'] as LogFormat,
    logLevel: values['log-level'] as LogLevel,
    configPath: values.config as string | undefined,
    resume: values.resume as boolean,
    runId,
  };
}

/**
 * Prints usage information to the console.
 */
export function printUsage(): void {
  console.log(`
Usage: npm run dev -- [options]

Options:
  --all, -a           Scrape all categories (default behavior)
  --category, -c      Scrape specific category (repeatable)
  --pages, -p         Max pages per category (default: 10)
  --headless          Run headless (default: true)
  --no-headless       Run with visible browser
  --dry-run           List categories without scraping
  --log-format        Log format: text or json (default: text)
  --log-level         Log level: debug, info, warn, error (default: info)
  --config            Path to JSON config file
  --resume            Resume last incomplete run
  --run-id <id>       Resume specific run by ID
  --help, -h          Show this help message

Examples:
  npm run dev -- --all
  npm run dev -- -c "Fruit & Vegetables" -c "Pantry"
  npm run dev -- -c "Fruit & Vegetables > Fruit"
  npm run dev -- --all --dry-run
  npm run dev -- -c "Pantry" --pages 5
  npm run dev -- --log-format json --log-level debug
  npm run dev -- --config config.json
  npm run dev -- --resume
  npm run dev -- --run-id 5
`);
}
