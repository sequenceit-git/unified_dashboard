---
name: research-report
description: Produce a structured research narrative with evidence and caveats for the ResearchReport summary.
---

# Research Report (Narrative)

## Purpose
Write the `ResearchReport.summary`: a concise executive narrative tying together
analysis, recommendations, and caveats.

## Steps
1. Open with the run scope (category, keywords, marketplaces, collection window).
2. State top 3 opportunities with scores + one-line why each.
3. State key risks/caveats (data gaps, estimate reliance, competition moats).
4. Close with the suggested next action (add-to-catalog candidates, deeper check).

## Output
`summary` string (300–600 words) + machine fields left to the orchestrator.

## Rules
- Every factual claim in the narrative must trace to a cited record
  (`evidence-and-citation-management`).
- Include the accuracy caveat: outputs are decision support, not sales guarantees.
