/**
 * URL helper utilities for blog feature
 * Constructs URLs with query parameters for category filtering and pagination
 */

/**
 * Builds a URL with category filter, preserving page number if present
 * @param category - Category to filter by, or null to clear filter
 * @param currentPage - Current page number to preserve (optional)
 * @returns Relative URL starting with /blog
 */
export function buildCategoryUrl(category: string | null, currentPage?: number): string {
  const params = new URLSearchParams();

  if (category) {
    params.set('category', category);
  }

  if (currentPage && currentPage > 1) {
    params.set('page', currentPage.toString());
  }

  const queryString = params.toString();
  return queryString ? `/blog?${queryString}` : '/blog';
}

/**
 * Builds a URL with page number, preserving category filter if present
 * @param page - Page number to navigate to
 * @param currentCategory - Current category filter to preserve (optional)
 * @returns Relative URL starting with /blog
 */
export function buildPaginationUrl(page: number, currentCategory?: string | null): string {
  const params = new URLSearchParams();

  if (currentCategory) {
    params.set('category', currentCategory);
  }

  if (page > 1) {
    params.set('page', page.toString());
  }

  const queryString = params.toString();
  return queryString ? `/blog?${queryString}` : '/blog';
}

/**
 * General URL builder for blog pages with multiple parameters
 * @param params - Object containing category and/or page parameters
 * @returns Relative URL starting with /blog
 */
export function buildBlogUrl(params: { category?: string | null; page?: number }): string {
  const searchParams = new URLSearchParams();

  if (params.category) {
    searchParams.set('category', params.category);
  }

  if (params.page && params.page > 1) {
    searchParams.set('page', params.page.toString());
  }

  const queryString = searchParams.toString();
  return queryString ? `/blog?${queryString}` : '/blog';
}
