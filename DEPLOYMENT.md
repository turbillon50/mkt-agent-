# Goossip deployment policy

## Source of truth

- Repository: https://github.com/turbillon50/mkt-agent-.git
- Production branch: main
- Existing Vercel project: goossip
- Vercel project ID: prj_XY5A2xs0bxjtX89MBKYtR8B1UOyh
- Vercel team: luis-projects-48b011f9
- Root directory: .

Production is deployed only by the Vercel Git integration after a commit reaches
main. Do not run vercel --prod, vercel deploy --prod, or vercel promote from
Hetzner, an agent worktree, or a developer machine.

## Safe preview

Use the canonical, linked checkout and a clean remote feature branch:

~~~bash
cd /home/goossip-eon-20260916
git switch <feature-branch>
git pull --ff-only origin <feature-branch>
./scripts/vercel-preview.sh
~~~

The script refuses to run from main or master, from a dirty or detached
checkout, when the branch is not pushed at the same commit, when origin is
not the official repository, or when the local Vercel link is not the existing
Goossip project. It invokes a preview deployment only; it has no production or
promotion flag.

## Hetzner

Hetzner may run workers, tests, and agents, but it is not a production
deployment hop. Old checkouts must remain unlinked from the Vercel project.

