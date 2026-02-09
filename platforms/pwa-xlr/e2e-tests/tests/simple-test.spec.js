const { test, expect } = require('@playwright/test');

// Simple test to debug authentication
test('Debug - Login and navigate to player', async ({ page }) => {
  console.log('Step 1: Going to CMS...');
  await page.goto('https://displays.superpantalles.com');

  console.log('Step 2: Checking for login form...');
  await page.screenshot({ path: './screenshots/01-initial-page.png', fullPage: true });

  // Login if needed
  const usernameField = page.locator('input[name="username"]');
  if (await usernameField.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('Step 3: Logging in...');
    await usernameField.fill('xibo_admin');
    await page.locator('input[name="password"]').fill('¿¡Dd20#j3hqc3Mp.!?');
    await page.screenshot({ path: './screenshots/02-filled-login.png', fullPage: true });

    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState('networkidle');

    // Verify login was successful
    const loginError = await page.locator('text="incorrectes"').isVisible({ timeout: 1000 }).catch(() => false);
    if (loginError) {
      throw new Error('Login failed - incorrect credentials');
    }
    console.log('✅ Logged in successfully');
  }

  await page.screenshot({ path: './screenshots/03-after-login.png', fullPage: true });

  console.log('Step 4: Going to media library...');
  await page.goto('https://displays.superpantalles.com/library/view');
  await page.waitForLoadState('networkidle');

  await page.screenshot({ path: './screenshots/04-media-library.png', fullPage: true });

  // Count media items
  const mediaCount = await page.locator('tr[data-media-id]').count();
  console.log(`Found ${mediaCount} media items`);

  expect(mediaCount).toBeGreaterThan(0);

  console.log('Step 5: Going to player...');
  await page.goto('https://displays.superpantalles.com/player/xlr/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: './screenshots/05-player-page.png', fullPage: true });

  const playerTitle = await page.title();
  console.log(`Player title: ${playerTitle}`);

  console.log('✅ Test complete - check screenshots folder');
});
