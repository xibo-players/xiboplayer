// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Shared Playwright helpers for the CMS e2e specs.
 *
 * The player renders every XLF region as
 * `<div id="region_<regionId>" class="renderer-lite-region">`
 * (see @xiboplayer/renderer createRegion). Specs create a layout through
 * the CMS API, then wait for that region to exist in the running player
 * before asserting on widget content.
 */
import { expect } from '@playwright/test';

/**
 * CSS selector for the region element of a CMS regionId.
 * @param {string|number} regionId
 * @returns {string}
 */
export function regionSelector(regionId) {
  return `#region_${regionId}`;
}

/**
 * Navigate to the player (baseURL comes from PLAYER_URL) and wait until
 * the region for `regionId` is attached. The player has to register,
 * collect the schedule and render, so allow up to `timeout` ms.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string|number} regionId
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<import('@playwright/test').Locator>}
 */
export async function gotoPlayerAndWaitForRegion(page, regionId, opts = {}) {
  const timeout = opts.timeout ?? 90_000;
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const region = page.locator(regionSelector(regionId));
  await expect(region).toBeAttached({ timeout });
  return region;
}

/**
 * Wait, without navigating, until the region for `regionId` shows up in
 * the already-open player. Used after a schedule change: the player picks
 * the new layout up on its next collection cycle, so the default timeout
 * is generous.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string|number} regionId
 * @param {number} [timeout=180000]
 * @returns {Promise<import('@playwright/test').Locator>}
 */
export async function waitForRegionChange(page, regionId, timeout = 180_000) {
  const region = page.locator(regionSelector(regionId));
  await expect(region).toBeAttached({ timeout });
  return region;
}
