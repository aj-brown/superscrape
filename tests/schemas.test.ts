import { describe, it, expect } from 'vitest';
import { ProductSchema, ValidationError, validateProduct } from '../src/schemas';
import { ZodError } from 'zod';

describe('ProductSchema', () => {
  const validProduct = {
    productId: 'prod-123',
    name: 'Test Product',
    displayName: 'Test Product Display',
    price: 5.99,
    category: 'Pantry',
    availability: ['ONLINE', 'IN_STORE'],
  };

  it('validates a valid product', () => {
    const result = ProductSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
  });

  it('requires productId', () => {
    const { productId, ...incomplete } = validProduct;
    const result = ProductSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('requires name', () => {
    const { name, ...incomplete } = validProduct;
    const result = ProductSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('requires price to be a number', () => {
    const result = ProductSchema.safeParse({ ...validProduct, price: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects negative price', () => {
    const result = ProductSchema.safeParse({ ...validProduct, price: -5 });
    expect(result.success).toBe(false);
  });

  it('rejects NaN price', () => {
    const result = ProductSchema.safeParse({ ...validProduct, price: NaN });
    expect(result.success).toBe(false);
  });

  it('allows optional fields to be undefined', () => {
    const minimal = {
      productId: 'prod-123',
      name: 'Test',
      displayName: 'Test Display',
      price: 1.0,
      category: 'Pantry',
      availability: [],
    };
    const result = ProductSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it('validates pricePerUnit when present', () => {
    const result = ProductSchema.safeParse({
      ...validProduct,
      pricePerUnit: -1,
    });
    expect(result.success).toBe(false);
  });

  it('validates promoPrice when present', () => {
    const result = ProductSchema.safeParse({
      ...validProduct,
      promoPrice: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('validateProduct', () => {
  const validRaw = {
    productId: 'prod-123',
    name: 'Test Product',
    displayName: 'Test Product Display',
    price: 5.99,
    category: 'Pantry',
    availability: ['ONLINE'],
  };

  it('returns valid result for valid product', () => {
    const result = validateProduct(validRaw);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.productId).toBe('prod-123');
  });

  it('returns error result for invalid product', () => {
    const result = validateProduct({ ...validRaw, price: -1 });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toBeInstanceOf(ValidationError);
  });

  it('error contains field information', () => {
    const result = validateProduct({ ...validRaw, price: -1 });
    expect(result.success).toBe(false);
    expect(result.error?.field).toBe('price');
  });

  it('error contains descriptive message', () => {
    const result = validateProduct({ ...validRaw, productId: '' });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('productId');
  });
});
