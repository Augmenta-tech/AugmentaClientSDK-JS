export enum RotationMode {
  Radians = 'radians',
  Degrees = 'degrees',
  Quaternions = 'quaternions'
}

export enum AxisMode {
  ZUpRightHanded = 'z_up_right',
  ZUpLeftHanded = 'z_up_left',
  YUpRightHanded = 'y_up_right',
  YUpLeftHanded = 'y_up_left'
}

export enum OriginMode {
  BottomLeft = 'bottom_left',
  BottomRight = 'bottom_right',
  TopLeft = 'top_left',
  TopRight = 'top_right'
}

export enum CoordinateSpace {
  Absolute = 'absolute',
  Relative = 'relative',
  Normalized = 'normalized'
}

export interface AxisTransformInit {
  axis?: AxisMode;
  origin?: OriginMode;
  flipX?: boolean;
  flipY?: boolean;
  flipZ?: boolean;
  coordinateSpace?: CoordinateSpace;
}

export class AxisTransform {
  axis: AxisMode = AxisMode.ZUpRightHanded;
  origin: OriginMode = OriginMode.BottomLeft;
  flipX = false;
  flipY = false;
  flipZ = false;
  coordinateSpace: CoordinateSpace = CoordinateSpace.Absolute;

  constructor(init: AxisTransformInit = {}) {
    Object.assign(this, init);
  }

  clone(): AxisTransform {
    return new AxisTransform(this);
  }
}

export interface ProtocolOptionsInit {
  version?: number;
  tags?: string[];
  downSample?: number;
  streamClouds?: boolean;
  streamClusters?: boolean;
  streamClusterPoints?: boolean;
  streamZonePoints?: boolean;
  boxRotationMode?: RotationMode;
  axisTransform?: AxisTransformInit | AxisTransform;
  useCompression?: boolean;
  usePolling?: boolean;
  displayPointIntensity?: boolean;
}

/**
 * Options negotiated with the Augmenta WebSocket Output.
 *
 * Defaults intentionally follow the C++ client SDK. Web clients that do not
 * provide a Zstd decompressor should set `useCompression` to false.
 */
export class ProtocolOptions {
  version = 2;
  tags: string[] = [];
  downSample = 1;
  streamClouds = true;
  streamClusters = true;
  streamClusterPoints = true;
  streamZonePoints = false;
  boxRotationMode: RotationMode = RotationMode.Quaternions;
  axisTransform = new AxisTransform();
  useCompression = true;
  usePolling = false;
  displayPointIntensity = false;

  constructor(init: ProtocolOptionsInit = {}) {
    const { axisTransform, tags, ...rest } = init;
    Object.assign(this, rest);
    if (axisTransform) this.axisTransform = new AxisTransform(axisTransform);
    if (tags) this.tags = [...tags];

    if (!Number.isInteger(this.version) || this.version < 1) {
      throw new RangeError('Protocol version must be a positive integer.');
    }
    if (!Number.isInteger(this.downSample) || this.downSample < 1) {
      throw new RangeError('downSample must be an integer greater than or equal to 1.');
    }
  }

  clone(): ProtocolOptions {
    return new ProtocolOptions({
      ...this,
      tags: [...this.tags],
      axisTransform: this.axisTransform.clone()
    });
  }
}
