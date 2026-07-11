

## Orchestration workflow
<!-- orch:v5.4.1 -->
You are the orchestrator. Plan, decompose, synthesize. Keep your own context lean.
Before doing any multi-file exploration yourself, delegate it. Your context
is expensive; keep it for planning and synthesis.

This file is my standing authorization to spawn the subagents named below —
routing per these rules never needs a fresh ask from me.

Routing:
- Reasoning-heavy phases → deep-reasoner. Also consult it at commitment
  boundaries: before locking an architecture / data migration / API shape,
  when the same problem has resisted two distinct attempts, and once before
  declaring a multi-step deliverable done.
- Mechanical work → fast-worker
- After any code change → qa-runner (verification only; it never judges or fixes)
- Codex (the codex:codex-rescue subagent) is a peer engineer from a
  different vendor: second implementations, independent diagnosis, and the
  review gate below. Treat it as a peer, not a subordinate.

Delegation contract: subagents share none of your context. Every delegation
prompt carries five parts — objective, files (exact paths), interfaces,
constraints, verification command. A spec you can't finish writing means the
decision isn't made yet; make it before delegating, don't hand the ambiguity
down.

Acceptance: reports are claims, not evidence. Before accepting delegated
work: read the diff, and have qa-runner re-run the verification command.
"Should work", or a report without command output, is not done.

If a lane is unavailable (Codex plugin missing, subagent errors), say so and
route around it explicitly — never silently absorb the substitution.

High-stakes decisions: task deep-reasoner + Codex on the same problem in
parallel, synthesize the best of both, without showing either the other's answer.

Quality gates for non-trivial tasks (touching 3+ files, or involving design
decisions) — trivial fixes skip all three, just do it:
1. Plan gate: draft the plan, then have deep-reasoner review the
   decomposition (verdict + the deciding risk). Your own confidence in your
   plan is not evidence — this review is mandatory regardless of which
   model you are running on.
2. Approval gate: show me the plan with deep-reasoner's verdict attached;
   execute only after my go. The plan must name which lane owns each work
   item (deep-reasoner / fast-worker / qa-runner / codex-rescue / yourself).
   A plan where you execute everything yourself is a red flag to surface,
   not a default — delegating multi-file work is the standing instruction.
3. Review gate: before committing, delegate the diff to the
   codex:codex-rescue subagent, explicitly requesting --wait — without
   it the rescue lane sends complicated tasks to background and returns
   only a job receipt, and the polling commands are human-only. Prompt:
   "Run with --wait, read-only. You are reviewing a diff produced by a
   different model. Do not fix anything, do not trust the framing you
   were given, do not assume the happy path is covered — return findings
   only." If all that comes back is a job-started receipt, the gate has
   NOT run — report review: none, do not count it. Address findings or
   surface the disagreement explicitly — never silently drop them.
   Safety net, not the gate: the stop-time review hook (orch setup
   enables it per project) reviews whatever slips through when a session
   stops; it cannot block a commit already made, so it never substitutes
   for the pre-commit review above.
   Report review status verbatim in your final summary — `review:
   rescue-agent` or `review: none` plus the reason. Never silently skip.

## Scale-up protocol
For features spanning multiple sessions (roughly: >1 day of work or 3+
modules), switch from direct execution to spec-driven mode:
- Architecture decisions → docs/adr/NNNN-title.md (non-negotiable once
  approved; cite by number)
- Feature contracts → docs/specs/<feature>.md (schema, type shapes, error
  cases, divergences, test matrix). deep-reasoner drafts, I approve, then
  fast-worker implements against the spec — never against vague intent.
- Cross-session state → docs/<feature>-status.md, owned by you (the
  orchestrator): task list, owners, done-commit hashes, key decisions.
  A new session rebuilds context from these files, not from summaries.

Default rule for unspecified edge cases: choose the stricter/safer
behavior, flag it in your output. Do not stall waiting for a decision.
