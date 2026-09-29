# Protocol compatibility

The SDK is implemented against the Augmenta WebSocket Output wire format produced by Pleiades and mirrors the parsing concepts of `AugmentaClientSDK-cpp` and `AugmentaClientSDK-CS`.

## V2

V2 is the baseline protocol for this SDK and is covered by automated binary parsing tests.

Supported packet families:

- bundle;
- scene;
- object;
- zone event.

Supported object properties:

- points;
- cluster.

Supported zone properties:

- slider;
- XY pad;
- point cloud.

## V3

Pleiades currently extends V3 with UUID-based object packets, a readable cluster ID inside the cluster property, a server millisecond timestamp in the bundle header, and a scene timestamp. The JavaScript SDK parses those fields directly: `DataBlob.timestamp`, `SceneInfoPacket.timestamp`, `ObjectPacket.uuid` and the readable `ObjectPacket.id` when a cluster provides one.

## V1

Legacy binary protocol V1 uses a different framing scheme and is not parsed by this first JavaScript SDK version. The client fails explicitly rather than silently interpreting V1 data with the V2 layout.

## Forward compatibility

The parser treats packet and property sizes emitted by Pleiades as authoritative. Known fields are parsed and unknown object/zone properties are skipped to their declared boundary. This avoids desynchronizing the rest of a bundle when a newer server adds data the current SDK does not yet understand.

## Compression

The wire protocol can use Zstd compression. Compression is deliberately separated from parsing through a synchronous decompressor callback, keeping the SDK browser-neutral and free of runtime dependencies.

## Cross-SDK parity

The public concepts intentionally remain close to the C++ and C# SDKs. When the wire protocol changes, protocol fixtures should be used to verify equivalent results across SDK implementations.
