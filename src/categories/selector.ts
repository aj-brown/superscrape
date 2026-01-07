import type { FlatCategory, CategoryFilter } from './types';

/**
 * Parses a category specification string into category0 and optional category1.
 * Format: "Category0" or "Category0 > Category1"
 */
function parseCategorySpec(spec: string): { category0: string; category1?: string } {
  const parts = spec.split('>').map((s) => s.trim());
  if (parts.length === 2) {
    return { category0: parts[0], category1: parts[1] };
  }
  return { category0: parts[0] };
}

/**
 * Filters categories based on the provided filter configuration.
 */
export function selectCategories(
  categories: FlatCategory[],
  filter: CategoryFilter
): FlatCategory[] {
  if (filter.mode === 'all') {
    return categories;
  }

  if (!filter.categories || filter.categories.length === 0) {
    return [];
  }

  const parsedSpecs = filter.categories.map(parseCategorySpec);
  const result: FlatCategory[] = [];

  for (const category of categories) {
    for (const spec of parsedSpecs) {
      if (spec.category1) {
        // Exact match: both category0 and category1 must match
        if (category.category0 === spec.category0 && category.category1 === spec.category1) {
          result.push(category);
          break;
        }
      } else {
        // Top-level match: only category0 must match
        if (category.category0 === spec.category0) {
          result.push(category);
          break;
        }
      }
    }
  }

  return result;
}
