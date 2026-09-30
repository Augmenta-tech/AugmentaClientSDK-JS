export type Vector3 = readonly [number, number, number];
export type Vector4 = readonly [number, number, number, number];

export enum ClusterState {
  Entered = 0,
  Updated = 1,
  WillLeave = 2,
  Ghost = 3
}

export class SceneInfoPacket {
  constructor(
    public readonly address = '',
    /** Present on protocol V3 scene packets. */
    public readonly timestamp?: number
  ) {}
  getAddress(): string { return this.address; }
  getTimestamp(): number | undefined { return this.timestamp; }
}

export class ClusterProperty {
  constructor(
    public readonly state: ClusterState,
    public readonly centroid: Vector3,
    public readonly velocity: Vector3,
    public readonly boundingBoxCenter: Vector3,
    public readonly boundingBoxSize: Vector3,
    public readonly weight: number,
    public readonly boundingBoxRotation: readonly number[],
    public readonly lookAt: Vector3
  ) {}

  getState(): ClusterState { return this.state; }
  getCentroid(): Vector3 { return this.centroid; }
  /** Velocity received from Augmenta in the requested axis/coordinate convention. */
  getVelocity(): Vector3 { return this.velocity; }
  getBoundingBoxCenter(): Vector3 { return this.boundingBoxCenter; }
  getBoundingBoxSize(): Vector3 { return this.boundingBoxSize; }
  getWeight(): number { return this.weight; }
  getBoundingBoxRotationEuler(): Vector3 {
    if (this.boundingBoxRotation.length < 3) throw new Error('Rotation data is unavailable.');
    return [this.boundingBoxRotation[0]!, this.boundingBoxRotation[1]!, this.boundingBoxRotation[2]!];
  }
  getBoundingBoxRotationQuaternions(): Vector4 {
    if (this.boundingBoxRotation.length !== 4) {
      throw new Error('Rotation mode is not quaternion.');
    }
    return [
      this.boundingBoxRotation[0]!,
      this.boundingBoxRotation[1]!,
      this.boundingBoxRotation[2]!,
      this.boundingBoxRotation[3]!
    ];
  }
  getLookAt(): Vector3 { return this.lookAt; }
}

/** XYZ points are packed as x,y,z,x,y,z... */
export class PointCloudProperty {
  constructor(
    public readonly points: Float32Array,
    public readonly intensity?: Float32Array
  ) {}

  getPointCount(): number { return this.points.length / 3; }
  getPointsData(): Float32Array { return this.points; }
  getIntensityData(): Float32Array | undefined { return this.intensity; }

  getPoint(index: number): Vector3 {
    if (!Number.isInteger(index) || index < 0 || index >= this.getPointCount()) {
      throw new RangeError(`Point index ${index} is out of range.`);
    }
    const offset = index * 3;
    return [this.points[offset]!, this.points[offset + 1]!, this.points[offset + 2]!];
  }
}

export class ObjectPacket {
  constructor(
    public readonly id: number | undefined,
    public readonly cluster?: ClusterProperty,
    public readonly pointCloud?: PointCloudProperty,
    /** Protocol V3 object UUID. */
    public readonly uuid?: string
  ) {}

  hasCluster(): boolean { return this.cluster !== undefined; }
  hasPointCloud(): boolean { return this.pointCloud !== undefined; }
  getID(): number | undefined { return this.id; }
  getUUID(): string | undefined { return this.uuid; }
  getCluster(): ClusterProperty {
    if (!this.cluster) throw new Error('Object does not contain cluster data.');
    return this.cluster;
  }
  getPointCloud(): PointCloudProperty {
    if (!this.pointCloud) throw new Error('Object does not contain point-cloud data.');
    return this.pointCloud;
  }
}

export enum ZonePropertyType {
  Slider = 0,
  XYPad = 1,
  PointCloud = 2
}

export interface SliderProperty { readonly value: number; }
export interface XYPadProperty { readonly x: number; readonly y: number; }

export type ZonePropertyData = SliderProperty | XYPadProperty | PointCloudProperty;

export class ZoneEventProperty {
  constructor(
    public readonly type: ZonePropertyType,
    public readonly data: ZonePropertyData
  ) {}

  getType(): ZonePropertyType { return this.type; }
  isSlider(): boolean { return this.type === ZonePropertyType.Slider; }
  isXYPad(): boolean { return this.type === ZonePropertyType.XYPad; }
  isPointCloud(): boolean { return this.type === ZonePropertyType.PointCloud; }
  getSliderParameters(): SliderProperty {
    if (!this.isSlider()) throw new Error('Zone property is not a slider.');
    return this.data as SliderProperty;
  }
  getXYPadParameters(): XYPadProperty {
    if (!this.isXYPad()) throw new Error('Zone property is not an XY pad.');
    return this.data as XYPadProperty;
  }
  getPointCloudParameters(): PointCloudProperty {
    if (!this.isPointCloud()) throw new Error('Zone property is not a point cloud.');
    return this.data as PointCloudProperty;
  }
}

export class ZoneEventPacket {
  constructor(
    public readonly emitterZoneAddress: string,
    public readonly enters: number,
    public readonly leaves: number,
    public readonly presence: number,
    public readonly density: number,
    public readonly properties: readonly ZoneEventProperty[]
  ) {}

  getEmitterZoneAddress(): string { return this.emitterZoneAddress; }
  getEnters(): number { return this.enters; }
  getLeaves(): number { return this.leaves; }
  getPresence(): number { return this.presence; }
  getDensity(): number { return this.density; }
  getPropertiesCount(): number { return this.properties.length; }
  getProperties(): readonly ZoneEventProperty[] { return this.properties; }
}

