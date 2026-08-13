# curiosity-research

English · [简体中文](README.zh-CN.md)

A deep-research workflow for [Claude Code](https://claude.com/claude-code), in one file.

Ask it a question. It writes down its best answer, then keeps searching wherever that answer
might still turn out wrong — and stops when more searching stops changing it.

```
guess ─→ ┌─ search ─ read ─ check ─ rethink ─┐ ─→ report with citations
         └──── each round aims at what ──────┘
                could change the answer
```

> **Under active development.** Prompts and settings change often — pin a commit if you need
> stability.

## The built-in pipeline

Four problems, from reading its source and watching it run:

- **It only searches once.** It ends by listing the open questions it found, and then stops.
  Nothing it discovers ever becomes a new search.
- **It deletes facts that only have one source.** Three checkers vote, they are told to assume
  the worst when unsure, and two votes delete the claim. But a default value read out of a
  config file only ever has one source, so it gets deleted.
- **One website can eat the whole budget.** Pages are de-duplicated by URL, not by site.
- **Cost is unbounded.** It fans out to 97 agents, three quarters of them spent on those
  verification votes.

## What this one does

- **It keeps a running answer.** Every round it restates its best answer and what would change
  it, then aims the next round at exactly that. It can finish early, but not while there are
  strong leads left, known gaps, or two sources that disagree.
- **It chases surprises.** Before searching, it writes down what it expects to find. Sources
  that contradict that expectation get followed up first; sources that confirm it sink down the
  list. A surprise fades as its thread gets dug out, so no single lead can hog the run.
- **It checks quotes, not vibes.** For every claim it reopens the page that was cited and looks
  for the sentence. A quote that isn't there is deleted. A source that is merely weak or old
  only loses confidence. "Nobody reports X" passes by confirming X really is missing at the
  source.
- **You set the budget, it respects it.** One number caps the agents. How many checks and how
  deep are derived from it, and leftover budget goes to more checking.
- **It reports on itself honestly.** How many claims were checked, how many quotes were wrong,
  what it dropped for lack of budget. Several of those counters exist because an earlier version
  got this wrong and quietly overstated its own work.
- **It assumes a cheap model.** Every agent runs on Sonnet. Each does one job, is handed the URL
  rather than asked to remember it, and is asked to compare things rather than to judge how it
  feels about them.

## Measured

Same question, same day, same 30-agent budget, same model:

|                                            |                   built-in |   this |
|--------------------------------------------|---------------------------:|-------:|
| agents used                                |                      29/30 |  30/30 |
| tokens                                     |                     1.61 M | 1.78 M |
| wall clock                                 |                  **519 s** | 1706 s |
| pages actually opened                      | 10 (19 skipped for budget) | **12** |
| sub-questions answered                     |                     2 of 4 | **4 of 4** |
| findings that held up when checked by hand |                        1/3 | **6/8** |
| citations pointing at the wrong page       |                          0 |      0 |

It is slower and slightly dearer for the same budget. What you get back is coverage, and
findings that survive being checked.

## Install

```bash
mkdir -p ~/.claude/workflows
curl -fsSL -o ~/.claude/workflows/curiosity-research.js \
  https://raw.githubusercontent.com/sypsyp97/curiosity-research/main/curiosity-research.js
```

Start a new Claude Code session and say:

> Run the curiosity-research workflow on: *your question*

Needs Claude Code with the Workflow tool, WebSearch and WebFetch.

Settings go in `args`. `agents: 12` for a quick check, `30` for a normal report, `60` to go
exhaustive. `verify.mode: "kill"` switches checking back to the built-in's delete-on-doubt
behaviour. Workflow names are cached per session, so after editing the file, restart the session
or call it by `scriptPath`.

## Tests

```bash
node test-curiosity-logic.mjs   # 80 cases
```

## License

[MIT](LICENSE)
