#!/bin/sh
# Vercel's ignored build step (vercel.json ignoreCommand; Sam, Oct 16 2026): a push whose changes since the last
# successful deploy are ALL under docs/ does not deploy; any change outside docs/ deploys. Exit 0 skips the build,
# any other exit builds, so every doubt (no previous deploy, the previous commit not in Vercel's 10-deep clone, a git
# error) builds. Compared against VERCEL_GIT_PREVIOUS_SHA (the last successful deploy), never HEAD^, so a code commit
# followed by a docs commit in one push still deploys.
prev="$VERCEL_GIT_PREVIOUS_SHA"
if [ -z "$prev" ]; then echo "ignoreCommand: no previous deploy, building"; exit 1; fi
git cat-file -e "$prev^{commit}" 2>/dev/null || git fetch -q --deepen=200 origin 2>/dev/null || true
if ! git cat-file -e "$prev^{commit}" 2>/dev/null; then echo "ignoreCommand: last deploy $prev not in the clone, building"; exit 1; fi
if git diff --quiet "$prev" HEAD -- . ':(exclude)docs/'; then
  echo "ignoreCommand: only docs/ changed since $prev, skipping the build"; exit 0
fi
echo "ignoreCommand: files outside docs/ changed since $prev, building"; exit 1
