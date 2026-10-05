# Augmenta Client JavaScript SDK

JavaScript/TypeScript client SDK for consuming the real-time stream output of an Augmenta server.

The SDK follows the same philosophy as the Augmenta C++ and C# client SDKs:

- keep the Augmenta protocol parser independent from networking;
- generate the registration and polling messages expected by the Augmenta WebSocket Output;
- parse binary tracking data into developer-friendly objects;
- parse setup/update control messages into a typed scene/zone hierarchy;
- let applications use their own transport when they need to;
- provide a small WebSocket convenience client for common web and Node.js use cases.

The package has **no runtime dependency** and is designed for browsers, web applications, Node.js integrations and future Max/MSP / Max for Live clients.

## Status

This repository is the first public beta of the JavaScript SDK (`1.0b`).

Supported:

- Augmenta WebSocket protocol V2 binary data;
- current Pleiades V3 bundle/object/scene extensions, including timestamps and UUID-based object packets;
- explicit protocol-version guard: only verified V2/V3 layouts are accepted;
- clusters, point clouds and scene information;
- zone enter/leave/presence/density events;
- zone slider, XY pad and optional zone point-cloud properties;
- setup and update control messages;
- scene and zone hierarchy, position, rotation, color and supported shapes;
- browser/Node WebSocket convenience transport;
- ESM and CommonJS builds plus TypeScript declarations.

Legacy binary protocol V1 is intentionally not implemented in this first version.

## TODO before 1.0

- Validate the committed V2/V3 protocol-writer fixtures against live Pleiades captures.
- Decide whether the WebSocket convenience client should handle protocol negotiation/fallback automatically.
- Exercise the SDK in browser, Node.js, and Max/MSP / Max for Live integrations.
- Finalize npm publishing, release notes/changelog, and stable 1.0 documentation.

## Install

Once published to npm:

```bash
npm install augmenta-client-sdk
```

From this repository during development:

```bash
npm ci
npm run build
npm test
```

## Core SDK usage

The `Client` class does not own a WebSocket. This is the closest equivalent to the C++ and C# SDKs.

```ts
import { Client, ProtocolOptions } from 'augmenta-client-sdk';

const options = new ProtocolOptions({
  streamClouds: false,
  streamClusters: true,
  streamClusterPoints: false,
  streamZonePoints: false,
  useCompression: true
});

const client = new Client();
client.setApplicationName('My application');
client.setApplicationVersion('1.0.0');
client.initialize('My Augmenta client', options);

const socket = new WebSocket('ws://augmenta-server:PORT');
socket.binaryType = 'arraybuffer';

socket.addEventListener('open', () => {
  socket.send(client.getRegisterMessage());
});

socket.addEventListener('message', async (event) => {
  if (typeof event.data === 'string') {
    const message = client.parseControlMessage(event.data);

    if (message.isSetup()) {
      console.log(message.getRootObject());
    }
    return;
  }

  const buffer = event.data instanceof Blob
    ? await event.data.arrayBuffer()
    : event.data;

  const frame = client.parseDataBlob(buffer);

  for (const object of frame.getObjects()) {
    if (!object.hasCluster()) continue;
    const cluster = object.getCluster();
    console.log(object.getID(), cluster.getCentroid());
  }

  for (const zone of frame.getZoneEvents()) {
    console.log(zone.getEmitterZoneAddress(), zone.getPresence());
  }
});
```

## WebSocket convenience client

For normal browser applications, `AugmentaWebSocketClient` handles the transport and registration handshake while still exposing the underlying `Client`.

```ts
import { AugmentaWebSocketClient } from 'augmenta-client-sdk';

const augmenta = new AugmentaWebSocketClient('ws://augmenta-server:PORT', {
  clientName: 'Three.js installation',
  applicationName: 'Interactive Room',
  applicationVersion: '1.0.0',
  options: {
    streamClouds: false,
    streamClusters: true,
    streamClusterPoints: false,
    useCompression: true
  }
});

augmenta.on('setup', (message) => {
  console.log('Augmenta hierarchy', message.getRootObject());
});

augmenta.on('data', (frame) => {
  for (const object of frame.getObjects()) {
    if (!object.hasCluster()) continue;
    const position = object.getCluster().getBoundingBoxCenter();
    // threeObject.position.set(position[0], position[1], position[2]);
  }
});

augmenta.on('error', console.error);
augmenta.connect();
```

