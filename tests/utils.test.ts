import { describe, it, expect } from 'vitest';
import { parseProductFromApi, toCategorySlug } from '../src/utils';

describe('parseProductFromApi', () => {
  const makeRawProduct = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    productId: 'test-123',
    brand: 'Test Brand',
    name: 'Test Product',
    displayName: '500g Test Product',
    singlePrice: {
      price: 599, // cents
      comparativePrice: {
        pricePerUnit: 120, // cents per unit
        measureDescription: '100g',
      },
    },
    categoryTrees: [
      {
        level0: 'Groceries',
        level1: 'Dairy',
        level2: 'Milk',
      },
    ],
    availability: ['IN_STORE', 'ONLINE'],
    originStatement: 'Made in NZ',
    saleType: 'BOTH',
    ...overrides,
  });

  it('extracts categoryLevel2 from categoryTrees[0].level2', () => {
    const raw = makeRawProduct();
    const product = parseProductFromApi(raw);
    expect(product.categoryLevel2).toBe('Milk');
  });

  it('extracts saleType', () => {
    const raw = makeRawProduct({ saleType: 'ONLINE' });
    const product = parseProductFromApi(raw);
    expect(product.saleType).toBe('ONLINE');
  });

  it('extracts promo fields when promotions[] exists', () => {
    const raw = makeRawProduct({
      promotions: [
        {
          bestPromotion: true,
          rewardValue: 399, // cents
          rewardType: 'NEW_PRICE',
          description: 'Limit 12 assorted',
          cardDependencyFlag: true,
          maxQuantity: 12,
          comparativePrice: {
            pricePerUnit: 80, // cents
          },
        },
      ],
    });
    const product = parseProductFromApi(raw);

    expect(product.promoPrice).toBe(3.99);
    expect(product.promoPricePerUnit).toBe(0.8);
    expect(product.promoType).toBe('NEW_PRICE');
    expect(product.promoDescription).toBe('Limit 12 assorted');
    expect(product.promoRequiresCard).toBe(true);
    expect(product.promoLimit).toBe(12);
  });

  it('finds bestPromotion=true when multiple promos', () => {
    const raw = makeRawProduct({
      promotions: [
        {
          bestPromotion: false,
          rewardValue: 499,
          rewardType: 'PERCENT_OFF',
          description: 'Not the best',
        },
        {
          bestPromotion: true,
          rewardValue: 299,
          rewardType: 'NEW_PRICE',
          description: 'Best promo',
        },
        {
          bestPromotion: false,
          rewardValue: 350,
          rewardType: 'DOLLAR_OFF',
          description: 'Also not best',
        },
      ],
    });
    const product = parseProductFromApi(raw);

    expect(product.promoPrice).toBe(2.99);
    expect(product.promoType).toBe('NEW_PRICE');
    expect(product.promoDescription).toBe('Best promo');
  });

  it('handles missing promotions[] gracefully', () => {
    const raw = makeRawProduct();
    // No promotions in the raw data
    const product = parseProductFromApi(raw);

    expect(product.promoPrice).toBeUndefined();
    expect(product.promoPricePerUnit).toBeUndefined();
    expect(product.promoType).toBeUndefined();
    expect(product.promoDescription).toBeUndefined();
    expect(product.promoRequiresCard).toBeUndefined();
    expect(product.promoLimit).toBeUndefined();
  });

  it('handles missing categoryTrees gracefully', () => {
    const raw = makeRawProduct({ categoryTrees: undefined });
    const product = parseProductFromApi(raw);
    expect(product.categoryLevel2).toBeUndefined();
    expect(product.category).toBe('Unknown');
  });

  it('preserves existing functionality', () => {
    const raw = makeRawProduct();
    const product = parseProductFromApi(raw);

    expect(product.productId).toBe('test-123');
    expect(product.brand).toBe('Test Brand');
    expect(product.name).toBe('Test Product');
    expect(product.displayName).toBe('500g Test Product');
    expect(product.price).toBe(5.99);
    expect(product.pricePerUnit).toBe(1.2);
    expect(product.unitOfMeasure).toBe('100g');
    expect(product.category).toBe('Groceries');
    expect(product.subcategory).toBe('Dairy');
    expect(product.availability).toEqual(['IN_STORE', 'ONLINE']);
    expect(product.origin).toBe('Made in NZ');
  });
});

describe('toCategorySlug', () => {
  it('converts spaces to hyphens', () => {
    expect(toCategorySlug('Breakfast Cereals')).toBe('breakfast-cereals');
  });

  it('converts " & " to "-and-"', () => {
    expect(toCategorySlug('Sliced & Packaged Bread')).toBe('sliced-and-packaged-bread');
    expect(toCategorySlug('Biscuits & Crackers')).toBe('biscuits-and-crackers');
  });

  it('removes commas', () => {
    expect(toCategorySlug('Chips, Nuts & Snacks')).toBe('chips-nuts-and-snacks');
    expect(toCategorySlug('Jams, Honey & Spreads')).toBe('jams-honey-and-spreads');
  });

  it('handles multiple special characters', () => {
    expect(toCategorySlug('Meat, Poultry & Seafood')).toBe('meat-poultry-and-seafood');
    expect(toCategorySlug('Fridge, Deli & Eggs')).toBe('fridge-deli-and-eggs');
  });

  it('handles simple names without special characters', () => {
    expect(toCategorySlug('Pantry')).toBe('pantry');
    expect(toCategorySlug('Bakery')).toBe('bakery');
  });

  it('converts to lowercase', () => {
    expect(toCategorySlug('PANTRY')).toBe('pantry');
    expect(toCategorySlug('World Foods')).toBe('world-foods');
  });
});
