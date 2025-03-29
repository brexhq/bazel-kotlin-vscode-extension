#!/bin/bash

NEW_VERSION="$1"  
PREV_VERSION="$2"

# If NEW_VERSION is an actual tag, use it; otherwise use HEAD
if git rev-parse "$NEW_VERSION" >/dev/null 2>&1; then
  NEW_REF="$NEW_VERSION"
else
  NEW_REF="HEAD"
fi

# Create the changelog header without using echo -e
cat > CHANGELOG.tmp << EOF
# Changelog

## $NEW_VERSION ($(date +%Y-%m-%d))

EOF

# Add all commits between previous and new version
git log --pretty=format:"* %s" $PREV_VERSION..$NEW_REF >> CHANGELOG.tmp

# Add proper spacing using printf
printf "\n\n" >> CHANGELOG.tmp

# Append existing changelog
cat CHANGELOG.md >> CHANGELOG.tmp

# Replace the old changelog with the new one
mv CHANGELOG.tmp CHANGELOG.md