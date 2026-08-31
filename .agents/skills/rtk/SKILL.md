---
name: rtk
description: Rust Token Killer (RTK) - token-optimized CLI wrapper for development commands. Prefer RTK for supported shell commands when compact output is sufficient; use the underlying command when exact, complete, interactive, or machine-readable output is required.
---

# RTK (Rust Token Killer) - Token-Optimized CLI Commands

## Core Rule

Prefer `rtk` for supported shell/terminal commands so command output is filtered before it reaches the model context.

RTK is an optimization layer, not a requirement to replace every command. Use the underlying command directly when:

- exact or complete output is required;
- interactive behavior is required;
- machine-readable output must be preserved exactly;
- output is being piped to another program and the original format matters;
- RTK does not provide a suitable wrapper/filter;
- debugging RTK or comparing filtered output with raw output.

Do not add `rtk` purely for rule compliance when it would reduce correctness or usefulness.

## Auto-Rewrite Hook

When RTK's hook/plugin integration is installed for the current AI tool, shell commands may be rewritten automatically to their RTK equivalents. In that setup, do not manually add `rtk` unless needed; the hook already performs the rewrite.

RTK's hook applies to supported shell/Bash tool calls. Built-in file tools such as `Read`, `Grep`, and `Glob` do not automatically pass through the Bash hook. When compact RTK output is desired for file/search workflows, use shell commands or explicit RTK commands such as `rtk read`, `rtk grep`, and `rtk find`.

If the current environment is not using an RTK auto-rewrite integration, invoke `rtk` explicitly for supported commands.

## Command Chains

When explicit RTK usage is needed, wrap each supported command independently in a shell chain:

```bash
rtk git add . && rtk git commit -m "msg" && rtk git push
```

Mix RTK and raw commands when a particular step needs unfiltered output:

```bash
rtk git status && git status --porcelain
```

## Files & Search

Prefer RTK for compact file inspection and search:

```bash
rtk ls .
rtk read file.rs
rtk read file.rs -l aggressive
rtk smart file.rs
rtk find "*.rs" .
rtk grep "pattern" .
rtk diff file1 file2
```

Use raw `cat`, `head`, `tail`, `rg`, `grep`, `find`, or `diff` when exact Unix/tool semantics or complete output are required.

## Git

Prefer RTK for normal human-readable Git workflows:

```bash
rtk git status
rtk git log -n 10
rtk git diff
rtk git add
rtk git commit -m "msg"
rtk git push
rtk git pull
```

Use raw Git when exact output, scripting, or machine-readable formats are required, for example:

```bash
git status --porcelain
git log --format=...
git diff --name-only
```

## GitHub CLI

Prefer RTK for human-readable GitHub CLI workflows:

```bash
rtk gh pr list
rtk gh pr view 42
rtk gh issue list
rtk gh run list
```

Use raw `gh` when an exact API response or machine-readable JSON is required.

## Test Runners

Prefer RTK for normal test runs where failures and concise results are sufficient:

```bash
rtk jest
rtk vitest
rtk playwright test
rtk pytest
rtk go test
rtk cargo test
rtk rake test
rtk rspec
rtk test <cmd>
rtk err <cmd>
```

RTK commonly collapses passing output and emphasizes failures. Use the underlying test runner when full logs, interactive output, snapshots, or verbose diagnostics are required.

Example:

```bash
cargo test -- --nocapture
```

## Build & Lint

Prefer RTK for supported build, type-check, and lint commands:

```bash
rtk lint
rtk lint biome
rtk tsc
rtk next build
rtk prettier --check .
rtk cargo build
rtk cargo clippy
rtk ruff check
rtk golangci-lint run
rtk rubocop
rtk mvnd verify
rtk sbt test
rtk sbt compile
rtk sbt run
```

Use raw commands when full compiler/build logs or exact tool output is needed for diagnosis.

## Package Managers & Tooling

Prefer RTK for supported package-manager and project-tool commands:

```bash
rtk pnpm list
rtk uv run <cmd>
rtk pip list
rtk pip outdated
rtk bundle install
rtk prisma generate
```

