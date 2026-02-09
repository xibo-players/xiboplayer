const { test, expect } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';

test.describe.configure({ mode: 'serial' });

test.describe('Media Playback Tests', () => {

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

  test('TEST 1: Create layout with test image', async ({ page }) => {
    await login(page);
    console.log('\n=== TEST 1: CREATE IMAGE LAYOUT ===\n');

    // Go to layouts
    console.log('Step 1: Opening layouts page...');
    await page.goto(`${CMS_URL}/layout/view`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: './screenshots/test1-01-layouts-page.png', fullPage: true });

    // Click Add Layout
    console.log('Step 2: Clicking Add Layout...');
    const addBtn = await page.getByRole('button', { name: /afegeix|add/i }).first();
    await addBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: './screenshots/test1-02-add-layout-dialog.png', fullPage: true });

    // Fill layout name
    console.log('Step 3: Creating "Test Image Layout"...');
    const nameInput = await page.locator('input[name="name"]').first();
    await nameInput.fill('Test Image Layout');
    await page.waitForTimeout(500);

    // Save
    const saveBtn = await page.getByRole('button', { name: /desa|save/i }).first();
    await saveBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: './screenshots/test1-03-layout-created.png', fullPage: true });

    console.log('✅ Layout "Test Image Layout" created!');

    // Now add image widget
    console.log('\nStep 4: Opening layout designer...');
    await page.goto(`${CMS_URL}/layout/view`);
    await page.waitForTimeout(2000);

    const layoutRow = await page.locator('text="Test Image Layout"').first();
    await layoutRow.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: './screenshots/test1-04-designer-opened.png', fullPage: true });

    console.log('✅ TEST 1 COMPLETE - Image layout created');
  });

  test('TEST 2: Create layout with test video', async ({ page }) => {
    await login(page);
    console.log('\n=== TEST 2: CREATE VIDEO LAYOUT ===\n');

    // Go to layouts
    console.log('Step 1: Opening layouts page...');
    await page.goto(`${CMS_URL}/layout/view`);
    await page.waitForLoadState('networkidle');

    // Click Add Layout
    console.log('Step 2: Creating "Test Video Layout"...');
    const addBtn = await page.getByRole('button', { name: /afegeix|add/i }).first();
    await addBtn.click();
    await page.waitForTimeout(2000);

    // Fill layout name
    const nameInput = await page.locator('input[name="name"]').first();
    await nameInput.fill('Test Video Layout');
    await page.waitForTimeout(500);

    await page.screenshot({ path: './screenshots/test2-01-creating-video-layout.png', fullPage: true });

    // Save
    const saveBtn = await page.getByRole('button', { name: /desa|save/i }).first();
    await saveBtn.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: './screenshots/test2-02-video-layout-created.png', fullPage: true });

    console.log('✅ Layout "Test Video Layout" created!');

    // Verify both layouts exist
    console.log('\nStep 3: Verifying both layouts exist...');
    await page.goto(`${CMS_URL}/layout/view`);
    await page.waitForTimeout(2000);

    const imageLayout = await page.locator('text="Test Image Layout"').isVisible();
    const videoLayout = await page.locator('text="Test Video Layout"').isVisible();

    console.log(`  - Image Layout exists: ${imageLayout}`);
    console.log(`  - Video Layout exists: ${videoLayout}`);

    await page.screenshot({ path: './screenshots/test2-03-both-layouts-exist.png', fullPage: true });

    expect(imageLayout).toBe(true);
    expect(videoLayout).toBe(true);

    console.log('\n✅ TEST 2 COMPLETE - Both layouts created and verified');
  });

});
