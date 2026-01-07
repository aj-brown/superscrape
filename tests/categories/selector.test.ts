import { describe, it, expect } from 'vitest';
import { selectCategories } from '../../src/categories/selector';
import type { FlatCategory, CategoryFilter } from '../../src/categories/types';

const allCategories: FlatCategory[] = [
  { category0: 'Fruit & Vegetables', category1: 'Fruit' },
  { category0: 'Fruit & Vegetables', category1: 'Vegetables' },
  { category0: 'Pantry', category1: 'Chips' },
  { category0: 'Pantry', category1: 'Biscuits' },
  { category0: 'Bakery', category1: 'Bread' },
];

describe('selectCategories', () => {
  it('mode=all returns all categories', () => {
    const filter: CategoryFilter = { mode: 'all' };

    const result = selectCategories(allCategories, filter);

    expect(result).toEqual(allCategories);
  });

  it('mode=specific filters to matching category0', () => {
    const filter: CategoryFilter = {
      mode: 'specific',
      categories: ['Pantry'],
    };

    const result = selectCategories(allCategories, filter);

    expect(result).toEqual([
      { category0: 'Pantry', category1: 'Chips' },
      { category0: 'Pantry', category1: 'Biscuits' },
    ]);
  });

  it('mode=specific with path filters to exact match', () => {
    const filter: CategoryFilter = {
      mode: 'specific',
      categories: ['Fruit & Vegetables > Fruit'],
    };

    const result = selectCategories(allCategories, filter);

    expect(result).toEqual([
      { category0: 'Fruit & Vegetables', category1: 'Fruit' },
    ]);
  });

  it('returns empty array for no matches', () => {
    const filter: CategoryFilter = {
      mode: 'specific',
      categories: ['Nonexistent Category'],
    };

    const result = selectCategories(allCategories, filter);

    expect(result).toEqual([]);
  });

  it('handles multiple specific categories', () => {
    const filter: CategoryFilter = {
      mode: 'specific',
      categories: ['Pantry', 'Bakery'],
    };

    const result = selectCategories(allCategories, filter);

    expect(result).toEqual([
      { category0: 'Pantry', category1: 'Chips' },
      { category0: 'Pantry', category1: 'Biscuits' },
      { category0: 'Bakery', category1: 'Bread' },
    ]);
  });

  it('handles mix of top-level and path filters', () => {
    const filter: CategoryFilter = {
      mode: 'specific',
      categories: ['Bakery', 'Fruit & Vegetables > Vegetables'],
    };

    const result = selectCategories(allCategories, filter);

    expect(result).toEqual([
      { category0: 'Fruit & Vegetables', category1: 'Vegetables' },
      { category0: 'Bakery', category1: 'Bread' },
    ]);
  });
});
