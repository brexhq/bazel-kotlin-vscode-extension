#!/bin/bash

NEW_VERSION="$1"  # Take version from command line argument
PREV_VERSION="$2" # Take previous version from command line argument

# Create a temporary file with the new version header
echo "# Changelog\n\n## $NEW_VERSION ($(date +%Y-%m-%d))\n" > CHANGELOG.tmp

# Add all commits between previous and new version
git log --pretty=format:"* %s" $PREV_VERSION..$NEW_VERSION >> CHANGELOG.tmp

# Add a line break and append existing changelog
echo "\n" >> CHANGELOG.tmp
cat CHANGELOG.md >> CHANGELOG.tmp

# Replace the old changelog with the new one
mv CHANGELOG.tmp CHANGELOG.md