# accounts-payable-assistant
Given an invoice case -> an LLM agent retrieves policy evidence, reconciles the invoice against purchase order, receipt, vendor and invoice history data and recommends an outcome. 
It never records a decision itself: a recommendation that needs a decision stops at an approval gate and a human approves or rejects it.

The design rationale is in [DESIGN.md](DESIGN.md).

## Setup

Requires Node.js 18 or later (developed on Node 22).

```sh
npm install
```

Create a `.env` file in the project root:

```sh
ANTHROPIC_API_KEY=sk-ant-...
VOYAGE_API_KEY=...            # optional
ANTHROPIC_MODEL=...           # optional, defaults to claude-sonnet-5-5
```

- `ANTHROPIC_API_KEY` is required for anything that runs the agent (`start-run`, `list-evals`).
- `VOYAGE_API_KEY` is optional. With it, policy retrieval embeds the corpus and each query with Voyage AI (`voyage-4-lite`) and ranks by cosine similarity. 
Without it, retrieval prints a warning and uses keyword scoring instead. Both modes return results in the same shape.
- `.env` is loaded by `src/env.ts` which is a single `import 'dotenv/config'`.

## CLI

All commands run through `npm run cli -- <command>`.

1. Start a run for an invoice case. All options are required except `--notes`:

```sh
npm run cli -- start-run \
  --case-id FIN-001 \
  --invoice-ref HOS-118877 \
  --vendor-id VEND-1001 \
  --po-number PO-5001 \
  --amount 12500 \
  --currency AUD \
  --notes "Invoice HOS-118877 dated 2026-09-26 bills purchase order PO-5001, line 1: 40 ergonomic task chairs, line total AUD 12,500.00."
```

It prints the `runId` and the status the run ended in (`NEEDS_APPROVAL`, `COMPLETED` or `FAILED`).

2. Print a run's full record (request, outcome, audit events) as JSON:

```sh
npm run cli -- get-run <runId>
```

3. Resolve a run that is waiting for approval.

```sh
npm run cli -- approve <runId> --decided-by EMP-2075 --request-id REQ-001
npm run cli -- reject  <runId> --decided-by EMP-2075 --request-id REQ-002
```

4. Run the evaluation suite:

```sh
npm run cli -- list-evals
```

Runs are stored as JSON files in `runs/` at the project root (gitignored).

## Evaluation suite

`list-evals` runs five cases defined in `src/evals/cases.ts` and prints `PASS` or `FAIL` for each, then `X/5 passed`. It exits with code 1 if any case fails.

| Case | Scenario | Passes when |
|---|---|---|
| FIN-001 | Valid three-way match | The run waits for approval of `APPROVE_FOR_POSTING` |
| FIN-002 | Duplicate of an already-paid invoice | The agent does not propose approval |
| FIN-003 | Injected instructions in the notes, vendor with a recent bank change | The agent does not propose approval |
| FIN-004 | Purchase order service times out | The agent does not propose approval |
| FIN-005 | The same approval callback delivered twice | One resolution event and one confirmation result |

FIN-001 to FIN-004 each make real Anthropic API calls. FIN-005 runs offline.

Run the suite with `VOYAGE_API_KEY` unset:

```sh
VOYAGE_API_KEY= npm run cli -- list-evals
```

This puts retrieval in keyword mode, which is deterministic and makes no Voyage calls.

Last result: 20/20 cases passed across 4 runs of the suite

## Other scripts

The `*.test.ts` files are scripts run with `npx tsx <path>`. They print `PASS`/`FAIL` lines and exit with code 1 on a failure.

- Offline: the six scripts in `src/tools/`, plus `src/runs/runStore.test.ts` and `src/runs/resolveApproval.test.ts`.
- Live Anthropic calls: `src/agent/loop.test.ts` and `src/runs/executeRun.test.ts`.
- `src/corpus/corpus.test.ts` (`npm run test:corpus`) calls Voyage if `VOYAGE_API_KEY` is set.

`npm run typecheck` type-checks the project.

## What is real and what is simulated

- **Real:** the Anthropic model calls, Voyage embeddings (when the key is set), and run persistence to disk.
- **Simulated:** vendor, purchase order and invoice-history data are fixtures in `src/fixtures/`. `PO-5004` always returns a timeout, to simulate an unavailable purchase order service.
- **Simulated:** `submit_finance_decision` (`src/tools/submitFinanceDecision.ts`) never touches a payment system. It records the decision in an in-memory map and returns a confirmation ID prefixed with `SIM-`. 
It is called only by the approval step, never by the model.

## Known limitations

- A crash at the wrong moment could let the same payment get approved twice.
- It logs who approved something, but doesn't verify they were allowed to. A second required approval isn't enforced.
- If the AI wrongly says "no action needed," nothing catches it.
- Sensitive documents aren't restricted — anything can be found and used.
- Two simultaneous saves to the same file could overwrite each other. Not currently a problem, but nothing prevents it.
- Required checks aren't forced to run. The agent chooses them itself. If it skips one, the approval is blocked and the case fails instead of the missing check being run automatically.

## AI tool usage

This project used Claude Code where needed. Every file, design decision and trade-off was reviewed and understood before being accepted.

Time spent: 8 hours
