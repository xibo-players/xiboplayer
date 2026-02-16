/**
 * CMS REST API Client — re-exports from @xiboplayer/utils (single source of truth)
 *
 * This module re-exports the shared CmsApiClient and adds a compatibility
 * wrapper that maps the AI module's { cmsUrl } option to the shared { baseUrl }.
 *
 * @module @xiboplayer/ai/cms-api
 */

import { CmsApiClient as SharedCmsApiClient, CmsApiError } from '@xiboplayer/utils';

/**
 * CMS API Client with AI module compatibility.
 * Accepts both { baseUrl } (shared convention) and { cmsUrl } (AI convention).
 */
class CmsApiClient extends SharedCmsApiClient {
  constructor(options = {}) {
    super({
      baseUrl: options.baseUrl || options.cmsUrl || '',
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      apiToken: options.apiToken,
    });
  }
}

export { CmsApiClient, CmsApiError };
