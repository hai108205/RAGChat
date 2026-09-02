<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **RAGChat** (4118 symbols, 8332 relationships, 285 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/RAGChat/context` | Codebase overview, check index freshness |
| `gitnexus://repo/RAGChat/clusters` | All functional areas |
| `gitnexus://repo/RAGChat/processes` | All execution flows |
| `gitnexus://repo/RAGChat/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

<!-- rtk-instructions -->
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
rtk init --agent antigravity
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
<!-- /rtk-instructions -->

# Agent Skills & Memory System

This repository contains skills in `.agents/skills/` (and `.claude/skills/`).

## AgentMemory Discipline

- **Recall Before Starting:** Search past sessions, learnings, and decisions before beginning non-trivial tasks (`.agents/skills/recall/SKILL.md`, `.agents/skills/memory-discipline/SKILL.md`).
- **Save at Decision Points:** Persist architectural decisions, key findings, and context to long-term memory (`.agents/skills/remember/SKILL.md`).
- **Learn from Corrections:** When corrected or when solving tricky issues, record a lesson (`.agents/skills/lesson/SKILL.md`).
- **Handoff & Resume:** Pick up where previous sessions left off seamlessly (`.agents/skills/handoff/SKILL.md`, `.agents/skills/session-history/SKILL.md`).

## Skills Catalog

### 1. Code Intelligence (GitNexus)

| Skill | Path | Description |
|---|---|---|
| `gitnexus-exploring` | `.agents/skills/gitnexus-exploring/SKILL.md` | Understand architecture, trace execution flows, find callers/callees. |
| `gitnexus-impact-analysis` | `.agents/skills/gitnexus-impact-analysis/SKILL.md` | Blast radius analysis, check breaking changes before editing code. |
| `gitnexus-debugging` | `.agents/skills/gitnexus-debugging/SKILL.md` | Trace bugs, analyze root causes and error origins. |
| `gitnexus-refactoring` | `.agents/skills/gitnexus-refactoring/SKILL.md` | Safe rename, module extraction, code refactoring. |
| `gitnexus-guide` | `.agents/skills/gitnexus-guide/SKILL.md` | Tools reference, graph schema, query guides. |
| `gitnexus-cli` | `.agents/skills/gitnexus-cli/SKILL.md` | Indexing, status, reanalysis, and documentation wiki commands. |

### 2. Memory & Session Management (AgentMemory)

| Skill | Path | Description |
|---|---|---|
| `recall` | `.agents/skills/recall/SKILL.md` | Hybrid search (BM25 + vector + graph) for past observations & learnings. |
| `remember` | `.agents/skills/remember/SKILL.md` | Save insights, decisions, and knowledge to long-term storage. |
| `lesson` | `.agents/skills/lesson/SKILL.md` | Save rules & corrections to avoid repeating mistakes. |
| `forget` | `.agents/skills/forget/SKILL.md` | Remove specific memories/observations. |
| `handoff` | `.agents/skills/handoff/SKILL.md` | Resume the most recent session with pending context. |
| `recap` | `.agents/skills/recap/SKILL.md` | Summary of recent agent sessions grouped by date. |
| `session-history` | `.agents/skills/session-history/SKILL.md` | Timeline overview of previous agent sessions. |
| `memory-discipline` | `.agents/skills/memory-discipline/SKILL.md` | Standard session loop for memory persistence and recall. |
| `commit-context` | `.agents/skills/commit-context/SKILL.md` | Trace code back to the agent session that committed it. |
| `commit-history` | `.agents/skills/commit-history/SKILL.md` | List recent git commits linked to agent sessions. |

### 3. AgentMemory Architecture & Configuration

| Skill | Path | Description |
|---|---|---|
| `agentmemory-agents` | `.agents/skills/agentmemory-agents/SKILL.md` | Wire agentmemory into host coding agents via connect. |
| `agentmemory-architecture` | `.agents/skills/agentmemory-architecture/SKILL.md` | Architecture, iii engine, storage model, and viewer. |
| `agentmemory-config` | `.agents/skills/agentmemory-config/SKILL.md` | Configuration, environment variables, ports, and flags. |
| `agentmemory-hooks` | `.agents/skills/agentmemory-hooks/SKILL.md` | Lifecycle hooks for capturing observations automatically. |
| `agentmemory-mcp-tools` | `.agents/skills/agentmemory-mcp-tools/SKILL.md` | Complete MCP tools map and arguments reference. |
| `agentmemory-rest-api` | `.agents/skills/agentmemory-rest-api/SKILL.md` | HTTP REST API surface for memory operations. |
| `write-agentmemory-skill` | `.agents/skills/write-agentmemory-skill/SKILL.md` | House format and rules for writing/updating skills. |

### 4. CLI Token Optimization (RTK)

| Skill | Path | Description |
|---|---|---|
| `rtk` | `.agents/skills/rtk/SKILL.md` | Token-optimized CLI wrapper for development commands (up to 90% reduction of bash output on supported commands). |
