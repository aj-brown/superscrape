import { z } from 'zod';

export const ProductSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  brand: z.string().optional(),
  name: z.string().min(1, 'name is required'),
  displayName: z.string().min(1, 'displayName is required'),
  price: z.number().nonnegative('price must be non-negative').refine((n) => !isNaN(n), {
    message: 'price must be a valid number',
  }),
  pricePerUnit: z
    .number()
    .nonnegative('pricePerUnit must be non-negative')
    .optional(),
  unitOfMeasure: z.string().optional(),
  category: z.string().min(1, 'category is required'),
  subcategory: z.string().optional(),
  categoryLevel2: z.string().optional(),
  availability: z.array(z.string()),
  origin: z.string().optional(),
  saleType: z.string().optional(),
  promoPrice: z
    .number()
    .nonnegative('promoPrice must be non-negative')
    .optional(),
  promoPricePerUnit: z
    .number()
    .nonnegative('promoPricePerUnit must be non-negative')
    .optional(),
  promoType: z.string().optional(),
  promoDescription: z.string().optional(),
  promoRequiresCard: z.boolean().optional(),
  promoLimit: z.number().int().nonnegative().optional(),
});

export type ValidatedProduct = z.infer<typeof ProductSchema>;

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly zodError?: z.ZodError
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface ValidationResult {
  success: boolean;
  data?: ValidatedProduct;
  error?: ValidationError;
}

export function validateProduct(raw: unknown): ValidationResult {
  const result = ProductSchema.safeParse(raw);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const firstIssue = result.error.issues[0];
  const field = firstIssue.path.join('.') || 'unknown';
  const message = `Validation failed for ${field}: ${firstIssue.message}`;

  return {
    success: false,
    error: new ValidationError(message, field, result.error),
  };
}
