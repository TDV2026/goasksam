#!/bin/bash
# Vercel's ignoreCommand (vercel.json runs: bash scripts/vercelIgnore.sh). Exit 0 = skip this build, exit 1 = build. Vercel limits the ignoreCommand string to 256 characters, so the logic lives here.
# - no previous deployment, or the previous built commit is HEAD itself (a redeploy of the commit already built, the only way an environment variable takes effect): BUILD.
# - a previous commit this checkout does not hold (after one fetch): BUILD.
# - nothing but docs changed since the last built commit: SKIP. Anything else (code, vercel.json, data): BUILD.
p="$VERCEL_GIT_PREVIOUS_SHA"
[ -n "$p" ] || exit 1
[ "$(git rev-parse HEAD)" != "$p" ] || exit 1
git cat-file -e "$p^{commit}" 2>/dev/null || git fetch -q --deepen=300 2>/dev/null
git cat-file -e "$p^{commit}" 2>/dev/null || exit 1
git diff --quiet "$p" HEAD -- . ":!docs" && exit 0
exit 1
