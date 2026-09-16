#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_REMOTE="https://github.com/turbillon50/mkt-agent-.git"
readonly EXPECTED_PROJECT_ID="prj_XY5A2xs0bxjtX89MBKYtR8B1UOyh"
readonly EXPECTED_ORG_ID="team_gK8RSuGh0CYHEjgEqFRR2iIk"
readonly EXPECTED_SCOPE="luis-projects-48b011f9"

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

remote="$(git remote get-url origin)"
if [[ "$remote" != "$EXPECTED_REMOTE" ]]; then
  printf 'Refusing preview: unexpected origin %s\n' "$remote" >&2
  exit 1
fi

branch="$(git symbolic-ref --quiet --short HEAD || true)"
if [[ -z "$branch" || "$branch" == "main" || "$branch" == "master" ]]; then
  printf 'Refusing preview: use a pushed feature branch, never main/master.\n' >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Refusing preview: the checkout is dirty.\n' >&2
  exit 1
fi

git fetch --quiet origin "$branch"
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$branch")" ]]; then
  printf 'Refusing preview: local HEAD does not match origin/%s.\n' "$branch" >&2
  exit 1
fi

link_file="$repo_root/.vercel/project.json"
if [[ ! -f "$link_file" ]]; then
  printf 'Refusing preview: this checkout is not linked to Vercel.\n' >&2
  exit 1
fi

readarray -t vercel_link < <(
  node -e "const p=require(process.argv[1]); console.log(p.projectId || ''); console.log(p.orgId || '')" "$link_file"
)
if [[ "${vercel_link[0]:-}" != "$EXPECTED_PROJECT_ID" || "${vercel_link[1]:-}" != "$EXPECTED_ORG_ID" ]]; then
  printf 'Refusing preview: this checkout is linked to a different Vercel project.\n' >&2
  exit 1
fi

exec vercel deploy --yes --scope "$EXPECTED_SCOPE" --cwd "$repo_root"
