---
name: deep-web-research
description: Conduct multi-step research, follow relevant sources, cross-check findings, and compile cited evidence.
---

# Deep Web Research

## Purpose
Run multi-hop investigations (e.g., "is demand for X real?") that single-page
extraction cannot answer, ending in cited, cross-checked findings.

## Inputs
- Research question, starting queries from `web-search-strategy`.

## Steps
1. Execute the query plan breadth-first; keep only sources that add new facts.
2. Follow up to 2 hops from promising sources (reviews → cited competitors →
   supplier pages), recording the hop chain.
3. Cross-check every key claim in at least two independent sources; conflicts go
   to `source-validation`.
4. Compile findings with inline citations (`evidence-and-citation-management`).

## Output (JSON)
`{ question, findings: [{ claim, evidence[], sources[], confidence }], openQuestions[] }`

## Rules
- Stop at diminishing returns (~15 pages examined); report open questions honestly.
- Opinion content (forums, influencers) is sentiment signal, never sales evidence.
