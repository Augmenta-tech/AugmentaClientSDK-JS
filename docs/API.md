# API overview

## `ProtocolOptions`

Negotiates what an Augmenta WebSocket Output sends to the client.

Important options include:

- `version` — protocol version, V2 by default; this beta accepts V2 and V3;
- `tags` — optional server-side Augmenta tags;
- `downSample` — point-cloud downsampling factor;
- `streamClouds` — raw scene point clouds;
- `streamClusters` — tracked Augmenta objects;
- `streamClusterPoints` — points belonging to tracked clusters;
- `streamZonePoints` — optional point clouds attached to zone events;
- `boxRotationMode` — radians, degrees or quaternions;
- `axisTransform` — coordinate system transformation requested from the server;
- `useCompression` — request Zstd-compressed binary frames;
- `usePolling` — request data only when `poll` is sent;
- `displayPointIntensity` — tells the parser to consume point-intensity values when the server stream contains them.

The core `ProtocolOptions` defaults follow the C++ SDK. The `AugmentaWebSocketClient` convenience transport defaults to uncompressed frames unless explicit `ProtocolOptions` are supplied, so a zero-configuration browser client does not require Zstd.

## `Client`

Transport-independent protocol client.

Main methods:

- `initialize(clientName, options)`
- `shutdown()`
- `addTag(tag)` / `clearTags()`
- `setApplicationName(name)`
- `setApplicationVersion(version)`
- `setPluginVersion(version)`
- `getRegisterMessage()`
- `getPollMessage()`
- `parseControlMessage(text)`
- `parseDataBlob(binary)`

## `ControlMessage`

Represents JSON setup/update messages.

A setup message exposes a root `Container`, which can recursively contain scenes, zones and generic containers. Common fields include name, address, position, rotation, color and children.

Scene containers expose scene size. Zone containers expose the shape information currently provided by Pleiades: Box, Cylinder, Sphere, Path, Grid, Polygon and Segment.

## `DataBlob`

Represents one parsed binary Augmenta frame/bundle.

It contains:

- `SceneInfoPacket`
- zero or more `ObjectPacket` values
- zero or more `ZoneEventPacket` values
- V3 bundle timestamp when present; scene packets also expose their V3 timestamp

## `ObjectPacket`

An object can contain:

- cluster data;
- point-cloud data;
- both.

Cluster data includes state, centroid, velocity, bounding-box center/size/rotation, weight and look-at vector. `getBoundingBoxRotationEuler()` is only valid for degree/radian rotation modes; `getBoundingBoxRotationQuaternions()` is only valid for quaternion mode.

Point clouds expose packed XYZ coordinates through `Float32Array`. V3 object packets also expose the UUID sent by Pleiades and, for clusters, the readable ID carried in the cluster property.

## `ZoneEventPacket`

Provides:

- emitter zone address;
- enters;
- leaves;
- presence;
- density;
- optional slider, XY pad and point-cloud properties.

## `AugmentaWebSocketClient`

Convenience transport for environments with a WebSocket implementation.

Events:

- `open`
- `close`
- `error`
- `controlMessage`
- `setup`
- `update`
- `data`

The class accepts a custom `webSocketFactory`, which is useful for Node runtimes or Max/MSP environments that provide their own WebSocket package. Delayed events from an older socket are ignored after reconnect, and `poll()` requires the socket to be open.
