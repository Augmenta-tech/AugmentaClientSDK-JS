import {
  ClusterProperty,
  ClusterState,
  DataBlob,
  ObjectPacket,
  PointCloudProperty,
  SceneInfoPacket,
  ZoneEventPacket,
  ZoneEventProperty,
  ZonePropertyType,
  type Vector3
} from './data.js';
import { ProtocolOptions, RotationMode } from './options.js';

export type BinaryData = ArrayBuffer | ArrayBufferView;
export type Decompressor = (data: Uint8Array) => Uint8Array;

const textDecoder = new TextDecoder();

function asUint8Array(data: BinaryData): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

class Reader {
  readonly view: DataView;
  offset = 0;

  constructor(public readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number { return this.bytes.byteLength; }
  get remaining(): number { return this.length - this.offset; }

  ensure(size: number, context: string): void {
    if (size < 0 || this.offset + size > this.length) {
      throw new RangeError(`Malformed Augmenta packet while reading ${context}.`);
    }
  }

  u8(context = 'uint8'): number {
    this.ensure(1, context);
    return this.view.getUint8(this.offset++);
  }

  i32(context = 'int32'): number {
    this.ensure(4, context);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f32(context = 'float32'): number {
    this.ensure(4, context);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  vec3(context = 'vec3'): Vector3 {
    return [this.f32(context), this.f32(context), this.f32(context)];
  }

  floats(count: number, context: string): Float32Array {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`Invalid float count while reading ${context}.`);
    }
    const output = new Float32Array(count);
    for (let i = 0; i < count; i++) output[i] = this.f32(context);
    return output;
  }

  string(byteLength: number, context = 'string'): string {
    this.ensure(byteLength, context);
    const value = textDecoder.decode(this.bytes.subarray(this.offset, this.offset + byteLength));
    this.offset += byteLength;
    return value;
  }

  seek(offset: number, context = 'packet'): void {
    if (!Number.isInteger(offset) || offset < 0 || offset > this.length) {
      throw new RangeError(`Malformed Augmenta ${context} boundary.`);
    }
    this.offset = offset;
  }
}

enum PacketType {
  Object = 0,
  ZoneEvent = 1,
  Scene = 2,
  Bundle = 255
}

enum ObjectPropertyType {
  Points = 0,
  Cluster = 1
}

interface ParsedBlobState {
  sceneInfo: SceneInfoPacket;
  objects: ObjectPacket[];
  zoneEvents: ZoneEventPacket[];
  timestamp?: number;
}

function parsePointCloud(reader: Reader, options: ProtocolOptions, end: number): PointCloudProperty {
  const pointCount = reader.i32('point count');
  if (pointCount < 0) throw new RangeError('Malformed Augmenta point count.');

  const points = reader.floats(pointCount * 3, 'point cloud coordinates');
  let intensity: Float32Array | undefined;
  if (options.displayPointIntensity && reader.offset + pointCount * 4 <= end) {
    intensity = reader.floats(pointCount, 'point cloud intensity');
  }

  return intensity === undefined
    ? new PointCloudProperty(points)
    : new PointCloudProperty(points, intensity);
}

function parseCluster(reader: Reader, options: ProtocolOptions): { cluster: ClusterProperty; readableID?: number } {
  const state = reader.i32('cluster state') as ClusterState;
  const centroid = reader.vec3('cluster centroid');
  const velocity = reader.vec3('cluster velocity');
  const boundingBoxCenter = reader.vec3('bounding box center');
  const boundingBoxSize = reader.vec3('bounding box size');
  const weight = reader.f32('cluster weight');
  const rotationCount = options.boxRotationMode === RotationMode.Quaternions ? 4 : 3;
  const rotation = Array.from(reader.floats(rotationCount, 'bounding box rotation'));
  const lookAt = reader.vec3('cluster look-at');

  const cluster = new ClusterProperty(
    state,
    centroid,
    velocity,
    boundingBoxCenter,
    boundingBoxSize,
    weight,
    rotation,
    lookAt
  );
  if (options.version >= 3) {
    return { cluster, readableID: reader.i32('cluster readable id') };
  }
  return { cluster };
}

function formatUUID(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseObject(reader: Reader, options: ProtocolOptions, packetEnd: number): ObjectPacket {
  let id: number | undefined;
  let uuid: string | undefined;
  if (options.version >= 3) {
    reader.ensure(16, 'object UUID');
    uuid = formatUUID(reader.bytes.subarray(reader.offset, reader.offset + 16));
    reader.offset += 16;
  } else {
    id = reader.i32('object id');
  }
  const propertiesCount = reader.i32('object property count');
  if (propertiesCount < 0) throw new RangeError('Malformed Augmenta object property count.');

  let cluster: ClusterProperty | undefined;
  let pointCloud: PointCloudProperty | undefined;

  for (let i = 0; i < propertiesCount; i++) {
    const propertyStart = reader.offset;
    const propertySize = reader.i32('object property size');
    const propertyType = reader.i32('object property type') as ObjectPropertyType;
    const propertyEnd = propertyStart + propertySize;
    if (propertySize < 8 || propertyEnd > packetEnd) {
      throw new RangeError('Malformed Augmenta object property size.');
    }

    if (propertyType === ObjectPropertyType.Points) {
      pointCloud = parsePointCloud(reader, options, propertyEnd);
    } else if (propertyType === ObjectPropertyType.Cluster) {
      const parsedCluster = parseCluster(reader, options);
      cluster = parsedCluster.cluster;
      if (parsedCluster.readableID !== undefined) id = parsedCluster.readableID;
    }

    // Property size is authoritative. This also keeps newer/unknown properties forward-compatible.
    reader.seek(propertyEnd, 'object property');
  }

  return uuid === undefined
    ? new ObjectPacket(id, cluster, pointCloud)
    : new ObjectPacket(id, cluster, pointCloud, uuid);
}

function parseZoneEvent(reader: Reader, options: ProtocolOptions, packetEnd: number): ZoneEventPacket {
  const addressSize = reader.i32('zone address size');
  if (addressSize < 0) throw new RangeError('Malformed Augmenta zone address size.');
  const address = reader.string(addressSize, 'zone address');
  const enters = reader.u8('zone enters');
  const leaves = reader.u8('zone leaves');
  const presence = reader.i32('zone presence');
  const density = reader.f32('zone density');
  const propertiesCount = reader.i32('zone property count');
  if (propertiesCount < 0) throw new RangeError('Malformed Augmenta zone property count.');

  const properties: ZoneEventProperty[] = [];
  for (let i = 0; i < propertiesCount; i++) {
    const propertyStart = reader.offset;
    const propertySize = reader.i32('zone property size');
    const propertyType = reader.u8('zone property type') as ZonePropertyType;
    const propertyEnd = propertyStart + propertySize;
    if (propertySize < 5 || propertyEnd > packetEnd) {
      throw new RangeError('Malformed Augmenta zone property size.');
    }

    if (propertyType === ZonePropertyType.Slider) {
      properties.push(new ZoneEventProperty(propertyType, { value: reader.f32('zone slider') }));
    } else if (propertyType === ZonePropertyType.XYPad) {
      properties.push(new ZoneEventProperty(propertyType, {
        x: reader.f32('zone XY pad x'),
        y: reader.f32('zone XY pad y')
      }));
    } else if (propertyType === ZonePropertyType.PointCloud) {
      properties.push(new ZoneEventProperty(propertyType, parsePointCloud(reader, options, propertyEnd)));
    }

    reader.seek(propertyEnd, 'zone property');
  }

  return new ZoneEventPacket(address, enters, leaves, presence, density, properties);
}

function parseScene(reader: Reader, options: ProtocolOptions): SceneInfoPacket {
  const addressSize = reader.i32('scene address size');
  if (addressSize < 0) throw new RangeError('Malformed Augmenta scene address size.');
  const address = reader.string(addressSize, 'scene address');
  if (options.version >= 3) return new SceneInfoPacket(address, reader.i32('scene timestamp'));
  return new SceneInfoPacket(address);
}

function parsePacket(reader: Reader, state: ParsedBlobState, options: ProtocolOptions): void {
  const packetStart = reader.offset;
  const packetSize = reader.i32('packet size');
  const type = reader.u8('packet type') as PacketType;
  const packetEnd = packetStart + packetSize;

  if (packetSize < 5 || packetEnd > reader.length) {
    throw new RangeError('Malformed Augmenta packet size.');
  }

  if (type === PacketType.Bundle) {
    if (options.version >= 3) state.timestamp = reader.i32('bundle timestamp');
    const packetCount = reader.i32('bundle packet count');
    if (packetCount < 0) throw new RangeError('Malformed Augmenta bundle packet count.');
    for (let i = 0; i < packetCount; i++) parsePacket(reader, state, options);
  } else if (type === PacketType.Object) {
    state.objects.push(parseObject(reader, options, packetEnd));
  } else if (type === PacketType.ZoneEvent) {
    state.zoneEvents.push(parseZoneEvent(reader, options, packetEnd));
  } else if (type === PacketType.Scene) {
    state.sceneInfo = parseScene(reader, options);
  } else {
    throw new Error(`Unknown Augmenta packet type ${type}.`);
  }

  // Packet size comes from Pleiades and is authoritative. It lets clients ignore future fields safely.
  reader.seek(packetEnd, 'packet');
}

export function parseDataBlob(
  data: BinaryData,
  options: ProtocolOptions,
  decompressor?: Decompressor
): DataBlob {
  if (options.version < 2) {
    throw new Error('AugmentaClientSDK-JS currently supports binary WebSocket protocol V2 and newer.');
  }

  let bytes = asUint8Array(data);
  if (options.useCompression) {
    if (!decompressor) {
      throw new Error(
        'The Augmenta stream uses Zstd compression. Provide a synchronous decompressor or set useCompression to false.'
      );
    }
    bytes = decompressor(bytes);
  }

  const reader = new Reader(bytes);
  const state: ParsedBlobState = {
    sceneInfo: new SceneInfoPacket(),
    objects: [],
    zoneEvents: []
  };
  parsePacket(reader, state, options);

  return state.timestamp === undefined
    ? new DataBlob(state.sceneInfo, state.objects, state.zoneEvents)
    : new DataBlob(state.sceneInfo, state.objects, state.zoneEvents, state.timestamp);
}

