import { Client, type ClientInit } from './client.js';
import { ControlMessage, DataBlob } from './data.js';
import { ProtocolOptions, type ProtocolOptionsInit } from './options.js';

export interface WebSocketMessageEventLike { readonly data: unknown; }

export interface WebSocketLike {
  readonly readyState: number;
  binaryType?: string;
  send(data: string | ArrayBufferLike | ArrayBufferView | Blob): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: (event: unknown) => void): void;
  addEventListener(type: 'message', listener: (event: WebSocketMessageEventLike) => void): void;
  addEventListener(type: 'close', listener: (event: unknown) => void): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface AugmentaWebSocketClientInit extends ClientInit {
  clientName?: string;
  options?: ProtocolOptions | ProtocolOptionsInit;
  applicationName?: string;
  applicationVersion?: string;
  pluginVersion?: string;
  webSocketFactory?: WebSocketFactory;
}

interface EventMap {
  open: unknown;
  close: unknown;
  error: unknown;
  controlMessage: ControlMessage;
  setup: ControlMessage;
  update: ControlMessage;
  data: DataBlob;
}

export type AugmentaWebSocketEvent = keyof EventMap;
export type AugmentaWebSocketListener<K extends AugmentaWebSocketEvent> = (value: EventMap[K]) => void;

function defaultWebSocketFactory(url: string): WebSocketLike {
  const WebSocketConstructor = globalThis.WebSocket;
  if (typeof WebSocketConstructor !== 'function') {
    throw new Error(
      'No global WebSocket implementation is available. Provide webSocketFactory (for example from your Node.js WebSocket library).'
    );
  }
  return new WebSocketConstructor(url) as unknown as WebSocketLike;
}

function isArrayBufferView(value: unknown): value is ArrayBufferView {
  return ArrayBuffer.isView(value);
}

/** Convenience WebSocket transport for browsers and runtimes exposing WebSocket. */
export class AugmentaWebSocketClient {
  readonly client: Client;
  private readonly url: string;
  private readonly factory: WebSocketFactory;
  private socket: WebSocketLike | undefined;
  private listeners: { [K in AugmentaWebSocketEvent]?: Set<(value: EventMap[K]) => void> } = {};

  constructor(url: string, init: AugmentaWebSocketClientInit = {}) {
    if (!url) throw new Error('WebSocket URL must not be empty.');
    this.url = url;
    this.factory = init.webSocketFactory ?? defaultWebSocketFactory;
    this.client = new Client({ decompressor: init.decompressor });

    const options = init.options instanceof ProtocolOptions
      ? init.options
      : new ProtocolOptions({ useCompression: false, ...init.options });
    this.client.initialize(init.clientName ?? 'Augmenta JS Client', options);
    if (init.applicationName) this.client.setApplicationName(init.applicationName);
    if (init.applicationVersion) this.client.setApplicationVersion(init.applicationVersion);
    if (init.pluginVersion) this.client.setPluginVersion(init.pluginVersion);
  }

  on<K extends AugmentaWebSocketEvent>(event: K, listener: AugmentaWebSocketListener<K>): () => void {
    let set = this.listeners[event] as Set<AugmentaWebSocketListener<K>> | undefined;
    if (!set) {
      set = new Set();
      (this.listeners as Record<string, Set<unknown>>)[event] = set as Set<unknown>;
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  connect(): void {
    if (this.socket) throw new Error('WebSocket client is already connected or connecting.');
    const socket = this.factory(this.url);
    this.socket = socket;
    if ('binaryType' in socket) socket.binaryType = 'arraybuffer';

    socket.addEventListener('open', (event) => {
      if (this.socket !== socket) return;
      socket.send(this.client.getRegisterMessage());
      this.emit('open', event);
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      void this.handleMessage(event.data, socket).catch((error: unknown) => {
        if (this.socket === socket) this.emit('error', error);
      });
    });

    socket.addEventListener('close', (event) => {
      if (this.socket === socket) {
        this.socket = undefined;
        this.emit('close', event);
      } else if (this.socket === undefined) {
        // Preserve the close event for an explicit disconnect, but never let a
        // delayed close from an old socket disturb a newer connection.
        this.emit('close', event);
      }
    });

    socket.addEventListener('error', (event) => {
      if (this.socket === socket) this.emit('error', event);
    });
  }

  disconnect(code?: number, reason?: string): void {
    const socket = this.socket;
    this.socket = undefined;
    socket?.close(code, reason);
  }

  poll(): void {
    if (!this.socket || this.socket.readyState !== 1) {
      throw new Error('WebSocket client is not open.');
    }
    this.socket.send(this.client.getPollMessage());
  }

  getSocket(): WebSocketLike | undefined { return this.socket; }

  private async handleMessage(data: unknown, sourceSocket: WebSocketLike): Promise<void> {
    if (this.socket !== sourceSocket) return;

    if (typeof data === 'string') {
      const message = this.client.parseControlMessage(data);
      this.emit('controlMessage', message);
      if (message.isSetup()) this.emit('setup', message);
      else if (message.isUpdate()) this.emit('update', message);
      return;
    }

    let binary: ArrayBuffer | ArrayBufferView;
    if (data instanceof ArrayBuffer) binary = data;
    else if (isArrayBufferView(data)) binary = data;
    else if (typeof Blob !== 'undefined' && data instanceof Blob) binary = await data.arrayBuffer();
    else throw new TypeError('Unsupported WebSocket message type.');

    if (this.socket !== sourceSocket) return;
    this.emit('data', this.client.parseDataBlob(binary));
  }

  private emit<K extends AugmentaWebSocketEvent>(event: K, value: EventMap[K]): void {
    const set = this.listeners[event] as Set<AugmentaWebSocketListener<K>> | undefined;
    if (!set) return;
    for (const listener of set) listener(value);
  }
}