Modern browsers provide `WebSocket` globally. Other runtimes can pass a `webSocketFactory` without changing the SDK core.

## Production WebSocket practices

### Compression

Augmenta can Zstd-compress binary WebSocket frames. Compression is enabled by default in `ProtocolOptions` and is the recommended setting for production clients, especially when streaming scene or cluster point clouds. It reduces network bandwidth at the cost of decompression work on the client.

The JavaScript package deliberately does not bundle a Zstd implementation. Applications that enable compression must provide a decompressor:

```ts
const augmenta = new AugmentaWebSocketClient('ws://augmenta-server:PORT', {
  decompressor: (compressed) => myZstdDecoder(compressed),
  options: {
    useCompression: true
  }
});
```

If the host cannot provide Zstd decompression, explicitly set `useCompression: false`. Do not rely on the WebSocket convenience client's current transport fallback: its constructor disables compression when no option is supplied so a zero-dependency browser client remains usable. Applications should make the choice explicit.

### Reconnection and state refresh

Treat each WebSocket connection as a new Augmenta session:

- create a fresh connection after `close` or a connection error, with a retry delay/backoff instead of a tight reconnect loop;
- let the new socket send a fresh registration message on `open`; this requests the current setup/state again rather than trying to continue stale local state;
- clear application-side pending tracking frames when a connection closes or when a new setup replaces the hierarchy;
- ignore messages from an old socket after a newer connection has been created. `AugmentaWebSocketClient` already guards its own callbacks this way;
- do not keep rendering stale tracking data indefinitely while disconnected.

The [Augmenta ThreeJS example](https://github.com/Augmenta-tech/Augmenta-ThreeJS-example) is the reference browser implementation for connection lifecycle and reconnect behavior.

### Buffering and backpressure

Do not build an unbounded FIFO of complete Augmenta tracking frames. Point-cloud frames can be large, so an application that consumes data more slowly than it arrives can otherwise retain increasing amounts of memory and add latency.

For real-time visualization, prefer a bounded **latest-state-wins** handoff: keep at most one pending state frame per scene and consume it on the application's render/update tick. Setup and hierarchy control messages should remain ordered and immediate. If an integration exposes transient edge events that must survive frame replacement, preserve/conflate those events separately rather than silently dropping them.

The [Augmenta ThreeJS example](https://github.com/Augmenta-tech/Augmenta-ThreeJS-example) demonstrates this pattern: incoming tracking frames are published into a per-scene pending slot and the newest frame is consumed from the Three.js animation loop. This keeps application-side buffering bounded by the number of scenes instead of by consumer lag.

The SDK intentionally does **not** impose this policy itself. `AugmentaWebSocketClient` emits parsed data as it arrives because the correct consumption cadence belongs to the host runtime (browser render loop, game-engine update, Max/MSP scheduler, server process, and so on).

## Package outputs

`npm run build` creates:

- `dist/esm` — ES modules for browsers and modern bundlers;
- `dist/cjs` — CommonJS for Node.js-style integrations;
- `dist/types` — TypeScript declarations.

## Documentation

- [API overview](docs/API.md)
- [Protocol compatibility](docs/PROTOCOL.md)
- [Contributing](CONTRIBUTING.md)

## Design principles

1. **Protocol first** — the wire format emitted by Pleiades is the source of truth.
2. **Same concepts across SDKs** — `Client`, `ProtocolOptions`, `DataBlob` and `ControlMessage` stay recognizable across C++, C# and JavaScript.
3. **Transport independent** — parsing is usable from a browser, Node.js, Max/MSP, tests or another transport.
4. **Small and predictable** — no framework and no runtime dependency.
5. **Forward-compatible parsing** — packet/property sizes are respected so unknown future properties/packet families can be skipped safely within their declared boundaries.
6. **Web-friendly data** — arrays and typed arrays are exposed directly and the point parser uses bulk typed-array paths for large clouds instead of one JavaScript read per coordinate.

## License

Use of this SDK is governed by the Augmenta Software Development Kit License Agreement in [LICENSE](LICENSE).
