#!/bin/bash
set -e

VERSION=$(node -p "require('./package.json').version")
BRANCH="release/v${VERSION}"

echo "🚀 Starting release v${VERSION}"

# Check npm login
echo "📦 Checking npm authentication..."
if ! npm whoami &>/dev/null; then
  echo "❌ Not logged in to npm. Please run 'npm login' first."
  exit 1
fi
echo "✅ Logged in to npm as $(npm whoami)"

# Check gh auth
echo "🔑 Checking GitHub authentication..."
if ! gh auth status &>/dev/null; then
  echo "❌ Not logged in to GitHub CLI. Please run 'gh auth login' first."
  exit 1
fi
echo "✅ GitHub CLI authenticated"

# Ensure we're on main and up to date
echo "📥 Updating main branch..."
git checkout main
git pull origin main

# Create release branch
echo "🌿 Creating branch ${BRANCH}..."
git checkout -b "${BRANCH}"

# Commit changes
echo "📝 Committing release files..."
git add package.json LICENSE CHANGELOG.md
git commit -m "chore: prepare v${VERSION} release

- Add author field
- Add LICENSE file
- Add CHANGELOG.md"

# Push branch
echo "⬆️ Pushing branch..."
git push -u origin "${BRANCH}"

# Create PR with auto-merge
echo "🔀 Creating PR with auto-merge..."
PR_URL=$(gh pr create \
  --title "chore: release v${VERSION}" \
  --body "## Release v${VERSION}

Initial public release of expo-openclaw-chat.

### Changes
- Add author and license information
- Add CHANGELOG.md" \
  --head "${BRANCH}" \
  --base main)

echo "📋 PR created: ${PR_URL}"

# Enable auto-merge
gh pr merge --auto --squash "${PR_URL}"
echo "✅ Auto-merge enabled"

# Wait for PR to be merged
echo "⏳ Waiting for CI and merge..."
while true; do
  STATE=$(gh pr view "${PR_URL}" --json state -q '.state')
  if [ "$STATE" = "MERGED" ]; then
    echo "✅ PR merged!"
    break
  elif [ "$STATE" = "CLOSED" ]; then
    echo "❌ PR was closed without merging"
    exit 1
  fi
  echo "   Still waiting... (state: ${STATE})"
  sleep 10
done

# Switch to main and pull
echo "📥 Pulling merged changes..."
git checkout main
git pull origin main

# Create GitHub release (this also creates the tag)
echo "🏷️ Creating GitHub release..."
gh release create "v${VERSION}" \
  --title "v${VERSION}" \
  --notes "Initial release of expo-openclaw-chat.

See [CHANGELOG.md](CHANGELOG.md) for details."

echo "✅ GitHub release created"

# Publish to npm
echo "📦 Publishing to npm..."
npm publish

echo ""
echo "🎉 Release v${VERSION} complete!"
echo "   - GitHub: https://github.com/brunobar79/expo-openclaw-chat/releases/tag/v${VERSION}"
echo "   - npm: https://www.npmjs.com/package/expo-openclaw-chat"
