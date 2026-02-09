#!/bin/bash
#
# Interactive rebase script to squash 97 commits into atomic units
# and remove Co-Authored-By lines
#

echo "PWA Feature Branch - Squash and Clean Rebase"
echo "=============================================="
echo ""
echo "This will:"
echo "1. Squash 97 commits into ~10-15 atomic commits"
echo "2. Remove all Co-Authored-By lines"
echo "3. Clean up commit messages"
echo ""
echo "Proposed atomic commits:"
echo "  1. fix: image loading (ReadableStream bug)"
echo "  2. feat: chunk-based storage + adaptive concurrency"
echo "  3. fix: layout ID/media ID confusion"
echo "  4. refactor: routing helper + utilities + logger"
echo "  5. fix: duplicate downloads prevention"
echo "  6. feat: progressive rendering (metadata-first)"
echo "  7. feat: download progress overlay"
echo "  8. docs: comprehensive documentation"
echo "  9-15. Earlier features (campaigns, dayparting, etc.)"
echo ""
echo "WARNING: This will rewrite history!"
echo "Press Ctrl+C to cancel, Enter to continue..."
read

# Start interactive rebase
echo "Starting interactive rebase..."
echo "In the editor:"
echo "  - Keep 'pick' for first commit of each feature"
echo "  - Change to 'squash' or 'fixup' for related commits"
echo "  - Save and close"
echo ""

# Get the base commit (97 commits ago)
BASE_COMMIT=$(git log --format="%H" main..HEAD | tail -1)
PARENT_COMMIT=$(git rev-parse ${BASE_COMMIT}^)

git rebase -i ${PARENT_COMMIT}

# After rebase, remove Co-Authored-By lines
echo ""
echo "Removing Co-Authored-By lines..."
git filter-branch -f --msg-filter '
  sed "/^Co-Authored-By:/d"
' ${PARENT_COMMIT}..HEAD

echo ""
echo "Rebase complete!"
echo ""
echo "Summary:"
git log --oneline main..HEAD
echo ""
echo "Total commits after squash:"
git log --oneline main..HEAD | wc -l
echo ""
echo "Next steps:"
echo "  1. Review: git log main..HEAD"
echo "  2. Force push: git push -f origin feature/standalone-service-worker"
echo "  3. Create PR to main"
