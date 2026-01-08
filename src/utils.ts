import type { Cookie } from 'playwright-core';

export interface NewWorldCookies {
  storeId: string;
  cookies: Cookie[];
}

export interface Product {
  productId: string;
  brand?: string;
  name: string;
  displayName: string;
  price: number;
  pricePerUnit?: number;
  unitOfMeasure?: string;
  category: string;
  subcategory?: string;
  categoryLevel2?: string;
  availability: string[];
  origin?: string;
  saleType?: string;
  promoPrice?: number;
  promoPricePerUnit?: number;
  promoType?: string;
  promoDescription?: string;
  promoRequiresCard?: boolean;
  promoLimit?: number;
}

export interface CategoryInfo {
  id: string;
  name: string;
  slug: string;
  children?: CategoryInfo[];
}

export interface SearchQuery {
  storeId: string;
  category0?: string;
  category1?: string;
  category2?: string;
  searchTerm?: string;
  page?: number;
  hitsPerPage?: number;
}

export function buildProductSearchPayload(query: SearchQuery): object {
  const filters: string[] = [`stores:${query.storeId}`];

  if (query.category0) {
    filters.push(`category0NI:"${query.category0}"`);
  }
  if (query.category1) {
    filters.push(`category1NI:"${query.category1}"`);
  }
  if (query.category2) {
    filters.push(`category2NI:"${query.category2}"`);
  }

  const algoliaQuery: Record<string, unknown> = {
    attributesToHighlight: [],
    attributesToRetrieve: [
      'productID',
      'Type',
      'sponsored',
      'category0NI',
      'category1NI',
      'category2NI',
    ],
    facets: ['brand', 'category2NI', 'onPromotion', 'productFacets', 'tobacco'],
    filters: filters.join(' AND '),
    highlightPostTag: '__/ais-highlight__',
    highlightPreTag: '__ais-highlight__',
    hitsPerPage: query.hitsPerPage || 50,
    maxValuesPerFacet: 100,
    page: query.page || 0,
    analyticsTags: ['fs#WEB:desktop'],
  };

  if (query.searchTerm) {
    algoliaQuery.query = query.searchTerm;
  }

  return {
    algoliaQuery,
    algoliaFacetQueries: [],
    storeId: query.storeId,
    hitsPerPage: query.hitsPerPage || 50,
    page: query.page || 0,
    sortOrder: 'NI_POPULARITY_ASC',
    tobaccoQuery: false,
    precisionMedia: {
      adDomain: 'CATEGORY_PAGE',
      adPositions: [4, 8, 12, 16],
      publishImpressionEvent: false,
      disableAds: true,
    },
  };
}

export function parseProductFromApi(raw: Record<string, unknown>): Product {
  const singlePrice = raw.singlePrice as Record<string, unknown> | undefined;
  const comparativePrice = singlePrice?.comparativePrice as
    | Record<string, unknown>
    | undefined;
  const categoryTrees = raw.categoryTrees as
    | Array<Record<string, string>>
    | undefined;
  const firstCategory = categoryTrees?.[0];

  // Find best promotion from promotions array
  const promotions = raw.promotions as Array<Record<string, unknown>> | undefined;
  const bestPromo = promotions?.find((p) => p.bestPromotion === true) ?? promotions?.[0];
  const promoComparativePrice = bestPromo?.comparativePrice as
    | Record<string, unknown>
    | undefined;

  return {
    productId: raw.productId as string,
    brand: raw.brand as string | undefined,
    name: raw.name as string,
    displayName: raw.displayName as string,
    price: ((singlePrice?.price as number) || 0) / 100, // Convert cents to dollars
    pricePerUnit: comparativePrice
      ? ((comparativePrice.pricePerUnit as number) || 0) / 100
      : undefined,
    unitOfMeasure: comparativePrice?.measureDescription as string | undefined,
    category: firstCategory?.level0 || 'Unknown',
    subcategory: firstCategory?.level1,
    categoryLevel2: firstCategory?.level2,
    availability: (raw.availability as string[]) || [],
    origin: raw.originStatement as string | undefined,
    saleType: raw.saleType as string | undefined,
    promoPrice: bestPromo ? ((bestPromo.rewardValue as number) || 0) / 100 : undefined,
    promoPricePerUnit: promoComparativePrice
      ? ((promoComparativePrice.pricePerUnit as number) || 0) / 100
      : undefined,
    promoType: bestPromo?.rewardType as string | undefined,
    promoDescription: bestPromo?.description as string | undefined,
    promoRequiresCard: bestPromo?.cardDependencyFlag as boolean | undefined,
    promoLimit: bestPromo?.maxQuantity as number | undefined,
  };
}

export function extractStoreIdFromCookies(cookies: Cookie[]): string | null {
  const storeIdCookie = cookies.find((c) => c.name === 'eCom_STORE_ID');
  return storeIdCookie?.value || null;
}

/**
 * Convert a category name to a URL-safe slug.
 * Examples:
 *   "Chips, Nuts & Snacks" -> "chips-nuts-and-snacks"
 *   "Sliced & Packaged Bread" -> "sliced-and-packaged-bread"
 *   "Meat, Poultry & Seafood" -> "meat-poultry-and-seafood"
 */
export function toCategorySlug(categoryName: string): string {
  return categoryName
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/ & /g, '-and-')
    .replace(/ /g, '-');
}

export function getRequiredHeaders(cookies: Cookie[]): Record<string, string> {
  // Extract fs-user-token if available
  const fsToken = cookies.find((c) => c.name === 'fs-user-token');

  const headers: Record<string, string> = {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'en-NZ,en;q=0.9',
    'content-type': 'application/json',
    origin: 'https://www.newworld.co.nz',
    referer: 'https://www.newworld.co.nz/',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  if (fsToken) {
    headers['fs-user-token'] = fsToken.value;
  }

  return headers;
}
