/**
 * Represents a node in the category hierarchy from categories.json.
 */
export interface CategoryNode {
  name: string;
  children: CategoryNode[];
}

/**
 * A flattened category representing a scraping target at level 1 (subcategory).
 */
export interface FlatCategory {
  category0: string; // Top-level category, e.g., "Fruit & Vegetables"
  category1: string; // Subcategory, e.g., "Fruit"
}

/**
 * Filter configuration for selecting which categories to scrape.
 */
export interface CategoryFilter {
  mode: 'all' | 'specific';
  categories?: string[]; // For specific mode: ["Fruit & Vegetables", "Pantry"] or ["Fruit & Vegetables > Fruit"]
}
