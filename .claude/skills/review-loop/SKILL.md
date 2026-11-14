---
name: review-loop
description: >
  Quality gate to run BEFORE declaring any implementation finished in this repo:
  new or changed skills, code changes, configuration, or third-party content
  imported into the repo. Spawns three specialised reviewer subagents in
  parallel, then one final judge subagent that decides READY / NOT READY, and
  loops (fix → re-review) up to a hard cap of 3 rounds. Use whenever you are
  about to say "done", "pronto", "implementado", or before committing work the
  user asked for. Also when the user says "review loop", "revisão com agentes",
  "três revisores", or "/review-loop". Skip for pure questions with no changes.
argument-hint: "[what was changed]"
---

# Review loop (3 revisores + juiz)

The user's standing rule: nothing is finished until three independent
reviewers have looked at it and a final judge has said it is ready.

## Step 1 — Define the scope (you, no agent)

Write down in 3–6 lines: the files changed, the goal, and the acceptance
criteria. Every agent prompt below starts with this block, because subagents
start with **no** context.

## Step 2 — Pick three reviewer roles for THIS change

Roles must not overlap. Choose the three that would catch the most likely
failures. Defaults by change type:

| Change type | Reviewer A | Reviewer B | Reviewer C |
| --- | --- | --- | --- |
| New/changed skill | Skill-spec expert (frontmatter, `name`, trigger-quality of `description`, progressive disclosure, size) | Security & prompt-injection auditor (secrets, dangerous commands, instructions hidden in imported text, licence) | End-user advocate (is it clear, does it do what the user asked, Portuguese docs correct and complete) |
| Code (app/UI) | Correctness & edge cases | Security & dependencies | UX / accessibility / performance |
| Config / CI | Does it actually run (syntax, paths) | Least privilege / secrets | Maintainability / reversibility |
| Imported third-party content | Malware / injection / supply chain | Licence & attribution | Fitness for the user's project |

## Step 3 — Run the three reviewers in parallel

Send all three Agent calls in ONE message (parallel). Use a read-only agent
type (`Explore` or `general-purpose` told not to edit). Each prompt contains:
the scope block, the role, the exact file paths, and this output contract:

```
VERDICT: PASS | FAIL
BLOCKERS: numbered list (file:line + concrete failure), or "none"
NITS: max 3 one-line items
```

Ask for ≤250 words. Short, evidence-based reports save tokens for the judge.

## Step 4 — Final judge

Spawn ONE more agent (no tools needed beyond Read) with the scope block and the
three reports pasted verbatim. Its prompt:

> You are the final judge. Decide READY or NOT READY. A report's BLOCKER counts
> only if it names a concrete, reproducible failure; discard speculative ones and
> say why. Output: `DECISION: READY|NOT READY`, `REASONING:` (≤120 words, explain
> to yourself why), `MUST-FIX:` list (empty if READY).

## Step 5 — Loop with a hard stop

- `READY` → finish. Report to the user: the three roles, each verdict, the
  judge's decision and reasoning (short).
- `NOT READY` → fix every MUST-FIX item yourself, then repeat steps 3–4 **only
  for the roles that failed** (saves tokens).
- **Hard cap: 3 rounds.** If round 3 is still NOT READY, stop anyway, and tell
  the user exactly which items remain open and why — never loop forever.

## Token economy

- Reviewers read files themselves; do not paste whole files into prompts.
- Re-run only failed roles; never re-review unchanged files.
- Keep NITS out of MUST-FIX unless the user's rules make them blocking.
