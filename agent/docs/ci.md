# Running Domino on pull requests

Domino needs three things at check time: a Nightshift runtime with a Nemotron lane, a Zetaris install with the system's facts in the semantic layer, and the data layer's experiment worlds. Where those live decides how PR checks run.

## On the machine that has Nightshift and Zetaris (what the demo uses)

```
domino doctor
domino watch --repo owner/name --post
```

`watch` polls open pull requests with `gh` every 60 s. It checks each new head commit once, one at a time, and posts one comment (edited in place on later pushes) plus a `domino/check` commit status. That status appears in the PR's checks list like any CI job and can be made a required check in branch protection.

- No inbound ports are opened, and PR code is never checked out or run: Domino reads the diff only.
- Drafts and PRs from forks are skipped unless `--include-drafts` / `--include-forks` is passed.
- `domino.json` is read from the base branch, so a PR cannot remap its own folders.
- Without `--post`, nothing reaches GitHub. The comment is written to `runs/live/pr-<repo>-<n>-<sha>.md` instead.

## Why not a GitHub-hosted runner

A hosted runner is a fresh machine in GitHub's cloud. It cannot reach a Nightshift or Zetaris that runs on a laptop. Tunnelling those services to the internet would expose the model provider and the data layer, so don't.

A self-hosted runner on the laptop works only for **private** repositories. On a public repository, anyone can open a pull request that changes the workflow and runs code on that machine.

## GitHub Actions, for a team that hosts Nightshift and Zetaris

When both run somewhere the runner can reach (a private network the runner sits in), a workflow can call Domino directly. Not enabled in this repo; a sketch:

```yaml
# .github/workflows/domino.yml
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
  pull-requests: write
  statuses: write
jobs:
  domino:
    if: github.event.pull_request.head.repo.full_name == github.repository   # no forks
    runs-on: [self-hosted, domino]   # a runner inside the network that reaches Nightshift and Zetaris
    env:
      METERLESS_BASE_URL: ${{ secrets.METERLESS_BASE_URL }}
      METERLESS_RUNTIME_TOKEN: ${{ secrets.METERLESS_RUNTIME_TOKEN }}
      DOMINO_DATA_REPO: ${{ github.workspace }}/domino
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v4
        with: { repository: alleti01/Domino, ref: abhijandyala, path: domino }
      - run: cd domino/agent && npm ci && npm link
      - run: domino doctor
      - run: domino pr ${{ github.event.pull_request.number }} --repo ${{ github.repository }} --post --fail-on-break
```

The data layer reads its Zetaris settings from `domino/.env` (`DOMINO_DATA_MODE=live`, the read-only login). Write it from secrets in a step before `doctor`, and never commit it.

## For a product

A GitHub App sends `pull_request` webhooks to a Domino service that a team runs next to its own Zetaris and model endpoint. It runs the same `checkPr` (`src/watch.ts`) and posts through the App's installation token. That is the step after the hackathon.