export class DataBlob {
  constructor(
    public readonly sceneInfo = new SceneInfoPacket(),
    public readonly objects: readonly ObjectPacket[] = [],
    public readonly zoneEvents: readonly ZoneEventPacket[] = [],
    /** Present on protocol V3 bundle packets. Value is the server millisecond counter. */
    public readonly timestamp?: number
  ) {}

  getObjectCount(): number { return this.objects.length; }
  getObjects(): readonly ObjectPacket[] { return this.objects; }
  getZoneEventCount(): number { return this.zoneEvents.length; }
  getZoneEvents(): readonly ZoneEventPacket[] { return this.zoneEvents; }
  /** Backward-compatible alias used by the C++ SDK. */
  getZones(): readonly ZoneEventPacket[] { return this.zoneEvents; }
  getSceneInfo(): SceneInfoPacket { return this.sceneInfo; }
}

export enum ControlMessageStatus {
  Unknown = 'unknown',
  Ok = 'ok',
  Error = 'error'
}

export enum ControlMessageType {
  Unknown = 'unknown',
  Update = 'update',
  Setup = 'setup'
}

export enum ContainerType {
  Unknown = 'Unknown',
  Container = 'Container',
  World = 'World',
  Zone = 'Zone',
  Scene = 'Scene'
}

export enum ShapeType {
  Unknown = 'Unknown',
  Box = 'Box',
  Cylinder = 'Cylinder',
  Sphere = 'Sphere',
  Path = 'Path',
  Grid = 'Grid',
  Polygon = 'Polygon',
  Segment = 'Segment'
}

export interface BoxShapeParameters { readonly size: Vector3; }
export interface CylinderShapeParameters { readonly radius: number; readonly height: number; }
export interface SphereShapeParameters { readonly radius: number; }
export interface EmptyShapeParameters {}
export type ShapeParameters = BoxShapeParameters | CylinderShapeParameters | SphereShapeParameters | EmptyShapeParameters;

export class ZoneParameters {
  constructor(
    public readonly shapeType: ShapeType,
    public readonly shapeParameters: ShapeParameters
  ) {}

  getShapeType(): ShapeType { return this.shapeType; }
  isBox(): boolean { return this.shapeType === ShapeType.Box; }
  isCylinder(): boolean { return this.shapeType === ShapeType.Cylinder; }
  isSphere(): boolean { return this.shapeType === ShapeType.Sphere; }
  isPath(): boolean { return this.shapeType === ShapeType.Path; }
  isGrid(): boolean { return this.shapeType === ShapeType.Grid; }
  isPolygon(): boolean { return this.shapeType === ShapeType.Polygon; }
  isSegment(): boolean { return this.shapeType === ShapeType.Segment; }
  getBoxShapeParameters(): BoxShapeParameters {
    if (!this.isBox()) throw new Error('Zone is not a box.');
    return this.shapeParameters as BoxShapeParameters;
  }
  getCylinderShapeParameters(): CylinderShapeParameters {
    if (!this.isCylinder()) throw new Error('Zone is not a cylinder.');
    return this.shapeParameters as CylinderShapeParameters;
  }
  getSphereShapeParameters(): SphereShapeParameters {
    if (!this.isSphere()) throw new Error('Zone is not a sphere.');
    return this.shapeParameters as SphereShapeParameters;
  }
}

export interface SceneParameters { readonly size: Vector3; }
export interface ContainerParameters {}
export type ContainerSpecificParameters = ZoneParameters | SceneParameters | ContainerParameters | undefined;

export class Container {
  constructor(
    public readonly type = ContainerType.Unknown,
    public readonly name = '',
    public readonly address = '',
    public readonly position: Vector3 = [0, 0, 0],
    public readonly rotation: Vector3 = [0, 0, 0],
    public readonly color: Vector4 = [0, 0, 0, 0],
    public readonly parameters?: ContainerSpecificParameters,
    public readonly children: readonly Container[] = []
  ) {}

  getType(): ContainerType { return this.type; }
  isWorld(): boolean { return this.type === ContainerType.World; }
  isZone(): boolean { return this.type === ContainerType.Zone; }
  isScene(): boolean { return this.type === ContainerType.Scene; }
  isContainer(): boolean { return this.type === ContainerType.Container; }
  hasChildren(): boolean { return this.children.length > 0; }
  getChildren(): readonly Container[] { return this.children; }
  getName(): string { return this.name; }
  getAddress(): string { return this.address; }
  getPosition(): Vector3 { return this.position; }
  getRotation(): Vector3 { return this.rotation; }
  getColor(): Vector4 { return this.color; }
  getSceneParameters(): SceneParameters {
    if (!this.isScene()) throw new Error('Container is not a scene.');
    return this.parameters as SceneParameters;
  }
  getZoneParameters(): ZoneParameters {
    if (!this.isZone()) throw new Error('Container is not a zone.');
    return this.parameters as ZoneParameters;
  }
}

export class ControlMessage {
  constructor(
    public readonly type = ControlMessageType.Unknown,
    public readonly rootObject = new Container(),
    public readonly status = ControlMessageStatus.Unknown,
    public readonly errorMessage = '',
    public readonly serverProtocolVersion = 2
  ) {}

  isUpdate(): boolean { return this.type === ControlMessageType.Update; }
  isSetup(): boolean { return this.type === ControlMessageType.Setup; }
  getStatus(): ControlMessageStatus { return this.status; }
  getErrorMessage(): string { return this.errorMessage; }
  getServerProtocolVersion(): number { return this.serverProtocolVersion; }
  getRootObject(): Container { return this.rootObject; }
}
