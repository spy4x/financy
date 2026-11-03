# Platform libraries

Reusable technical primitives and contracts live here. Platform code must not import domain,
server, client, or app code. Product-specific commands and handlers stay in their owning app or
domain library.

The generic primitives this folder used to hold (validation, API envelopes, the command, query and
event bus, the cache, tokens) now come from the published `@spy4x/validation` and
`@spy4x/platform` packages. Add code here only when it is platform-level and not in those
packages.

Nothing is left here today: the error reporter moved to `@spy4x/platform` too (docs/stack.md,
"Error tracking").
