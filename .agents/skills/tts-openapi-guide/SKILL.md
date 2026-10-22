---
name: tts-openapi-guide
description: Use this skill when the user asks about TikTok Shop OpenAPI endpoint structure, API version selection, request parameters, request body schema, response schema, headers, path/method selection, or how to confirm exact API fields. Inspect the bundled OAS reference as the local baseline, check official Partner Center docv2 for newer candidates, and prefer the newest applicable official API version.
---

# TTS OpenAPI Guide

Use this skill to answer exact TikTok Shop OpenAPI structure questions and avoid selecting a stale endpoint version.

## Workflow

1. Read `references/oas-guide.md`.
2. Define the requested business capability before comparing paths. Record any explicit method/path or version pin and any region, authorization, rollout, lifecycle, or workflow constraint.
3. Inspect `references/oas/index.json` to find the first-level API path file, then inspect the matching `references/oas/paths/<first_level_path>.json`. Collect every operation candidate that implements the same requested capability, including its method, path, six-digit version, and schema.
4. Treat bundled OAS as a local baseline, not proof that its newest entry is current. Before finalizing method and path, search official Partner Center docv2 by API name, endpoint, and module for newer candidate versions that may be absent from the bundled snapshot.
5. Filter out candidates that do not satisfy the recorded constraints. Unless the user or a registered workflow pins an exact version, choose the highest six-digit version among the applicable official candidates.
6. Do not replace the requested capability with a semantically adjacent operation solely because its version is newer. For a multi-step workflow, apply version selection to each required capability without silently dropping, adding, reordering, or deduplicating steps.
7. If a newer official operation is missing from bundled OAS, use its official docv2 schema and report the OAS coverage gap. Do not silently fall back to an older familiar version.
8. Select an older version only for an explicit pin or a documented applicability constraint. State the reason and supporting source; if the constraint cannot be verified, report the uncertainty instead of guessing.
9. Do not infer fields, enum values, required flags, or response shapes that are absent from the selected operation's official schema.
10. When online docs are useful, build the official doc URL as `https://partner.tiktokshop.com/docv2/page/{api}-{version}`, where `{api}` is the API slug and `{version}` is the six-digit version from the endpoint.
11. If OAS and docv2 differ, state the difference clearly and use the current official docv2 operation for the final answer.

## Output Shape

```text
API:
Requested capability:
Source checked:
Candidate versions:
Selected version and reason:
Older-version exception:
Method and path:
Required headers:
Query/path parameters:
Request body:
Response:
OAS coverage gap:
Unresolved gaps:
Fallback docs:
Online doc URL:
```

## References

- `references/oas-guide.md` explains how to search and read the split OAS references.
- `references/oas/index.json` maps first-level API paths to split OAS files.
- `references/oas/paths/*.json` contains the OAS path subsets split by first-level API path.
