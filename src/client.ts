import { ControlMessage, DataBlob } from './data.js';
import { ProtocolOptions, type ProtocolOptionsInit } from './options.js';
import { parseControlMessage, parseDataBlob, type BinaryData, type Decompressor } from './parser.js';

export interface ClientInit {
  decompressor?: Decompressor | undefined;
}

/**
 * Transport-independent Augmenta client.
 *
 * Like the C++ and C# SDKs, this class does not own a WebSocket. Feed incoming
 * text/binary messages to the parser and send getRegisterMessage() yourself,
 * or use AugmentaWebSocketClient for the convenience transport.
 */
export class Client {
  private initialized = false;
  private applicationName = '-';
  private applicationVersion = '-';
  private pluginVersion = '-';
  private name = '';
  private options = new ProtocolOptions();
  private tags: string[] = [];
  private decompressor: Decompressor | undefined;

  constructor(init: ClientInit = {}) {
    this.decompressor = init.decompressor;
  }

  initialize(clientName: string, options: ProtocolOptions | ProtocolOptionsInit = new ProtocolOptions()): void {
    if (!clientName) throw new Error('Augmenta client name must not be empty.');
    this.name = clientName;
    this.options = options instanceof ProtocolOptions ? options.clone() : new ProtocolOptions(options);
    this.tags = [...this.options.tags];
    this.initialized = true;
  }

  shutdown(): void {
    this.initialized = false;
    this.name = '';
    this.options = new ProtocolOptions();
    this.tags = [];
  }

  isInitialized(): boolean { return this.initialized; }

  clearTags(): void {
    this.tags = [];
  }

  addTag(tag: string): void {
    if (!tag) return;
    this.tags.push(tag);
  }

  setApplicationName(appName: string): void { this.applicationName = appName || '-'; }
  setApplicationVersion(appVersion: string): void { this.applicationVersion = appVersion || '-'; }
  setPluginVersion(version: string): void { this.pluginVersion = version || '-'; }
  setDecompressor(decompressor?: Decompressor | undefined): void { this.decompressor = decompressor; }

  getCurrentOptions(): ProtocolOptions {
    this.assertInitialized();
    const current = this.options.clone();
    current.tags = [...this.tags];
    return current;
  }

  getRegisterMessage(): string {
    this.assertInitialized();
    const options = this.options;

    return JSON.stringify({
      register: {
        name: this.name,
        'application-name': this.applicationName,
        'application-version': this.applicationVersion,
        'plugin-version': this.pluginVersion,
        options: {
          version: options.version,
          tags: [...this.tags],
          streamClouds: options.streamClouds,
          streamClusters: options.streamClusters,
          streamClusterPoints: options.streamClusterPoints,
          streamZonePoints: options.streamZonePoints,
          downSample: options.downSample,
          boxRotationMode: options.boxRotationMode,
          useCompression: options.useCompression,
          usePolling: options.usePolling,
          axisTransform: {
            axis: options.axisTransform.axis,
            origin: options.axisTransform.origin,
            flipX: options.axisTransform.flipX,
            flipY: options.axisTransform.flipY,
            flipZ: options.axisTransform.flipZ,
            coordinateSpace: options.axisTransform.coordinateSpace
          }
        }
      }
    });
  }

  getPollMessage(): string {
    this.assertInitialized();
    if (!this.options.usePolling) {
      throw new Error('Polling is disabled in the current protocol options.');
    }
    return JSON.stringify({ poll: true });
  }

  parseDataBlob(blob: BinaryData): DataBlob {
    this.assertInitialized();
    return parseDataBlob(blob, this.options, this.decompressor);
  }

  parseControlMessage(rawMessage: string): ControlMessage {
    this.assertInitialized();
    return parseControlMessage(rawMessage);
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('Augmenta Client is not initialized. Call initialize() first.');
    }
  }
}
