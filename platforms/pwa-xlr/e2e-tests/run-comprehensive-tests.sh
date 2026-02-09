#!/bin/bash

# Comprehensive Test Suite Runner with Interactive Display

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     PWA-XLR COMPREHENSIVE TEST SUITE                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "This will test:"
echo "  • All media types (image, video, text, embedded, etc.)"
echo "  • Layout types (single, multi-region, overlays)"
echo "  • Scheduling (time-based, daypart, priorities)"
echo "  • Transitions and effects"
echo "  • Long-term stability"
echo ""
read -p "Press Enter to start, or Ctrl+C to cancel..."
echo ""

# Clean up old results
rm -f comprehensive-test-results.json
rm -rf comprehensive-test-screenshots

# Run test suite
node comprehensive-test-suite.js | tee comprehensive-test-output.log

EXIT_CODE=$?

echo ""
echo "════════════════════════════════════════════════════════════"
echo "TEST COMPLETE"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Results:"
echo "  • Full output: comprehensive-test-output.log"
echo "  • JSON results: comprehensive-test-results.json"
echo "  • Screenshots: comprehensive-test-screenshots/"
echo ""

if [ $EXIT_CODE -eq 0 ]; then
    echo "✓ All tests passed!"
else
    echo "✗ Some tests failed. Review the output above."
fi

echo ""
echo "To view detailed results:"
echo "  cat comprehensive-test-results.json | jq"
echo ""
echo "To view screenshots:"
echo "  ls -lht comprehensive-test-screenshots/"
echo ""

exit $EXIT_CODE
