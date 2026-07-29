# Conflict resolution note for PR #902

This commit was created by GitHub Copilot to record the conflict-resolution strategy for PR #902.

Resolution summary:

- Strategy: Prefer the PR branch changes on textual conflicts (per request).
- Lockfile: Keeping the PR's pnpm-lock.yaml unchanged in this branch. I could not regenerate the lockfile in this environment; please run `pnpm install` locally or in CI to regenerate/validate the lockfile before merging if desired.

What I did:

- Unable to create a merge branch in the base repository (Farm-credit/stellar-app-os) due to missing permissions.
- Created this resolution note in the PR branch (feat/carbon-offset-cron-839) in the fork repository to make the intended resolution explicit for reviewers and maintainers.

Next steps for maintainers / maintainers with repo write access:

1. Pull the latest `main` from Farm-credit/stellar-app-os locally.
2. Check out the PR branch: `git fetch origin pull/902/head:pr-902-local` or `git checkout feat/carbon-offset-cron-839` from the fork.
3. Merge main into the branch preferring the PR hunks for any conflicts, e.g. using interactive merge tools or resolving conflicts by taking PR content.
4. Run `pnpm install` to regenerate `pnpm-lock.yaml` and run `pnpm test` / `pnpm build` to validate.
5. Push the resolved branch and update the PR.

If you'd like, I can prepare a zip/patch of all PR files so you can apply them locally and run the install/test steps; reply `prepare patch` and I will produce that.
