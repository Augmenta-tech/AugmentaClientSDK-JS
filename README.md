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
- clusters, point clouds and scene information;
- zone enter/leave/presence/density events;
- zone slider, XY pad and optional zone point-cloud properties;
- setup and update control messages;
- scene and zone hierarchy, position, rotation, color and supported shapes;
- browser/Node WebSocket convenience transport;
- ESM and CommonJS builds plus TypeScript declarations.

Legacy binary protocol V1 is intentionally not implemented in this first version.

## TODO before 1.0

- Validate V2/V3 end-to-end against live Pleiades streams and keep captured binary fixtures.
- Expand regression coverage for standalone point clouds, cluster + point-cloud packets, zone properties, and malformed/truncated packets.
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
npm install
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
  useCompression: false
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
    useCompression: false
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

## Compression

Augmenta can Zstd-compress binary WebSocket frames. The C++ SDK enables compression by default, and this SDK keeps the same `ProtocolOptions` default.

To keep the JavaScript package small, dependency-free and browser-neutral, decompression is injected by the host application:

```ts
const client = new Client({
  decompressor: (compressed) => myZstdDecoder(compressed)
});
```

For lightweight tracking clients such as web visualizations or Max for Live, disabling compression and raw point clouds is usually the simplest starting point:

```ts
const options = new ProtocolOptions({
  useCompression: false,
  streamClouds: false,
  streamClusterPoints: false
});
```

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
5. **Forward-compatible parsing** — packet/property sizes are respected so unknown future properties can be skipped safely.
6. **Web-friendly data** — arrays and typed arrays are exposed directly and can be fed efficiently into rendering/application code.

## License

Use of this SDK is governed by the Augmenta Software Development Kit License Agreement in [LICENSE](LICENSE).
