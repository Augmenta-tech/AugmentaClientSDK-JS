import {
  Container,
  ContainerType,
  ControlMessage,
  ControlMessageStatus,
  ControlMessageType,
  ShapeType,
  ZoneParameters,
  type Vector3,
  type Vector4
} from './data.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function vec3(value: unknown): Vector3 {
  const a = Array.isArray(value) ? value : [];
  return [numberValue(a[0]), numberValue(a[1]), numberValue(a[2])];
}

function vec4(value: unknown): Vector4 {
  const a = Array.isArray(value) ? value : [];
  return [numberValue(a[0]), numberValue(a[1]), numberValue(a[2]), numberValue(a[3])];
}

function parseContainer(value: unknown): Container {
  if (!isRecord(value)) return new Container();

  const name = typeof value.name === 'string' ? value.name : '';
  const address = typeof value.address === 'string' ? value.address : '';
  const position = vec3(value.position);
  const rotation = vec3(value.rotation);
  const color = vec4(value.color);
  const rawChildren = Array.isArray(value.children)
    ? value.children
    : isRecord(value.children)
      ? Object.values(value.children)
      : [];
  const children = rawChildren.map(parseContainer);
  const rawType = typeof value.type === 'string' ? value.type : '';

  if (rawType.toLowerCase() === 'world') {
    return new Container(
      ContainerType.World,
      name,
      address,
      position,
      rotation,
      color,
      {},
      children
    );
  }

  if (rawType === 'Zone') {
    const shape = isRecord(value.shape) ? value.shape : {};
    const rawShapeType = typeof shape.type === 'string' ? shape.type : '';
    let shapeType = ShapeType.Unknown;
    let shapeParameters: Record<string, unknown> = {};

    switch (rawShapeType) {
      case 'Box':
        shapeType = ShapeType.Box;
        shapeParameters = { size: vec3(shape.boxSize) };
        break;
      case 'Cylinder':
        shapeType = ShapeType.Cylinder;
        shapeParameters = { radius: numberValue(shape.radius), height: numberValue(shape.height) };
        break;
      case 'Sphere':
        shapeType = ShapeType.Sphere;
        shapeParameters = { radius: numberValue(shape.radius) };
        break;
      case 'Path': shapeType = ShapeType.Path; break;
      case 'Grid': shapeType = ShapeType.Grid; break;
      case 'Polygon': shapeType = ShapeType.Polygon; break;
      case 'Segment': shapeType = ShapeType.Segment; break;
      default: break;
    }

    const rawSliderAxis = value.localSliderAxis;
    const localSliderAxis = rawSliderAxis === 'y' || rawSliderAxis === 'z' ? rawSliderAxis : 'x';

    return new Container(
      ContainerType.Zone,
      name,
      address,
      position,
      rotation,
      color,
      new ZoneParameters(shapeType, shapeParameters, localSliderAxis),
      children
    );
  }

  if (rawType === 'Scene') {
    return new Container(
      ContainerType.Scene,
      name,
      address,
      position,
      rotation,
      color,
      { size: vec3(value.size) },
      children
    );
  }

  const type = rawType ? ContainerType.Container : ContainerType.Unknown;
  return new Container(type, name, address, position, rotation, color, {}, children);
}

function parseContainerPayload(value: unknown): Container {
  if (Array.isArray(value)) return parseContainer(value[0]);

  let current = value;
  for (let depth = 0; depth < 3 && isRecord(current); depth++) {
    if (
      typeof current.type === 'string' ||
      typeof current.address === 'string' ||
      typeof current.name === 'string'
    ) {
      return parseContainer(current);
    }

    const nested = Object.values(current).find(isRecord);
    if (!nested) break;
    current = nested;
  }

  return parseContainer(current);
}

export function parseControlMessage(rawMessage: string): ControlMessage {
  const parsed: unknown = JSON.parse(rawMessage);
  if (!isRecord(parsed)) throw new TypeError('Augmenta control message must be a JSON object.');

  let status = ControlMessageStatus.Unknown;
  let errorMessage = '';
  if (parsed.status === 'ok') status = ControlMessageStatus.Ok;
  else if (parsed.status === 'error') {
    status = ControlMessageStatus.Error;
    errorMessage = typeof parsed.error === 'string' ? parsed.error : '';
  }

  const serverProtocolVersion = Number.isInteger(parsed.version) ? parsed.version as number : 2;

  if (isRecord(parsed.setup)) {
    return new ControlMessage(
      ControlMessageType.Setup,
      parseContainer(parsed.setup.world),
      status,
      errorMessage,
      serverProtocolVersion
    );
  }

  if (Array.isArray(parsed.update) || isRecord(parsed.update)) {
    return new ControlMessage(
      ControlMessageType.Update,
      parseContainerPayload(parsed.update),
      status,
      errorMessage,
      serverProtocolVersion
    );
  }

  return new ControlMessage(ControlMessageType.Unknown, new Container(), status, errorMessage, serverProtocolVersion);
}
