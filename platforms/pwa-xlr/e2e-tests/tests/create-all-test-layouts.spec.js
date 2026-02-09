const { test, expect } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';

test.setTimeout(600000); // 10 minutes

test.describe('Create Test Layouts via CMS UI', () => {

  test('CREATE-LAYOUTS: Create all media test layouts via Playwright', async ({ page }) => {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('CREATING ALL TEST LAYOUTS VIA CMS UI (PLAYWRIGHT)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Login to CMS
    console.log('Step 1: Logging into CMS...');
    await page.goto(`${CMS_URL}/login`);

    const usernameField = page.locator('input[name="username"]');
    if (await usernameField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await usernameField.fill('xibo_admin');
      await page.locator('input[name="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForLoadState('networkidle');
      console.log('✅ Logged in\n');
    }

    // Go to layouts page
    console.log('Step 2: Navigating to Layouts...');
    await page.goto(`${CMS_URL}/layout/view`);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: './screenshots/create-01-layouts-list.png', fullPage: true });

    // Check what layouts exist
    const existingLayouts = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        return cells.length > 0 ? cells[0]?.textContent?.trim() : null;
      }).filter(Boolean);
    });

    console.log(`Found ${existingLayouts.length} existing layouts:`);
    existingLayouts.slice(0, 10).forEach(name => console.log(`   - ${name}`));
    console.log('');

    // Layouts to create
    const layoutsNeeded = [
      { name: 'Test-Audio-MP3', widget: 'Audio', mediaName: 'test-audio.mp3' },
      { name: 'Test-Audio-WAV', widget: 'Audio', mediaName: 'test-audio.wav' },
      { name: 'Test-PDF-MultiPage', widget: 'PDF', mediaName: 'test-document.pdf' },
      { name: 'Test-Image-JPG', widget: 'Image', mediaName: 'test-image.jpg' },
      { name: 'Test-Video-MP4', widget: 'Video', mediaName: 'test-video.mp4' }
    ];

    console.log('Step 3: Creating missing layouts via UI...\n');

    for (const layout of layoutsNeeded) {
      if (existingLayouts.includes(layout.name)) {
        console.log(`✅ Layout "${layout.name}" already exists, skipping`);
        continue;
      }

      console.log(`Creating: ${layout.name}...`);

      try {
        // Click Add Layout button
        await page.goto(`${CMS_URL}/layout/view`);
        await page.waitForTimeout(2000);

        const addButton = page.getByRole('button', { name: /add layout/i }).first();
        if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await addButton.click();
          await page.waitForTimeout(2000);

          // Fill in layout form
          const nameInput = page.locator('input[name="name"]').first();
          await nameInput.fill(layout.name);

          // Select resolution (1920x1080)
          const resolutionSelect = page.locator('select[name="resolutionId"]').first();
          if (await resolutionSelect.isVisible().catch(() => false)) {
            await resolutionSelect.selectOption('9'); // 1920x1080
          }

          // Click save/next
          const saveButton = page.getByRole('button', { name: /save|next|create/i }).first();
          await saveButton.click();
          await page.waitForTimeout(3000);

          console.log(`   ✅ Layout "${layout.name}" created via UI`);

          await page.screenshot({ path: `./screenshots/create-layout-${layout.name}.png`, fullPage: true });

        } else {
          console.log(`   ⚠️  Could not find Add Layout button`);
        }

      } catch (error) {
        console.log(`   ❌ Error creating ${layout.name}: ${error.message}`);
      }
    }

    console.log('\n✅ Layout creation complete');
    console.log('   Note: Widgets need to be added manually in layout editor');
    console.log('   Or layouts can be created fully via CMS UI manually\n');

    await page.screenshot({ path: './screenshots/create-final-layouts-list.png', fullPage: true });

    console.log('═══════════════════════════════════════════════════════════\n');
  });

});
