// Meshes chunks on another thread. The volume goes back with the answer, so that the main thread can use it again.
import { meshVolume, setTables } from './mesher.js';

self.onmessage = ({ data }) => {
  if (data.tables) { setTables(data.tables); return; }
  const { key, stamp, volume } = data, { upper, deep, links } = meshVolume(data), buffers = [volume.buffer, links.buffer];
  for (const part of [...upper, ...deep]) buffers.push(part.cell.buffer, part.info.buffer);
  postMessage({ key, stamp, volume, upper, deep, links }, buffers);
};
postMessage({ ready: true });
