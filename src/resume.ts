import { getIncompleteRun, getRunStatus } from './storage';
import type { FlatCategory } from './categories';

export interface ResumeResult {
  runId?: number;
  categoriesToScrape: FlatCategory[];
  isResuming: boolean;
  message?: string;
  allCompleted?: boolean;
}

export interface ResumeOptions {
  resume: boolean;
  runId?: number;
}

/**
 * Resolves the resume state for a scrape run.
 *
 * @param dbPath - Path to the database
 * @param selectedCategories - Categories selected for scraping
 * @param options - Resume options (--resume flag and/or --run-id)
 * @returns ResumeResult with runId, categories to scrape, and status
 * @throws Error if runId is specified but run doesn't exist or is completed
 */
export function resolveResumeState(
  dbPath: string,
  selectedCategories: FlatCategory[],
  options: ResumeOptions
): ResumeResult {
  // No resume flags - return all categories
  if (!options.resume && options.runId === undefined) {
    return {
      runId: undefined,
      categoriesToScrape: selectedCategories,
      isResuming: false,
    };
  }

  let incompleteRun: {
    id: number;
    startedAt: string;
    pendingCategories: string[];
  } | null = null;

  if (options.runId !== undefined) {
    // Resume specific run by ID
    const runStatus = getRunStatus(dbPath, options.runId);

    if (!runStatus) {
      throw new Error(`Run ${options.runId} not found`);
    }

    if (runStatus.status === 'completed') {
      throw new Error(`Run ${options.runId} is already completed`);
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
    return {
      runId: undefined,
      categoriesToScrape: selectedCategories,
      isResuming: false,
      message: 'No incomplete run found, starting fresh',
    };
  }

  // Filter categories to only pending/failed ones
  const categoriesToScrape = selectedCategories.filter((cat) => {
    const categoryPath = `${cat.category0} > ${cat.category1}`;
    return incompleteRun!.pendingCategories.includes(categoryPath);
  });

  if (categoriesToScrape.length === 0) {
    return {
      runId: incompleteRun.id,
      categoriesToScrape: [],
      isResuming: true,
      allCompleted: true,
      message: 'All categories already completed',
    };
  }

  return {
    runId: incompleteRun.id,
    categoriesToScrape,
    isResuming: true,
    message: `Resuming run ${incompleteRun.id} (started ${incompleteRun.startedAt}), ${incompleteRun.pendingCategories.length} categories remaining`,
  };
}
