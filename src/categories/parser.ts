import type { CategoryNode, FlatCategory } from './types';

const EXCLUDED_CATEGORIES = ['Featured'];

/**
 * Parses nested category structure into a flat list of scrapeable categories.
 * Excludes "Featured" category and only includes categories with level-1 children.
 */
export function parseCategories(categories: CategoryNode[]): FlatCategory[] {
  const result: FlatCategory[] = [];

  for (const topLevel of categories) {
    if (EXCLUDED_CATEGORIES.includes(topLevel.name)) {
      continue;
    }

    for (const subCategory of topLevel.children) {
      result.push({
        category0: topLevel.name,
        category1: subCategory.name,
      });
    }
  }

  return result;
}
