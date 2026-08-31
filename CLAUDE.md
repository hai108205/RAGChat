<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **RAGChat** (3300 symbols, 5354 relationships, 168 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
rtk uv run <cmd>        # Compact uv project command output
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->

# Agent Skills & Memory System

This repository is equipped with specialized skills located in `.claude/skills/` and `.agents/skills/`.

## AgentMemory Discipline

- **Recall Before Starting:** Search past sessions, learnings, and decisions before beginning non-trivial tasks (`.claude/skills/recall/SKILL.md`, `.claude/skills/memory-discipline/SKILL.md`).
- **Save at Decision Points:** Persist architectural decisions, key findings, and context to long-term memory (`.claude/skills/remember/SKILL.md`).
- **Learn from Corrections:** When corrected or when solving tricky issues, record a lesson (`.claude/skills/lesson/SKILL.md`).
- **Handoff & Resume:** Pick up where previous sessions left off seamlessly (`.claude/skills/handoff/SKILL.md`, `.claude/skills/session-history/SKILL.md`).

## Skills Catalog

### 1. Code Intelligence (GitNexus)

| Skill | Path | Description |
|---|---|---|
| `gitnexus-exploring` | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` | Understand architecture, trace execution flows, find callers/callees. |
| `gitnexus-impact-analysis` | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` | Blast radius analysis, check breaking changes before editing code. |
| `gitnexus-debugging` | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` | Trace bugs, analyze root causes and error origins. |
| `gitnexus-refactoring` | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` | Safe rename, module extraction, code refactoring. |
| `gitnexus-guide` | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` | Tools reference, graph schema, query guides. |
| `gitnexus-cli` | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` | Indexing, status, reanalysis, and documentation wiki commands. |

### 2. Memory & Session Management (AgentMemory)

| Skill | Path | Description |
|---|---|---|
| `recall` | `.claude/skills/recall/SKILL.md` | Hybrid search (BM25 + vector + graph) for past observations & learnings. |
| `remember` | `.claude/skills/remember/SKILL.md` | Save insights, decisions, and knowledge to long-term storage. |
| `lesson` | `.claude/skills/lesson/SKILL.md` | Save rules & corrections to avoid repeating mistakes. |
| `forget` | `.claude/skills/forget/SKILL.md` | Remove specific memories/observations. |
| `handoff` | `.claude/skills/handoff/SKILL.md` | Resume the most recent session with pending context. |
| `recap` | `.claude/skills/recap/SKILL.md` | Summary of recent agent sessions grouped by date. |
| `session-history` | `.claude/skills/session-history/SKILL.md` | Timeline overview of previous agent sessions. |
| `memory-discipline` | `.claude/skills/memory-discipline/SKILL.md` | Standard session loop for memory persistence and recall. |
| `commit-context` | `.claude/skills/commit-context/SKILL.md` | Trace code back to the agent session that committed it. |
| `commit-history` | `.claude/skills/commit-history/SKILL.md` | List recent git commits linked to agent sessions. |

### 3. AgentMemory Architecture & Configuration

| Skill | Path | Description |
|---|---|---|
| `agentmemory-agents` | `.claude/skills/agentmemory-agents/SKILL.md` | Wire agentmemory into host coding agents via connect. |
| `agentmemory-architecture` | `.claude/skills/agentmemory-architecture/SKILL.md` | Architecture, iii engine, storage model, and viewer. |
| `agentmemory-config` | `.claude/skills/agentmemory-config/SKILL.md` | Configuration, environment variables, ports, and flags. |
| `agentmemory-hooks` | `.claude/skills/agentmemory-hooks/SKILL.md` | Lifecycle hooks for capturing observations automatically. |
| `agentmemory-mcp-tools` | `.claude/skills/agentmemory-mcp-tools/SKILL.md` | Complete MCP tools map and arguments reference. |
| `agentmemory-rest-api` | `.claude/skills/agentmemory-rest-api/SKILL.md` | HTTP REST API surface for memory operations. |
| `write-agentmemory-skill` | `.claude/skills/write-agentmemory-skill/SKILL.md` | House format and rules for writing/updating skills. |

### 4. CLI Token Optimization (RTK)

| Skill | Path | Description |
|---|---|---|
| `rtk` | `.claude/skills/rtk/SKILL.md` | Token-optimized CLI command wrapper (60-90% token reduction on test, build, git, search). |