Use the underlying command when the original output format is required by scripts or downstream tooling.

## AWS

Prefer RTK for supported AWS CLI commands when a concise human-readable summary is sufficient:

```bash
rtk aws sts get-caller-identity
rtk aws ec2 describe-instances
rtk aws lambda list-functions
rtk aws logs get-log-events
rtk aws cloudformation describe-stack-events
rtk aws dynamodb scan
rtk aws iam list-roles
rtk aws s3 ls
```

Use raw AWS CLI output when exact JSON, YAML, policy documents, or complete response data is required.

## Containers & Kubernetes

Prefer RTK for compact infrastructure inspection and logs:

```bash
rtk docker ps
rtk docker images
rtk docker logs <container>
rtk docker compose ps
rtk kubectl pods
rtk kubectl logs <pod>
rtk kubectl services
rtk oc get pods
rtk oc get services
rtk oc logs <pod>
```

Use raw Docker/Kubernetes/OpenShift commands when complete logs, exact JSON/YAML, timestamps, streaming behavior, or machine-readable output are required.

## Infrastructure as Code

Prefer RTK for supported Pulumi commands:

```bash
rtk pulumi preview
rtk pulumi up
rtk pulumi destroy
rtk pulumi refresh
rtk pulumi stack
```

Use raw Pulumi output when the full deployment/debug trace is required.

## Data, Logs & Network

Use RTK helpers when condensed output is useful:

```bash
rtk json config.json
rtk deps
rtk env -f AWS
rtk log app.log
rtk curl <url>
rtk wget <url>
rtk summary <long command>
rtk proxy <command>
```

Important behavior:

- `rtk json` shows structure without values; use raw JSON when values are needed.
- `rtk env -f` filters environment variables; use raw environment inspection only when exact values are intentionally required.
- `rtk log` deduplicates repeated log lines.
- `rtk curl` can truncate displayed output while retaining a full-output recovery path; use raw `curl` when exact response contents, headers, or streaming behavior matter.
- `rtk wget` strips download progress output; use raw `wget` when exact progress/output behavior matters.
- `rtk proxy <command>` intentionally runs the command without RTK filtering while retaining RTK tracking.

## Token Savings

RTK documents savings as reductions in **bash output**, not reductions in the user's bill. Bash output is only one contributor to input tokens, and input tokens are only part of total usage.

Use the wording `up to 90% of bash output` or command-specific documented reductions when describing RTK savings. Do not present savings as a guaranteed percentage for every command or as an equivalent percentage reduction in billing.

RTK estimates token counts using `bytes / 4`; the reported percentages are useful as savings estimates, while absolute token counts are approximate.

## Global Flags

Supported global flags include:

```bash
rtk -u <command>       # Ultra-compact output
rtk --ultra-compact <command>
rtk -v <command>       # Increase verbosity
rtk -vv <command>
rtk -vvv <command>
```

Use higher verbosity when the compact output is insufficient for diagnosis.

## Analytics & Meta Commands

```bash
rtk gain
rtk gain --graph
rtk gain --history
rtk gain --daily
rtk gain --all --format json
rtk discover
rtk discover --all --since 7
rtk session
```

These commands are for savings analytics, discovering missed optimization opportunities, and inspecting RTK adoption.

## Initialization & Debugging

Common setup/diagnostic commands include:

```bash
rtk init -g
rtk init -g --codex
rtk init -g --gemini
rtk init -g --copilot
rtk init -g --agent cursor
rtk init --agent cline
rtk init --show
rtk init -g --hook-only
rtk init -g --auto-patch
rtk proxy <command>
```

Use the initialization option appropriate to the AI tool actually being used. Do not assume one integration method applies to every agent.

## Fallback and Correctness

When in doubt, prioritize correctness over token savings.

Use raw commands when filtered output could hide information needed to:

- diagnose a build or test failure;
- inspect complete logs or HTTP responses;
- parse JSON/YAML exactly;
- verify exact Git state;
- perform interactive operations;
- preserve output semantics for another command or script.

RTK's purpose is to reduce noisy command output reaching the model context, not to change the underlying command's intended result.
