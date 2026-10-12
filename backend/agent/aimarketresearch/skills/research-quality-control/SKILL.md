---
name: research-quality-control
description: Validate required fields, numeric ranges, source links, duplicate records, and unsupported claims before saving reports.
---

# Research Quality Control

## Purpose
Final gate before any report persists: fail the run (with reasons) rather than save
a report that violates evidence rules.

## Checklist (all must pass)
1. Required fields present per `structured-research-output` for every record.
2. Numeric ranges: scores 0–100, ratings 0–5, prices/costs ≥ 0, ranks 1-based unique per report.
3. Every metric has a reachable `sourceUrl` + `dataCollectedAt`; `salesDataType`
   matches its methodology (`sales-estimation`).
4. No duplicate products (re-run `research-deduplication` check on final set).
5. Zero orphan claims (`evidence-and-citation-management`).
6. Estimates labeled; `unavailable` never rendered as zero.
7. Narrative includes the decision-support disclaimer, no sales guarantees.

## Output (JSON)
`{ passed: boolean, failures: [{ check, recordId, detail }], warnings[] }`
Persist only when `passed && failures.length === 0`; warnings are allowed with notes.

## Rules
- QC failures route back to the failing skill for repair, not silent patching.
- Log the QC result on the `ResearchReport` for auditability.
