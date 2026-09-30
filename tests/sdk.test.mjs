import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  AugmentaWebSocketClient,
  AxisMode,
  Client,
  ClusterProperty,
  ClusterState,
  ContainerType,
  CoordinateSpace,
  OriginMode,
  ProtocolOptions,
  RotationMode,
  ShapeType,
  ZonePropertyType
} from '../dist/esm/index.js';

const encoder = new TextEncoder();
const concat = (...parts) => {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
};
const i32 = (value) => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, value, true); return b; };
const f32 = (value) => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, value, true); return b; };
const u8 = (value) => Uint8Array.of(value);
const str = (value) => encoder.encode(value);
const packet = (type, payload) => concat(i32(5 + payload.length), u8(type), payload);

function fixtureBytes(name) {
  const hex = readFileSync(new URL(`./fixtures/${name}.hex`, import.meta.url), 'utf8')
    .replace(/\s+/g, '');
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function pointCloudObjectPacket(pointCount) {
  const coordinates = new Uint8Array(pointCount * 3 * 4);
  const view = new DataView(coordinates.buffer);
  if (pointCount > 0) {
    view.setFloat32(0, 1, true);
    view.setFloat32(4, 2, true);
    view.setFloat32(8, 3, true);
    const last = (pointCount - 1) * 12;
    view.setFloat32(last, -1, true);
    view.setFloat32(last + 4, -2, true);
    view.setFloat32(last + 8, -3, true);
  }

  const propertyPayload = concat(i32(pointCount), coordinates);
  const property = concat(i32(8 + propertyPayload.length), i32(0), propertyPayload);
  return packet(0, concat(i32(7), i32(1), property));
}

function scenePacket(address = '/world/scene', timestamp) {
  const addressBytes = str(address);
  const payload = timestamp === undefined
    ? concat(i32(addressBytes.length), addressBytes)
    : concat(i32(addressBytes.length), addressBytes, i32(timestamp));
  return packet(2, payload);
}

function objectPacket() {
  const clusterPayload = concat(
    i32(ClusterState.Updated),
    f32(1), f32(2), f32(3),
    f32(0.1), f32(0.2), f32(0.3),
    f32(4), f32(5), f32(6),
    f32(0.5), f32(1.5), f32(2.5),
    f32(0.9),
    f32(0), f32(0), f32(0), f32(1),
    f32(1), f32(0), f32(0)
  );
  const clusterProperty = concat(i32(8 + clusterPayload.length), i32(1), clusterPayload);
  const unknownProperty = concat(i32(12), i32(99), i32(123456));
  return packet(0, concat(i32(42), i32(2), clusterProperty, unknownProperty));
}

function zonePacket() {
  const address = str('/world/scene/zone');
  const slider = concat(i32(9), u8(ZonePropertyType.Slider), f32(0.75));
  return packet(1, concat(
    i32(address.length), address,
    u8(1), u8(0), i32(2), f32(0.4),
    i32(1), slider
  ));
}

function bundleV2() {
  const packets = [scenePacket(), objectPacket(), zonePacket()];
  return packet(255, concat(i32(packets.length), ...packets));
}

function v3ObjectPacket() {
  const uuid = Uint8Array.from([0x00,0x11,0x22,0x33,0x44,0x55,0x66,0x77,0x88,0x99,0xaa,0xbb,0xcc,0xdd,0xee,0xff]);
  const clusterPayload = concat(
    i32(ClusterState.Entered),
    f32(1), f32(2), f32(3),
    f32(0.4), f32(-0.5), f32(0.6),
    f32(1), f32(1), f32(1),
    f32(2), f32(2), f32(2),
    f32(1),
    f32(0), f32(0), f32(0), f32(1),
    f32(0), f32(1), f32(0),
    i32(77)
  );
  const clusterProperty = concat(i32(8 + clusterPayload.length), i32(1), clusterPayload);
  return packet(0, concat(uuid, i32(1), clusterProperty));
}

function bundleV3(timestamp = 123456, sceneTimestamp = 222333) {
  const packets = [scenePacket('/v3/scene', sceneTimestamp), v3ObjectPacket()];
  return packet(255, concat(i32(timestamp), i32(packets.length), ...packets));
}

test('Client builds the same register-message contract as the C++ SDK', () => {
  const client = new Client();
  client.setApplicationName('Example app');
  client.setApplicationVersion('1.2.3');
  client.setPluginVersion('4.5.6');
  client.initialize('Browser client', new ProtocolOptions({
    tags: ['public'],
    streamClouds: false,
    streamClusterPoints: false,
    streamZonePoints: true,
    useCompression: false,
    axisTransform: {
      axis: AxisMode.YUpLeftHanded,
      origin: OriginMode.TopLeft,
      coordinateSpace: CoordinateSpace.Normalized,
      flipX: true
    }
  }));

  assert.deepEqual(JSON.parse(client.getRegisterMessage()), {
    register: {
      name: 'Browser client',
      'application-name': 'Example app',
      'application-version': '1.2.3',
      'plugin-version': '4.5.6',
      options: {
        version: 2,
        tags: ['public'],
        streamClouds: false,
        streamClusters: true,
        streamClusterPoints: false,
        streamZonePoints: true,
        downSample: 1,
        boxRotationMode: RotationMode.Quaternions,
        useCompression: false,
        usePolling: false,
        axisTransform: {
          axis: AxisMode.YUpLeftHanded,
          origin: OriginMode.TopLeft,
          flipX: true,
          flipY: false,
          flipZ: false,
          coordinateSpace: CoordinateSpace.Normalized
        }
      }
    }
  });
});

test('Control setup messages expose scene and zone hierarchy', () => {
  const client = new Client();
  client.initialize('test', { useCompression: false });
  const message = client.parseControlMessage(JSON.stringify({
    status: 'ok',
    version: 2,
    setup: {
      world: {
        name: 'World',
        type: 'world',
        children: {
          scene: {
            name: 'Scene',
            type: 'Scene',
            address: '/world/scene',
            size: [10, 3, 8],
            children: {
              zone: {
                name: 'Zone',
                type: 'Zone',
                address: '/world/scene/zone',
                position: [1, 2, 3],
                rotation: [0, 45, 0],
                localSliderAxis: 'z',
                shape: { type: 'Box', boxSize: [2, 1, 4] }
              }
            }
          }
        }
      }
    }
  }));

  assert.equal(message.isSetup(), true);
  assert.equal(message.getServerProtocolVersion(), 2);
  assert.equal(message.getRootObject().getType(), ContainerType.World);
  assert.equal(message.getRootObject().isWorld(), true);
  const scene = message.getRootObject().getChildren()[0];
  assert.equal(scene.getType(), ContainerType.Scene);
  assert.deepEqual(scene.getSceneParameters().size, [10, 3, 8]);
  const zone = scene.getChildren()[0];
  assert.equal(zone.getType(), ContainerType.Zone);
  assert.equal(zone.getZoneParameters().getShapeType(), ShapeType.Box);
  assert.equal(zone.getZoneParameters().getLocalSliderAxis(), 'z');
  assert.deepEqual(zone.getZoneParameters().getBoxShapeParameters().size, [2, 1, 4]);
});

test('Control update messages unwrap Pleiades short-name maps', () => {
  const client = new Client();
  client.initialize('test', { useCompression: false });

  const message = client.parseControlMessage(JSON.stringify({
    update: {
      scene: {
        name: 'Scene',
        type: 'Scene',
        address: '/world/scene',
        position: [2, 0, 3],
        rotation: [0, 15, 0],
        size: [12, 4, 9]
      }
    }
  }));

  assert.equal(message.isUpdate(), true);
  assert.equal(message.getRootObject().getType(), ContainerType.Scene);
  assert.equal(message.getRootObject().getAddress(), '/world/scene');
  assert.deepEqual(message.getRootObject().getSceneParameters().size, [12, 4, 9]);
});

test('V2 binary bundle parses scene, cluster and zone event', () => {
  const client = new Client();
  client.initialize('test', { useCompression: false, boxRotationMode: RotationMode.Quaternions });
  const data = client.parseDataBlob(bundleV2());

  assert.equal(data.getSceneInfo().getAddress(), '/world/scene');
  assert.equal(data.getObjectCount(), 1);
  const object = data.getObjects()[0];
  assert.equal(object.getID(), 42);
  assert.equal(object.getCluster().getState(), ClusterState.Updated);
  assert.deepEqual(object.getCluster().getCentroid(), [1, 2, 3]);
  assert.deepEqual(
    object.getCluster().getVelocity().map((value) => Number(value.toFixed(6))),
    [0.1, 0.2, 0.3]
  );
  assert.deepEqual(object.getCluster().getBoundingBoxRotationQuaternions(), [0, 0, 0, 1]);

  assert.equal(data.getZoneEventCount(), 1);
  const zone = data.getZoneEvents()[0];
  assert.equal(zone.getEmitterZoneAddress(), '/world/scene/zone');
  assert.equal(zone.getEnters(), 1);
  assert.equal(zone.getPresence(), 2);
  assert.ok(Math.abs(zone.getDensity() - 0.4) < 1e-6);
  assert.ok(Math.abs(zone.getProperties()[0].getSliderParameters().value - 0.75) < 1e-6);
});

test('V3 bundle follows the current Pleiades timestamp header', () => {
  const client = new Client();
  client.initialize('test', { version: 3, useCompression: false });
  const data = client.parseDataBlob(bundleV3(7654321, 1234));
  assert.equal(data.timestamp, 7654321);
  assert.equal(data.getSceneInfo().getAddress(), '/v3/scene');
  assert.equal(data.getSceneInfo().getTimestamp(), 1234);
  assert.equal(data.getObjects()[0].getID(), 77);
  assert.equal(data.getObjects()[0].getUUID(), '00112233-4455-6677-8899-aabbccddeeff');
  assert.deepEqual(
    data.getObjects()[0].getCluster().getVelocity().map((value) => Number(value.toFixed(6))),
    [0.4, -0.5, 0.6]
  );
});

test('Compression is transport-agnostic through an injected synchronous decompressor', () => {
  let called = false;
  const client = new Client({
    decompressor: (data) => { called = true; return data; }
  });
  client.initialize('test', { useCompression: true });
  const data = client.parseDataBlob(bundleV2());
  assert.equal(called, true);
  assert.equal(data.getObjectCount(), 1);
});

test('WebSocket convenience client registers and emits parsed control messages', async () => {
  class FakeSocket {
    readyState = 1;
    binaryType = '';
    sent = [];
    listeners = new Map();
    send(data) { this.sent.push(data); }
    close() { this.emit('close', {}); }
    addEventListener(type, listener) {
      const list = this.listeners.get(type) ?? [];
      list.push(listener);
      this.listeners.set(type, list);
    }
    emit(type, event) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  }

  const socket = new FakeSocket();
  const augmenta = new AugmentaWebSocketClient('ws://localhost:8080', {
    clientName: 'web-test',
    options: { useCompression: false },
    webSocketFactory: () => socket
  });

  const setupPromise = new Promise((resolve) => augmenta.on('setup', resolve));
  augmenta.connect();
  socket.emit('open', {});
  assert.equal(JSON.parse(socket.sent[0]).register.name, 'web-test');

  socket.emit('message', { data: JSON.stringify({ status: 'ok', version: 2, setup: { world: { name: 'World' } } }) });
  const setup = await setupPromise;
  assert.equal(setup.isSetup(), true);
});

test('CommonJS build can be required', () => {
  const require = createRequire(import.meta.url);
  const sdk = require('../dist/cjs/index.js');
  const client = new sdk.Client();
  client.initialize('cjs-test', { useCompression: false });
  assert.equal(typeof client.getRegisterMessage(), 'string');
});

test('WebSocket convenience defaults to uncompressed frames for zero-config web use', () => {
  class FakeSocket {
    readyState = 1;
    sent = [];
    listeners = new Map();
    send(data) { this.sent.push(data); }
    close() {}
    addEventListener(type, listener) {
      const list = this.listeners.get(type) ?? [];
      list.push(listener);
      this.listeners.set(type, list);
    }
    emit(type, event) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  }
  const socket = new FakeSocket();
  const augmenta = new AugmentaWebSocketClient('ws://localhost', { webSocketFactory: () => socket });
  augmenta.connect();
  socket.emit('open', {});
  assert.equal(JSON.parse(socket.sent[0]).register.options.useCompression, false);
});


test('ProtocolOptions rejects unsupported protocol versions', () => {
  assert.throws(() => new ProtocolOptions({ version: 1 }), RangeError);
  assert.doesNotThrow(() => new ProtocolOptions({ version: 2 }));
  assert.doesNotThrow(() => new ProtocolOptions({ version: 3 }));
  assert.throws(() => new ProtocolOptions({ version: 4 }), RangeError);
});

test('Rotation getters reject the wrong wire representation', () => {
  const quaternion = new ClusterProperty(
    ClusterState.Updated,
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [1, 1, 1],
    1,
    [0, 0, 0, 1],
    [0, 0, 1]
  );
  assert.throws(() => quaternion.getBoundingBoxRotationEuler(), /not Euler/);
  assert.deepEqual(quaternion.getBoundingBoxRotationQuaternions(), [0, 0, 0, 1]);

  const euler = new ClusterProperty(
    ClusterState.Updated,
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [1, 1, 1],
    1,
    [10, 20, 30],
    [0, 0, 1]
  );
  assert.deepEqual(euler.getBoundingBoxRotationEuler(), [10, 20, 30]);
  assert.throws(() => euler.getBoundingBoxRotationQuaternions(), /not quaternion/);
});

test('Pleiades V2 wire fixture parses standalone/cluster/zone point clouds and properties', () => {
  const client = new Client();
  client.initialize('fixture-v2', {
    version: 2,
    useCompression: false,
    displayPointIntensity: true
  });

  const data = client.parseDataBlob(fixtureBytes('pleiades-v2'));
  assert.equal(data.getSceneInfo().getAddress(), '/fixture/scene');
  assert.equal(data.getObjectCount(), 2);

  const standalone = data.getObjects()[0];
  assert.equal(standalone.getID(), 0);
  assert.equal(standalone.hasCluster(), false);
  assert.equal(standalone.getPointCloud().getPointCount(), 2);
  assert.deepEqual(Array.from(standalone.getPointCloud().getPointsData()), [
    1, 2, 3, -1.5, 0.25, 4.5
  ]);
  assert.deepEqual(
    Array.from(standalone.getPointCloud().getIntensityData(), (value) => Number(value.toFixed(3))),
    [0.1, 0.9]
  );

  const tracked = data.getObjects()[1];
  assert.equal(tracked.getID(), 42);
  assert.equal(tracked.hasCluster(), true);
  assert.equal(tracked.hasPointCloud(), true);
  assert.deepEqual(
    tracked.getCluster().getVelocity().map((value) => Number(value.toFixed(3))),
    [0.1, 0.2, 0.3]
  );

  const zone = data.getZoneEvents()[0];
  assert.equal(zone.getEmitterZoneAddress(), '/fixture/scene/zone');
  assert.equal(zone.getPresence(), 2);
  assert.equal(zone.getProperties().length, 3);
  assert.equal(
    Number(zone.getProperties()[0].getSliderParameters().value.toFixed(3)),
    0.25
  );
  assert.deepEqual(
    [
      zone.getProperties()[1].getXYPadParameters().x,
      zone.getProperties()[1].getXYPadParameters().y
    ].map((value) => Number(value.toFixed(3))),
    [0.2, 0.7]
  );
  assert.equal(zone.getProperties()[2].getPointCloudParameters().getPointCount(), 2);
});

test('Pleiades V3 wire fixture parses UUIDs, readable IDs and timestamps', () => {
  const client = new Client();
  client.initialize('fixture-v3', {
    version: 3,
    useCompression: false,
    displayPointIntensity: true
  });

  const data = client.parseDataBlob(fixtureBytes('pleiades-v3'));
  assert.equal(data.timestamp, 7654321);
  assert.equal(data.getSceneInfo().getAddress(), '/v3/scene');
  assert.equal(data.getSceneInfo().getTimestamp(), 1234);
  assert.equal(data.getObjectCount(), 1);

  const object = data.getObjects()[0];
  assert.equal(object.getUUID(), '00112233-4455-6677-8899-aabbccddeeff');
  assert.equal(object.getID(), 77);
  assert.equal(object.getPointCloud().getPointCount(), 2);
  assert.deepEqual(
    object.getCluster().getVelocity().map((value) => Number(value.toFixed(3))),
    [0.4, -0.5, 0.6]
  );
});

test('Large point clouds parse without per-coordinate allocation hazards', () => {
  const pointCount = 100_000;
  const client = new Client();
  client.initialize('large-cloud', { version: 2, useCompression: false });

  const object = client.parseDataBlob(pointCloudObjectPacket(pointCount)).getObjects()[0];
  const cloud = object.getPointCloud();
  assert.equal(cloud.getPointCount(), pointCount);
  assert.deepEqual(cloud.getPoint(0), [1, 2, 3]);
  assert.deepEqual(cloud.getPoint(pointCount - 1), [-1, -2, -3]);
});

test('Malformed point counts are rejected before allocating their declared payload', () => {
  const propertyPayload = i32(2_000_000_000);
  const property = concat(i32(8 + propertyPayload.length), i32(0), propertyPayload);
  const malformed = packet(0, concat(i32(7), i32(1), property));

  const client = new Client();
  client.initialize('malformed-cloud', { version: 2, useCompression: false });
  assert.throws(
    () => client.parseDataBlob(malformed),
    /point cloud coordinates/
  );
});

test('Nested packet sizes cannot escape their enclosing bundle boundary', () => {
  const child = packet(99, new Uint8Array());
  const malformedBundle = concat(
    i32(9),
    u8(255),
    i32(1),
    child
  );

  const client = new Client();
  client.initialize('nested-boundary', { version: 2, useCompression: false });
  assert.throws(
    () => client.parseDataBlob(malformedBundle),
    /Malformed Augmenta packet/
  );
});

test('Unknown packet families are skipped by their declared packet size', () => {
  const unknown = packet(99, Uint8Array.of(1, 2, 3, 4));
  const knownScene = scenePacket('/known/scene');
  const bundle = packet(255, concat(i32(2), unknown, knownScene));

  const client = new Client();
  client.initialize('future-packet', { version: 2, useCompression: false });
  const data = client.parseDataBlob(bundle);
  assert.equal(data.getSceneInfo().getAddress(), '/known/scene');
});

test('WebSocket convenience ignores delayed events from a replaced socket', () => {
  class FakeSocket {
    readyState = 0;
    binaryType = '';
    sent = [];
    listeners = new Map();
    send(data) { this.sent.push(data); }
    close() { this.readyState = 3; }
    addEventListener(type, listener) {
      const list = this.listeners.get(type) ?? [];
      list.push(listener);
      this.listeners.set(type, list);
    }
    emit(type, event) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
  }

  const sockets = [];
  const augmenta = new AugmentaWebSocketClient('ws://localhost', {
    webSocketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    }
  });

  let setups = 0;
  augmenta.on('setup', () => { setups++; });

  augmenta.connect();
  const first = sockets[0];
  first.readyState = 1;
  first.emit('open', {});

  augmenta.disconnect();
  augmenta.connect();
  const second = sockets[1];
  second.readyState = 1;
  second.emit('open', {});

  first.emit('close', {});
  first.emit('message', {
    data: JSON.stringify({ status: 'ok', version: 2, setup: { world: { name: 'stale' } } })
  });

  assert.equal(augmenta.getSocket(), second);
  assert.equal(setups, 0);

  second.emit('message', {
    data: JSON.stringify({ status: 'ok', version: 2, setup: { world: { name: 'current' } } })
  });
  assert.equal(setups, 1);
});

test('poll requires an open WebSocket', () => {
  class FakeSocket {
    readyState = 0;
    sent = [];
    listeners = new Map();
    send(data) { this.sent.push(data); }
    close() {}
    addEventListener(type, listener) {
      const list = this.listeners.get(type) ?? [];
      list.push(listener);
      this.listeners.set(type, list);
    }
    emit(type, event) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
  }

  const socket = new FakeSocket();
  const augmenta = new AugmentaWebSocketClient('ws://localhost', {
    options: { usePolling: true },
    webSocketFactory: () => socket
  });

  augmenta.connect();
  assert.throws(() => augmenta.poll(), /not open/);

  socket.readyState = 1;
  socket.emit('open', {});
  augmenta.poll();
  assert.deepEqual(JSON.parse(socket.sent.at(-1)), { poll: true });
});
