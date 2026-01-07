import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import type { CliOptions } from './cli';
import type { CategoryFilter } from './categories';

export const ConfigSchema = z.object({
  maxPages: z.number().int().positive().optional(),
  headless: z.boolean().optional(),
  logFormat: z.enum(['json', 'text']).optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  categories: z.array(z.string()).optional(),
  dryRun: z.boolean().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(path: string): Config {
  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }

  const content = readFileSync(path, 'utf-8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Invalid JSON in config file: ${path}`);
  }

  const result = ConfigSchema.safeParse(parsed);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const field = firstIssue.path.join('.') || 'root';
    throw new Error(`Invalid config: ${field} - ${firstIssue.message}`);
  }

  return result.data;
}

export function mergeConfigWithCli(cli: CliOptions, config: Config | undefined): CliOptions {
  if (!config) {
    return cli;
  }

  // Build the filter based on config categories if provided and CLI doesn't have specific categories
  let filter: CategoryFilter = cli.filter;
  if (config.categories && config.categories.length > 0 && cli.filter.mode === 'all') {
    filter = { mode: 'specific', categories: config.categories };
  }

  return {
    filter,
    maxPages: config.maxPages ?? cli.maxPages,
    headless: config.headless ?? cli.headless,
    dryRun: config.dryRun ?? cli.dryRun,
    help: cli.help,
    logFormat: config.logFormat ?? cli.logFormat,
    logLevel: config.logLevel ?? cli.logLevel,
  };
}
