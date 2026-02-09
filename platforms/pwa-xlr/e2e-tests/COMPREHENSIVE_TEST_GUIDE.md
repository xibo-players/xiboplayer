# PWA-XLR Comprehensive Test Suite Guide

## Overview

This comprehensive test suite validates all aspects of PWA-XLR playback including media types, layouts, scheduling, priorities, and stability.

## Quick Start

```bash
cd /home/pau/Devel/tecman/xibo_players/platforms/pwa-xlr/e2e-tests

# Run complete test suite
./run-comprehensive-tests.sh

# Or run directly
node comprehensive-test-suite.js
```

## Test Suites

### 1. Media Types (6 tests)
Tests all supported media types:
- **Image Display**: Static images, multiple images, cycling
- **Video Playback**: Video loading, audio, looping, quality
- **Text Widget**: Text rendering, fonts, scrolling, overflow
- **Embedded Content**: HTML/JS embedding, interactive elements
- **Web Page Widget**: iframe embedding, interactivity, CORS
- **Data Widgets**: Tickers, stocks, weather, API integration

### 2. Layouts (4 tests)
Tests different layout configurations:
- **Single Region**: Full screen content, transitions
- **Multi-Region**: Multiple simultaneous content areas
- **Overlay Regions**: Layered content, transparency, z-index
- **Responsive Layout**: Resolution adaptation, scaling

### 3. Scheduling (4 tests)
Tests time-based playback:
- **Default Schedule**: Always-on fallback content
- **Time-Based Schedule**: Start/end times, transitions
- **Day Parting**: Morning/afternoon/evening content
- **Date Range Schedule**: Start/end dates, boundaries

### 4. Priorities (2 tests)
Tests priority-based interruptions:
- **Priority Interruption**: High priority overrides
- **Campaign Priority**: Campaign-level ordering

### 5. Transitions (2 tests)
Tests content and layout transitions:
- **Content Transitions**: Fade, slide, timing
- **Layout Transitions**: Clean switches, rendering

### 6. Stability (2 tests)
Tests long-term reliability:
- **Long-Term Playback**: Memory, performance, continuous operation
- **Error Recovery**: Missing media, network issues, graceful degradation

## Test Duration

- Per media type test: ~30 seconds
- Per layout test: ~45 seconds
- Scheduling tests: ~2 minutes each
- Stability test: ~5 minutes
- **Total estimated time: ~30-40 minutes**

## Output Files

### comprehensive-test-results.json
Structured JSON with all test results:
```json
{
  "startTime": "2026-02-02T18:00:00.000Z",
  "endTime": "2026-02-02T18:30:00.000Z",
  "testSuites": [
    {
      "name": "Media Types",
      "tests": [
        {
          "name": "Image Display",
          "status": "passed",
          "checks": [...],
          "screenshots": [...]
        }
      ]
    }
  ],
  "summary": {
    "totalTests": 20,
    "passed": 18,
    "failed": 2
  }
}
```

### comprehensive-test-screenshots/
Screenshots taken during testing:
- `{timestamp}-{suite}-{test}-start.png` - Test start state
- `{timestamp}-{suite}-{test}-end.png` - Test end state

### comprehensive-test-output.log
Complete console output with color codes and timestamps

## Interactive Features

The test suite provides real-time feedback:
- Color-coded output (cyan=info, green=success, red=fail)
- Progress indicators for each test
- Live check results (✓ pass, ✗ fail)
- Suite summaries after each group
- Final summary with pass rate

## Analyzing Results

### View Summary
```bash
cat comprehensive-test-results.json | jq '.summary'
```

### View Failed Tests
```bash
cat comprehensive-test-results.json | jq '.testSuites[].tests[] | select(.status == "failed")'
```

### View Specific Suite
```bash
cat comprehensive-test-results.json | jq '.testSuites[] | select(.name == "Media Types")'
```

### View Screenshots
```bash
# List all screenshots
ls -lht comprehensive-test-screenshots/

# View specific test screenshots
ls comprehensive-test-screenshots/*Image-Display*

# Open in image viewer
xdg-open comprehensive-test-screenshots/latest-screenshot.png
```

## Customizing Tests

