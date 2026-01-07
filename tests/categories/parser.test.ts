import { describe, it, expect } from 'vitest';
import { parseCategories } from '../../src/categories/parser';
import type { CategoryNode, FlatCategory } from '../../src/categories/types';

describe('parseCategories', () => {
  it('parses nested categories into flat list', () => {
    const input: CategoryNode[] = [
      {
        name: 'Fruit & Vegetables',
        children: [
          { name: 'Fruit', children: [] },
          { name: 'Vegetables', children: [] },
        ],
      },
      {
        name: 'Pantry',
        children: [
          { name: 'Chips', children: [] },
        ],
      },
    ];

    const result = parseCategories(input);

    expect(result).toEqual([
      { category0: 'Fruit & Vegetables', category1: 'Fruit' },
      { category0: 'Fruit & Vegetables', category1: 'Vegetables' },
      { category0: 'Pantry', category1: 'Chips' },
    ]);
  });

  it('excludes Featured category', () => {
    const input: CategoryNode[] = [
      {
        name: 'Featured',
        children: [
          { name: 'Summer Essentials', children: [] },
          { name: 'Holiday Picks', children: [] },
        ],
      },
      {
        name: 'Bakery',
        children: [
          { name: 'Bread', children: [] },
        ],
      },
    ];

    const result = parseCategories(input);

    expect(result).toEqual([
      { category0: 'Bakery', category1: 'Bread' },
    ]);
    expect(result.find(c => c.category0 === 'Featured')).toBeUndefined();
  });

  it('handles categories with no level-1 children', () => {
    const input: CategoryNode[] = [
      {
        name: 'Empty Category',
        children: [],
      },
      {
        name: 'Bakery',
        children: [
          { name: 'Bread', children: [] },
        ],
      },
    ];

    const result = parseCategories(input);

    expect(result).toEqual([
      { category0: 'Bakery', category1: 'Bread' },
    ]);
    expect(result.find(c => c.category0 === 'Empty Category')).toBeUndefined();
  });

  it('extracts correct category0 and category1', () => {
    const input: CategoryNode[] = [
      {
        name: 'Meat, Poultry & Seafood',
        children: [
          {
            name: 'Chicken & Poultry',
            children: [
              { name: 'Chicken Breast', children: [] },
            ],
          },
          {
            name: 'Beef',
            children: [
              { name: 'Beef Mince', children: [] },
            ],
          },
        ],
      },
    ];

    const result = parseCategories(input);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      category0: 'Meat, Poultry & Seafood',
      category1: 'Chicken & Poultry',
    });
    expect(result[1]).toEqual({
      category0: 'Meat, Poultry & Seafood',
      category1: 'Beef',
    });
  });
});
