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

## Supported version range

This beta accepts protocol V2 and V3. Legacy V1 uses a different framing scheme and is rejected explicitly. Versions newer than V3 are also rejected until their wire compatibility has been verified.

## Forward compatibility

The parser treats packet and property sizes emitted by Pleiades as authoritative. Known fields are parsed and unknown object/zone properties and unknown packet families are skipped to their declared boundary. Nested packets are constrained to their enclosing bundle/property boundary so malformed sizes cannot consume bytes outside their parent packet.

## Compression

The wire protocol can use Zstd compression. Compression is deliberately separated from parsing through a synchronous decompressor callback, keeping the SDK browser-neutral and free of runtime dependencies.

## Cross-SDK parity

The public concepts intentionally remain close to the C++ and C# SDKs. When the wire protocol changes, protocol fixtures should be used to verify equivalent results across SDK implementations.


## Regression fixtures

`tests/fixtures` contains deterministic V2/V3 wire fixtures mirroring the current Pleiades `develop` writer layout. They cover standalone and tracked point clouds, intensity arrays, slider/XY/zone point-cloud properties, and V3 timestamps/UUIDs/readable IDs. Large-cloud and malformed-boundary cases are also exercised separately in the automated tests.
