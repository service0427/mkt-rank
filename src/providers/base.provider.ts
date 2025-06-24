import { SearchProvider, SearchResponse, ApiError } from '../types';
import { logger } from '../utils/logger';

export abstract class BaseSearchProvider implements SearchProvider {
  protected abstract providerName: string;
  protected abstract apiUrl: string;

  /**
   * Perform a search for the given keyword
   * @param keyword The search keyword
   * @param page The page number (optional)
   * @returns SearchResponse containing results and total count
   */
  abstract search(keyword: string, page?: number): Promise<SearchResponse>;

  /**
   * Log API request details
   */
  protected logRequest(keyword: string, page?: number): void {
    logger.debug(`[${this.providerName}] Searching for keyword: ${keyword}`, {
      provider: this.providerName,
      keyword,
      page: page || 1,
    });
  }

  /**
   * Log API response details
   */
  protected logResponse(
    keyword: string,
    resultCount: number,
    totalCount: number
  ): void {
    logger.info(
      `[${this.providerName}] Search completed for keyword: ${keyword}`,
      {
        provider: this.providerName,
        keyword,
        resultCount,
        totalCount,
      }
    );
  }

  /**
   * Handle API errors
   */
  protected handleError(error: any, keyword: string): never {
    const errorMessage = error.response?.data?.errorMessage || error.message;
    const statusCode = error.response?.status;

    logger.error(
      `[${this.providerName}] Search failed for keyword: ${keyword}`,
      {
        provider: this.providerName,
        keyword,
        error: errorMessage,
        statusCode,
      }
    );

    throw new ApiError(errorMessage, statusCode, this.providerName);
  }

  /**
   * Validate search parameters
   */
  protected validateParameters(keyword: string, page?: number): void {
    if (!keyword || keyword.trim().length === 0) {
      throw new ApiError(
        'Keyword is required and cannot be empty',
        400,
        this.providerName
      );
    }

    if (page !== undefined && (page < 1 || !Number.isInteger(page))) {
      throw new ApiError(
        'Page must be a positive integer',
        400,
        this.providerName
      );
    }
  }

  /**
   * Sleep for rate limiting
   */
  protected async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}