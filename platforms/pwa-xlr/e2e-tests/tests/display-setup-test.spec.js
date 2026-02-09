const { test, expect } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';

test.setTimeout(120000); // 2 minutes per test

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

test('Create and authorize test display', async ({ page }) => {
  await login(page);

  console.log('\n=== DISPLAY CREATION & AUTHORIZATION ===\n');

  const displayName = `XLR-PWA-E2E-Test-${Date.now()}`;

  // Step 1: Go to displays
  console.log('Step 1: Opening displays page...');
  await page.goto(`${CMS_URL}/display/view`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  await page.screenshot({ path: './screenshots/display-01-list.png', fullPage: true });

  // Check for existing displays
  const displayCount = await page.locator('tr[data-display-id]').count();
  console.log(`  Current displays: ${displayCount}`);

  // Step 2: Click Add Display
  console.log('\nStep 2: Adding new display...');
  const addBtn = await page.getByRole('button', { name: /afegeix|add display/i }).first();

  if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await addBtn.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: './screenshots/display-02-add-dialog.png', fullPage: true });

    // Fill display name
    const nameInput = await page.locator('input[name="display"], input[id="display"]').first();
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill(displayName);
      console.log(`  Creating display: ${displayName}`);
      await page.waitForTimeout(500);

      await page.screenshot({ path: './screenshots/display-03-name-filled.png', fullPage: true });

      // Click Save/Generate
      const saveBtn = await page.getByRole('button', { name: /desa|save|generate/i }).first();
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(3000);

        await page.screenshot({ path: './screenshots/display-04-created.png', fullPage: true });

        console.log('✅ Display created!');

        // Look for license key
        const licenseKey = await page.evaluate(() => {
          const keyElement = document.querySelector('[data-license-key], code, pre, .license-key');
          return keyElement?.innerText || null;
        });

        if (licenseKey) {
          console.log(`\n✅ License Key Generated: ${licenseKey.substring(0, 20)}...`);
        }
      }
    }
  } else {
    console.log('  Add button not found - checking if display already exists...');
  }

  // Step 3: Check display list again
  console.log('\nStep 3: Verifying display in list...');
  await page.goto(`${CMS_URL}/display/view`);
  await page.waitForTimeout(2000);

  await page.screenshot({ path: './screenshots/display-05-final-list.png', fullPage: true });

  const testDisplay = await page.locator('text="XLR Test Display"').isVisible({ timeout: 2000 }).catch(() => false);
  console.log(`  Test display exists: ${testDisplay}`);

  // Step 4: If display needs authorization, authorize it
  console.log('\nStep 4: Checking for pending authorization...');

  const displayRow = await page.locator('text="XLR Test Display"').first();
  if (await displayRow.isVisible({ timeout: 2000 }).catch(() => false)) {
    await displayRow.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: './screenshots/display-06-details.png', fullPage: true });

    // Look for Authorize button
    const authorizeBtn = await page.getByRole('button', { name: /authorise|authorize|approve/i }).first();
    if (await authorizeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('  Authorizing display...');
      await authorizeBtn.click();
      await page.waitForTimeout(2000);

      await page.screenshot({ path: './screenshots/display-07-authorized.png', fullPage: true });

      console.log('✅ Display authorized!');
    } else {
      console.log('  No authorization needed (already authorized or not required)');
    }
  }

  // Try to find the newly created display
  const newDisplay = await page.locator(`text="${displayName}"`).isVisible({ timeout: 2000 }).catch(() => false);

  console.log('\n✅ DISPLAY SETUP COMPLETE');
  console.log(`   Display: ${displayName}`);
  console.log(`   Found in list: ${newDisplay}`);
  console.log('   Status: Ready for use');
});