Edit `comprehensive-test-suite.js` to:

### Change Test Duration
```javascript
testDuration: {
  perMediaType: 30000,     // 30s → change to your needs
  perLayout: 45000,        // 45s
  scheduleTest: 120000,    // 2min
  stabilityTest: 300000    // 5min
}
```

### Add Custom Tests
```javascript
getMediaTypeTests() {
  return [
    ...existingTests,
    {
      name: 'Custom Media Test',
      description: 'Test custom media type',
      checks: [
        'Check 1 description',
        'Check 2 description'
      ]
    }
  ];
}
```

### Modify Checks
Each test has a list of checks to verify. Add or modify as needed:
```javascript
checks: [
  'Existing check',
  'New check you want to add',
  'Another verification'
]
```

## Prerequisites

Before running tests, ensure:

1. ✓ Player deployed to https://displays.superpantalles.com/player/xlr/
2. ✓ Display authorized in CMS
3. ✓ CMS key is correct (`isiSdUCy`)
4. ✓ Test content exists in CMS:
   - Images
   - Videos
   - Text widgets
   - Various layouts
   - Scheduled content

## Troubleshooting

### Test Fails to Start
```bash
# Check if player is accessible
curl -I https://displays.superpantalles.com/player/xlr/

# Verify CMS key
grep cmsKey comprehensive-test-suite.js
```

### Authentication Fails
- Check CMS key is correct
- Verify display is authorized in CMS
- Check network connectivity

### Tests Pass But No Content Visible
- Verify layouts are assigned in CMS
- Check media files are uploaded
- Review CMS logs for errors

### Performance Issues
- Reduce test durations in config
- Run in headless mode (default)
- Close other applications

## Advanced Usage

### Run Specific Suite Only
Modify the script to run only certain suites:
```javascript
// Comment out suites you don't want
this.testSuites = [
  { name: 'Media Types', tests: this.getMediaTypeTests() },
  // { name: 'Layouts', tests: this.getLayoutTests() },
  // ... others commented
];
```

### Run in Headed Mode (See Browser)
Edit script:
```javascript
this.browser = await chromium.launch({
  headless: false,  // Change to false
  ...
});
```

### Continuous Testing
Run tests repeatedly:
```bash
while true; do
  ./run-comprehensive-tests.sh
  echo "Waiting 5 minutes before next run..."
  sleep 300
done
```

### Integration with CI/CD
```yaml
# Example GitLab CI
test:
  script:
    - cd e2e-tests
    - npm install
    - node comprehensive-test-suite.js
  artifacts:
    paths:
      - e2e-tests/comprehensive-test-results.json
      - e2e-tests/comprehensive-test-screenshots/
    reports:
      junit: e2e-tests/test-report.xml
```

## Interpreting Results

### Pass Rate Interpretation
- **95-100%**: Excellent, all critical features working
- **85-94%**: Good, minor issues
- **70-84%**: Fair, some significant issues
- **Below 70%**: Poor, major problems need attention

### Common Failure Patterns

**All tests fail:**
- Authentication issue
- Player not accessible
- CMS configuration problem

**Specific media type fails:**
- Missing media files in CMS
- Unsupported format
- Encoding issues

**Scheduling tests fail:**
- Clock sync issues
- Incorrect timezone
- Schedule configuration in CMS

**Stability tests fail:**
- Memory leaks
- Performance degradation
- Network issues

## Best Practices

1. **Run tests after deployment** - Verify everything works after updates
2. **Run tests periodically** - Catch regressions early
3. **Review screenshots** - Visual verification is important
4. **Check trends** - Compare results over time
5. **Document failures** - Track recurring issues
6. **Update tests** - Add tests for new features

## Support

For issues with the test suite:
- Check logs: `comprehensive-test-output.log`
- Review results: `comprehensive-test-results.json`
- Examine screenshots: `comprehensive-test-screenshots/`

For issues with the player itself:
- Check player logs in browser console
- Review CMS logs
- Check network traffic

## Next Steps

After running comprehensive tests, you can:
1. Review failed tests and fix issues
2. Add custom tests for your specific needs
3. Integrate into CI/CD pipeline
4. Schedule regular test runs
5. Create test reports for stakeholders
