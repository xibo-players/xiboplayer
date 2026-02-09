#!/bin/bash

# Monitor exhaustive test status

RESULTS_FILE="/home/pau/Devel/tecman/xibo_players/platforms/pwa-xlr/e2e-tests/exhaustive-test-results.json"
SCREENSHOTS_DIR="/home/pau/Devel/tecman/xibo_players/platforms/pwa-xlr/e2e-tests/screenshots"

echo "=========================================="
echo "PWA-XLR EXHAUSTIVE TEST STATUS"
echo "=========================================="
echo ""

# Check if test is running
if pgrep -f "exhaustive-playback-test.js" > /dev/null; then
    echo "✓ Test is RUNNING"
    echo ""
else
    echo "✗ Test is NOT running"
    echo ""
fi

# Check results file
if [ -f "$RESULTS_FILE" ]; then
    echo "=== CURRENT RESULTS ==="

    # Parse JSON using node
    node -e "
    const fs = require('fs');
    const results = JSON.parse(fs.readFileSync('$RESULTS_FILE', 'utf8'));

    console.log('Start Time:', results.startTime);
    console.log('End Time:', results.endTime || 'In progress...');
    console.log('');
    console.log('SUMMARY:');
    console.log('  Total iterations:', results.summary.total);
    console.log('  Passed:', results.summary.passed);
    console.log('  Failed:', results.summary.failed);

    if (results.summary.total > 0) {
        const passRate = (results.summary.passed / results.summary.total * 100).toFixed(1);
        console.log('  Pass rate:', passRate + '%');
    }

    console.log('');

    if (results.iterations.length > 0) {
        const lastIter = results.iterations[results.iterations.length - 1];
        console.log('LAST ITERATION (#' + lastIter.iteration + '):');
        console.log('  Status:', lastIter.success ? '✓ PASSED' : '✗ FAILED');
        if (lastIter.error) {
            console.log('  Error:', lastIter.error);
        }
        if (lastIter.playbackStatus) {
            console.log('  Content playing:', lastIter.playbackStatus.isPlaying ? 'YES' : 'NO');
        }
        console.log('  Screenshots:', lastIter.screenshots.length);
    }

    if (results.summary.errors.length > 0) {
        console.log('');
        console.log('ERRORS:');
        results.summary.errors.forEach(err => {
            console.log('  Iteration', err.iteration + ':', err.error);
        });
    }
    " 2>/dev/null || echo "Could not parse results file"
else
    echo "No results file found yet"
fi

echo ""
echo "=== SCREENSHOTS ==="
if [ -d "$SCREENSHOTS_DIR" ]; then
    SCREENSHOT_COUNT=$(find "$SCREENSHOTS_DIR" -name "*.png" | wc -l)
    echo "Total screenshots: $SCREENSHOT_COUNT"
    echo ""
    echo "Recent screenshots:"
    ls -lt "$SCREENSHOTS_DIR" | grep "\.png$" | head -5 | awk '{print "  " $9 " (" $6, $7, $8 ")"}'
else
    echo "No screenshots directory found"
fi

echo ""
echo "=========================================="
