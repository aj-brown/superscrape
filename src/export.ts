import { getDatabase } from './storage/database';

export interface ExportRecord {
  product_id: string;
  name: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  price: number;
  promo_price: number | null;
  promo_type: string | null;
  scraped_at: string;
}

export interface ExportOptions {
  category?: string;
  since?: string; // e.g., "7d", "30d"
}

function parseSinceDuration(since: string): Date {
  const match = since.match(/^(\d+)([dhm])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${since}. Use format like 7d, 30d, 24h`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const now = new Date();
  switch (unit) {
    case 'd':
      return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    case 'h':
      return new Date(now.getTime() - value * 60 * 60 * 1000);
    case 'm':
      return new Date(now.getTime() - value * 60 * 1000);
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

export function exportData(dbPath: string, options: ExportOptions): ExportRecord[] {
  const db = getDatabase(dbPath);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.category) {
    conditions.push('p.category = ?');
    params.push(options.category);
  }

  if (options.since) {
    const sinceDate = parseSinceDuration(options.since);
    conditions.push('ps.scraped_at >= ?');
    params.push(sinceDate.toISOString());
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT
      p.product_id,
      p.name,
      p.brand,
      p.category,
      p.subcategory,
      ps.price,
      ps.promo_price,
      ps.promo_type,
      ps.scraped_at
    FROM products p
    INNER JOIN price_snapshots ps ON p.product_id = ps.product_id
    ${whereClause}
    ORDER BY ps.scraped_at DESC, p.name ASC
  `;

  const stmt = db.prepare(query);
  const rows = params.length > 0 ? stmt.all(...params) : stmt.all();

  return rows as ExportRecord[];
}

function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatCsv(records: ExportRecord[]): string {
  if (records.length === 0) {
    return '';
  }

  const headers = [
    'product_id',
    'name',
    'brand',
    'category',
    'subcategory',
    'price',
    'promo_price',
    'promo_type',
    'scraped_at',
  ];

  const lines: string[] = [headers.join(',')];

  for (const record of records) {
    const values = headers.map((h) => escapeCSVValue(record[h as keyof ExportRecord]));
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

export function formatJson(records: ExportRecord[]): string {
  return JSON.stringify(records, null, 2);
}
