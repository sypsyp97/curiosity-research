# curiosity-research

English · [简体中文](README.zh-CN.md)

A deep-research workflow for [Claude Code](https://claude.com/claude-code), in one file.

You ask a question. It writes down its current answer, then goes looking for the things
that could overturn it, and stops when more searching stops changing the answer.

```
first guess ─→ ┌─ search ─ read ─ check ─ reassess ─┐ ─→ report with citations
               └──── every round aims at "what ────┘
                     would change the answer"
```

> **Under active development.** Prompts and parameters change often — pin a commit if you
> need stability.

## Install

```bash
mkdir -p ~/.claude/workflows
curl -fsSL -o ~/.claude/workflows/curiosity-research.js \
  https://raw.githubusercontent.com/sypsyp97/curiosity-research/main/curiosity-research.js
```

Needs Claude Code with the Workflow tool, WebSearch and WebFetch.

## Use

Start a new Claude Code session and say:

> Use the curiosity-research workflow to look into: *your question*

Options go through `args`. `agents` sets the budget — `12` for a quick check, `30` for a
normal report, `60` to be exhaustive. `verify.mode: "kill"` switches fact-checking back to
the built-in behaviour of deleting anything doubtful. Workflow names are cached per session,
so after editing the file either start a new session or call it by `scriptPath`.

## Behaviour

- Each round rewrites the current answer and what would change it, and searches from that.
  It can finish early, but not while a strong lead, a known gap, or two sources that
  contradict each other are still open.
- It writes down what it expects to find before searching. Sources that come back the
  opposite way get followed first; ones that merely confirm the expectation go last.
- Every claim is re-checked by opening the page it cites and looking for the sentence.
  Claims whose source does not support them are dropped; a weaker or older source only
  lowers confidence. "Nobody has reported X" passes by confirming at the source that X
  really is absent.
- One number caps the total number of agents. How many claims get checked and how deep
  each line is dug follow from it, and whatever exploration does not spend goes to checking.
- It reports what it did: how many claims were checked, how many citations did not hold up,
  what it gave up on for budget. Several of those counters exist because earlier versions
  got this wrong and quietly overstated their own work.
- It assumes a cheap model. Everything runs on Sonnet: one job per agent, URLs handed over
  rather than recalled, and judgements posed as comparisons instead of "how does this look".

## Measured

Same question, same day, same 30-agent budget, same model:

|                                    |     built-in |   this |
|------------------------------------|-------------:|-------:|
| agents spent                       |        29/30 |  30/30 |
| tokens                             |       1.61 M | 1.78 M |
| wall clock                         |  **519 sec** | 1706 sec |
| pages actually opened              | 10 (19 left unopened for budget) | **12** |
| sub-questions answered             |        2 / 4 | **4 / 4** |
| claims surviving a manual re-check |        1 / 3 | **6 / 8** |
| citations pointing at the wrong page |          0 |      0 |

At the same budget it is slower and slightly more expensive. What that buys is coverage,
and claims that hold up when you check them.

## Tests

```bash
node test-curiosity-logic.mjs   # 96 cases
```

## Licence

[MIT](LICENSE)
