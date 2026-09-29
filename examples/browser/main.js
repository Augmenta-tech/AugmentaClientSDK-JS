import { AugmentaWebSocketClient } from '../../dist/esm/index.js';

const status = document.querySelector('#status');
const augmenta = new AugmentaWebSocketClient('ws://127.0.0.1:8080', {
  clientName: 'Augmenta browser example',
  options: {
    useCompression: false,
    streamClouds: false,
    streamClusterPoints: false
  }
});

augmenta.on('open', () => { status.textContent = 'Connected'; });
augmenta.on('data', (frame) => {
  status.textContent = `Tracked objects: ${frame.getObjectCount()}\nZone events: ${frame.getZoneEventCount()}`;
});
augmenta.on('error', (error) => { console.error(error); status.textContent = 'Connection error'; });
augmenta.connect();
