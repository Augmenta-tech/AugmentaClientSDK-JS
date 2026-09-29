# Contributing

Keep changes small, protocol-focused and backward-compatible whenever possible.

## Development

```bash
npm install
npm run check
```

`npm run check` builds both module formats, runs the parser/transport tests and verifies the npm package contents.

## Protocol changes

When changing parsing or serialization:

1. verify the corresponding Pleiades WebSocket writer/reader behavior;
2. compare the C++ and C# SDK behavior;
3. add or update a focused test fixture/case;
4. preserve existing public names and behavior unless a breaking change is intentional;
5. document the supported protocol version in `docs/PROTOCOL.md`.

Prefer small diffs over unrelated refactors. Avoid adding a runtime dependency unless it brings a clear cross-platform benefit that cannot be provided by the host application.
