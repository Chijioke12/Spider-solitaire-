import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COLOR_BG = [15, 23, 42, 255]; // Slate-900
const COLOR_WHITE = [255, 255, 255, 255];
const COLOR_RED = [220, 38, 38, 255];

function createIcon(size) {
  const png = new PNG({ width: size, height: size });

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      
      // Draw background
      png.data[idx] = COLOR_BG[0];
      png.data[idx + 1] = COLOR_BG[1];
      png.data[idx + 2] = COLOR_BG[2];
      png.data[idx + 3] = COLOR_BG[3];

      // Draw a simple spade/spider shape in the middle (just a white diamond with a red center for simplicity)
      const cx = size / 2;
      const cy = size / 2;
      const dist = Math.abs(x - cx) + Math.abs(y - cy);
      
      if (dist < size * 0.3) {
        png.data[idx] = COLOR_WHITE[0];
        png.data[idx + 1] = COLOR_WHITE[1];
        png.data[idx + 2] = COLOR_WHITE[2];
        png.data[idx + 3] = COLOR_WHITE[3];
      } else if (dist < size * 0.4 && dist > size * 0.35) {
        png.data[idx] = COLOR_RED[0];
        png.data[idx + 1] = COLOR_RED[1];
        png.data[idx + 2] = COLOR_RED[2];
        png.data[idx + 3] = COLOR_RED[3];
      }
    }
  }

  return png;
}

function generateIcons() {
  const publicDir = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // 56x56
  const png56 = createIcon(56);
  png56.pack().pipe(fs.createWriteStream(path.join(publicDir, 'icon-56.png')));
  
  // 112x112
  const png112 = createIcon(112);
  png112.pack().pipe(fs.createWriteStream(path.join(publicDir, 'icon-112.png')));

  console.log('Successfully generated installation images (icons) at public/icon-56.png and public/icon-112.png');
}

generateIcons();
