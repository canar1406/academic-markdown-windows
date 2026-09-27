# ADR 002 — Bridge v2 negotiation

## Status

Accepted for implementation.

## Envelope

Bridge v1 remains decodable. V2 keeps `{protocolVersion,type,requestId,payload}` but replaces generic payload use internally with discriminated TypeScript unions and matching Swift payload models.

`editor.ready` advertises supported protocol versions and capabilities. Native selects the highest common version; absence of capability data means v1. A v2 payload is never reinterpreted as v1.

## Required semantics

- Every async request/response uses one request ID.
- Content/index messages carry document revision/generation.
- Page messages also carry layout revision.
- Consumers reject stale or mismatched revisions.
- High-frequency local interactions (typing, pinch, drag preview) do not cross the bridge per frame.
- Full Markdown/index snapshots are request-driven; edits emit compact invalidation or patch messages.
- Payload/request/image byte limits and maximum outstanding request counts are validated on both sides.
- Unsupported/malformed messages are ignored safely and surfaced as protocol diagnostics in debug/compatibility UI.

V2 capabilities include MathType preference, selected-block style snapshot/update, theme package descriptors, document index/reveal/location, folder/resource snapshot, and demand-driven page thumbnails.
