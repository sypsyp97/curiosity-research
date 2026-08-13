# curiosity-research

Curiosity-driven deep research for [Claude Code](https://claude.com/claude-code), in one workflow script.
The loop maintains a **working answer** to your question and spends its agent budget wherever that
answer might still change.

```
seed priors ─→ ┌─ explore ─ read ─ audit ─ assess ─┐ ─→ cited report
               └────── re-aimed each round at ─────┘
                  whatever would change the answer
```

> **Status: under active development.** Prompts, knobs and telemetry change frequently — pin a commit
> if you need stability.

## The built-in pipeline

Four problems, read out of its source and measured on live runs, as shipped at the time of writing:

- **One pass.** The report schema has an `openQuestions` field and the synthesis agent fills it — then
  the workflow returns. Discoveries never become new searches.
- **Verification deletes single-source facts.** Verifiers are told to *default to refuted when
  uncertain*, and two of three votes kill a claim. A default value read out of a repository's config
  file has exactly one source by nature — it cannot be independently corroborated, so it dies.
- **No per-domain quota.** Fetch dedup is per-URL, so every fetch slot can land on the same content farm.
- **Uncapped cost.** The fan-out reaches 97 agents by construction (96 measured on one question), and
  about three quarters of them are verification votes.

## What this does

- **A belief about the answer, updated every round.** An assessor restates the current best answer,
  states what would change it, and aims the next round at exactly that. It can settle early — and the
  harness vetoes "settled" while high-scoring leads, blocking gaps or unresolved conflicts remain.
- **Curiosity as prediction error.** Every search line writes down what it expects *before* retrieving;
  surprise is scored as a comparison against that prior (contradicted / beyond / consistent / not
  addressed), inherited by follow-ups, and cooled with depth:
  `score = importance × novelty × hostPref × (0.4 + surprise · decay^depth) / cost`.
  Lines that contradict their prior rise; lines that confirm it sink.
- **Conflicts jump the queue.** Two detection paths — exact normalized `subject|measure` matching in the
  harness, plus the assessor, the only role that sees the whole claim table. The reconciler must rule out
  definition, protocol and version mismatches before calling anything a real conflict.
- **An audit that points somewhere true.** Claims are mechanically quote-checked against the cited
  source, grouped one agent per source (opening the page is the cost). Only a quote that is *absent* or
  a primary-source contradiction kills; weak-source or outdated only downgrades. Negative claims
  ("X never reports Y") pass by confirming the absence at the source. Killed claims never reach the
  assessor.
- **The budget is the contract.** One hard agent cap, enforced before every dispatch. Audit votes are
  derived from it (coverage before depth), a 60:40 coverage:curiosity split keeps the run answering the
  question it was asked, and unspent exploration flows back into the audit.
- **Telemetry that can't flatter itself.** Audit coverage %, new-slots-per-round, degenerate
  assessments, dropped belief updates, miscited count, and references to the operator's own local notes
  are all counted and reported. Several of these counters exist because an earlier version misreported
  its own work.
- **Built for a cheap model.** Every role is pinned to Sonnet. URLs are assigned by the harness, never
  recalled by the model; web text enters prompts fenced as data; judgements are posed as comparisons,
  not feelings.

## Measured

Equal-budget A/B against the built-in pipeline (same 30-agent cap, same model, same question, same day):

|                                    | built-in, capped | curiosity-research |
|------------------------------------|-----------------:|-------------------:|
| agents used                        |            29/30 |              30/30 |
| tokens                             |           1.61 M |             1.78 M |
| wall clock                         |        **519 s** |             1706 s |
| sources opened                     | 10 (19 dropped unread) |         **12** |
| sub-questions answered             |           2 of 4 |         **4 of 4** |
| findings surviving a manual check  |              1/3 |            **6/8** |
| citations pointing at the wrong source |            0 |                  0 |

At the same cap it is slower and slightly more expensive; that buys coverage and findings that
survive checking.

## Install

```bash
mkdir -p ~/.claude/workflows
curl -fsSL -o ~/.claude/workflows/curiosity-research.js \
  https://raw.githubusercontent.com/sypsyp97/curiosity-research/main/curiosity-research.js
```

Start a new Claude Code session and ask:

> Run the curiosity-research workflow on: *your question*

Requires Claude Code with the Workflow tool, WebSearch and WebFetch. Config rides in `args`:
`agents: 12` is a quick check, `30` the default report, `60` exhaustive; `verify.mode: "kill"`
reproduces the built-in's majority-refutes audit. Workflow names are cached per session — after
editing the file, restart the session or invoke it by `scriptPath`.

## Tests

```bash
node test-curiosity-logic.mjs   # 72 cases: ranking, admission, budget arithmetic, audit grouping
```

## License

[MIT](LICENSE)
