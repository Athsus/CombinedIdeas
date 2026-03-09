#!/usr/bin/env bash
set -euo pipefail
cd /home/ya/ideasCombine
git add .
GIT_AUTHOR_NAME='Athsus' GIT_AUTHOR_EMAIL='Athsus@users.noreply.github.com' GIT_COMMITTER_NAME='Athsus' GIT_COMMITTER_EMAIL='Athsus@users.noreply.github.com' git commit --trailer "Made-with: Cursor" -m "$(cat <<'EOF'
Initialize Ideas Combine workspace

Set up the first React product container with a playable Gomoku page, GitHub Pages deployment, and Supabase-ready gameplay tracking.
EOF
)"
git status --short