---
name: research-freshness
description: Record collection timestamps and identify stale prices, rankings, availability, and time-sensitive metrics.
---

# Research Freshness

## Purpose
Keep time-sensitive metrics honest: every record expires, and reports show their age.

## Steps
1. Stamp every record with `dataCollectedAt` (extraction skills do this); this skill audits.
2. Classify metric volatility: price/availability/rank = volatile (24h half-life);
   ratings/review counts = slow (7d); specs/identity = stable.
3. Flag records older than their volatility window as `stale`; refresh or downgrade
   dependent scores (`product-scoring` must note staleness).

## Output (JSON)
`{ auditedAt, fresh: <n>, stale: [{ recordId, ageHours, volatility }], refreshed: <n> }`

## Rules
- A completed report embeds the run's collection window (`startedAt`/`finishedAt`);
   consumers must not treat it as live data.
- Never silently reuse a previous run's prices in a new report.
