const { test, expect } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';
const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

test.setTimeout(180000);

async function login(page) {
  await page.goto(CMS_URL);
  const usernameField = page.locator('input[name="username"]');
  if (await usernameField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await usernameField.fill('xibo_admin');
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState('networkidle');
  }
}

test('Get hardware key and configure player for playback', async ({ page }) => {
  console.log('\n=== GET KEY & CONFIGURE PLAYER ===\n');

  await login(page);

  // Step 1: Go to displays and get hardware key
  console.log('Step 1: Getting hardware key from display...');
  await page.goto(`${CMS_URL}/display/view`);
  await page.waitForTimeout(2000);

  await page.screenshot({ path: './screenshots/key-01-displays.png', fullPage: true });

  // Click on first display (test_pwa)
  const firstDisplay = await page.locator('tr[data-display-id]').first();
  const displayName = await firstDisplay.locator('td:nth-child(2)').innerText();

  console.log(`  Found display: ${displayName}`);

  // Click row menu button
  const menuBtn = await firstDisplay.locator('button[aria-label*="Menú"], button[class*="dropdown"]').first();
  if (await menuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await menuBtn.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: './screenshots/key-02-menu.png', fullPage: true });

    // Look for Edit or Details option
    const editBtn = await page.getByRole('link', { name: /edit|edita|manage|gestiona/i }).first();
    if (await editBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(2000);

      await page.screenshot({ path: './screenshots/key-03-edit-dialog.png', fullPage: true });

      // Look for hardware key field
      const hardwareKeyField = await page.locator('input[value*=""], code, pre, [class*="license"], [id*="hardwareKey"]');

      // Try to find and extract key
      const extractedKey = await page.evaluate(() => {
        // Look for any field that might contain the key
        const inputs = document.querySelectorAll('input[type="text"], input[readonly]');
        for (const input of inputs) {
          if (input.value && input.value.length > 30) {
            return input.value;
          }
        }

        // Look for displayed text
        const codeBlocks = document.querySelectorAll('code, pre, kbd');
        for (const block of codeBlocks) {
          if (block.innerText && block.innerText.length > 30) {
            return block.innerText;
          }
        }

        return null;
      });

      if (extractedKey) {
        console.log(`\n✅ Hardware Key Found: ${extractedKey.substring(0, 40)}...`);

        // Step 2: Configure player with this key
        console.log('\nStep 2: Configuring player with extracted key...');

        await page.goto(PLAYER_URL);
        await page.waitForTimeout(2000);

        // Inject configuration
        await page.evaluate((config) => {
          localStorage.setItem('xiboConfig', JSON.stringify(config));
        }, {
          cmsAddress: CMS_URL,
          cmsKey: extractedKey,
          displayName: displayName,
          configured: true
        });

        console.log('✅ Configuration injected');

        // Step 3: Reload and play
        console.log('\nStep 3: Reloading player...');
        await page.reload();
        await page.waitForLoadState('networkidle');

        await page.screenshot({ path: './screenshots/key-04-player-loading.png', fullPage: true });

        // Wait for initialization
        console.log('\nStep 4: Waiting for playback (15 seconds)...');
        await page.waitForTimeout(15000);

        await page.screenshot({ path: './screenshots/key-05-playing.png', fullPage: true });

        // Display for 5 seconds
        console.log('\nStep 5: Displaying player (5 seconds)...');
        await page.waitForTimeout(5000);

        await page.screenshot({ path: './screenshots/key-06-playing-5s.png', fullPage: true });

        const finalState = await page.evaluate(() => ({
          url: window.location.href,
          isSetup: window.location.href.includes('setup.html'),
          hasXLR: typeof window.xlr !== 'undefined',
          bodyPreview: document.body.innerText.substring(0, 200)
        }));

        console.log('\n✅ Final state:', JSON.stringify(finalState, null, 2));

        expect(finalState.isSetup).toBe(false); // Should not be in setup mode
        expect(finalState.hasXLR).toBe(true); // Should have XLR engine

      } else {
        console.log('\n⚠️  Could not extract hardware key automatically');
        console.log('   Manual configuration may be needed');
      }
    }
  } else {
    console.log('\n⚠️  Could not find menu button');
  }

  console.log('\n=== TEST COMPLETE ===');
});
