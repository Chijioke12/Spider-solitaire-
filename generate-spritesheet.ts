import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

// --- Dimensions & Layout Config ---
const CARD_W = 20;
const CARD_H = 28;
const COLS = 13;
const ROWS = 5;

const IMG_W = COLS * CARD_W;
const IMG_H = ROWS * CARD_H;

// --- Colors [R, G, B, A] ---
const COLOR_TRANSPARENT = [0, 0, 0, 0];
const COLOR_BORDER = [15, 23, 42, 255];      // Slate-900: #0f172a
const COLOR_FACE_BG = [255, 255, 255, 255];   // Pure White
const COLOR_SHADOW = [226, 232, 240, 255];    // Slate-200: #e2e8f0
const COLOR_BLACK = [15, 23, 42, 255];       // Black suits
const COLOR_RED = [220, 38, 38, 255];         // Red suits (Red-600)
const COLOR_BACK_BG = [30, 64, 175, 255];       // Blue-800: #1e40af
const COLOR_BACK_ACCENT = [96, 165, 250, 255]; // Blue-400: #60a5fa
const COLOR_EMPTY_BORDER = [71, 85, 105, 255]; // Slate-600: #475569

// --- Bitmap Fonts & Glyphs (5x7) ---
const GLYPHS: Record<string, string[]> = {
  'A': [
    '.XXX.',
    'X...X',
    'X...X',
    'XXXXX',
    'X...X',
    'X...X',
    'X...X'
  ],
  '2': [
    'XXXX.',
    '....X',
    '....X',
    '.XXX.',
    'X....',
    'X....',
    'XXXXX'
  ],
  '3': [
    'XXXX.',
    '....X',
    '....X',
    '..XX.',
    '....X',
    '....X',
    'XXXX.'
  ],
  '4': [
    'X...X',
    'X...X',
    'X...X',
    'XXXXX',
    '....X',
    '....X',
    '....X'
  ],
  '5': [
    'XXXXX',
    'X....',
    'X....',
    'XXXX.',
    '....X',
    '....X',
    'XXXX.'
  ],
  '6': [
    '.XXXX',
    'X....',
    'X....',
    'XXXX.',
    'X...X',
    'X...X',
    '.XXX.'
  ],
  '7': [
    'XXXXX',
    '....X',
    '...X.',
    '..X..',
    '.X...',
    '.X...',
    '.X...'
  ],
  '8': [
    '.XXX.',
    'X...X',
    'X...X',
    '.XXX.',
    'X...X',
    'X...X',
    '.XXX.'
  ],
  '9': [
    '.XXX.',
    'X...X',
    'X...X',
    '.XXXX',
    '....X',
    '....X',
    '.XXX.'
  ],
  '10': [
    'X..XXX.',
    'X.X...X',
    'X.X...X',
    'X.X...X',
    'X.X...X',
    'X.X...X',
    'X..XXX.'
  ], // 7x7 for 10
  'J': [
    '..XXX',
    '....X',
    '....X',
    '....X',
    '....X',
    'X...X',
    '.XXX.'
  ],
  'Q': [
    '.XXX.',
    'X...X',
    'X...X',
    'X...X',
    'X.X.X',
    'X..XX',
    '.XXXX'
  ],
  'K': [
    'X...X',
    'X..X.',
    'X.X..',
    'XX...',
    'X.X..',
    'X..X.',
    'X...X'
  ]
};

// --- Suit Symbols (9x9 pixels) ---
const SUIT_GLYPHS: Record<string, string[]> = {
  spades: [
    '....X....',
    '...XXX...',
    '..XXXXX..',
    '.XXXXXXX.',
    'XXXXXXXXX',
    'XXXXXXXXX',
    '..XXXXX..',
    '...XXX...',
    '..XXXXX..'
  ],
  hearts: [
    '.XX...XX.',
    'XXXX.XXXX',
    'XXXXXXXXX',
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '...XXX...',
    '....X....',
    '.........'
  ],
  diamonds: [
    '....X....',
    '...XXX...',
    '..XXXXX..',
    '.XXXXXXX.',
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '...XXX...',
    '....X....'
  ],
  clubs: [
    '....X....',
    '...XXX...',
    '..XXXXX..',
    '.XXXXXXX.',
    'XXXXXXXXX',
    '..XXXXX..',
    '..XXXXX..',
    '...XXX...',
    '..XXXXX..'
  ]
};

// Initialize png image
const png = new PNG({ width: IMG_W, height: IMG_H });

// Fill everything transparent initially
for (let y = 0; y < IMG_H; y++) {
  for (let x = 0; x < IMG_W; x++) {
    setPixel(x, y, COLOR_TRANSPARENT);
  }
}

function setPixel(x: number, y: number, color: number[]) {
  if (x < 0 || x >= IMG_W || y < 0 || y >= IMG_H) return;
  const idx = (IMG_W * y + x) << 2;
  png.data[idx] = color[0];
  png.data[idx + 1] = color[1];
  png.data[idx + 2] = color[2];
  png.data[idx + 3] = color[3];
}

function drawRect(xStart: number, yStart: number, w: number, h: number, color: number[]) {
  for (let y = yStart; y < yStart + h; y++) {
    for (let x = xStart; x < xStart + w; x++) {
      setPixel(x, y, color);
    }
  }
}

// Draw a beautifully rounded card frame outline & background
function drawCardBackground(cardX: number, cardY: number, isFaceUp: boolean, isEmptySlot = false) {
  // Clear space with card shape
  if (isEmptySlot) {
    // Draw dashed/dotted empty card placeholder
    for (let y = 0; y < CARD_H; y++) {
      for (let x = 0; x < CARD_W; x++) {
        const globalX = cardX + x;
        const globalY = cardY + y;
        const isBorder = (x === 0 || x === CARD_W - 1 || y === 0 || y === CARD_H - 1);
        
        // Skip corner pixels to make it rounded
        if ((x === 0 && y === 0) || (x === CARD_W - 1 && y === 0) || 
            (x === 0 && y === CARD_H - 1) || (x === CARD_W - 1 && y === CARD_H - 1)) {
          continue;
        }

        if (isBorder) {
          // Draw dashed green-ish/slate border
          if ((x + y) % 4 < 2) {
            setPixel(globalX, globalY, COLOR_EMPTY_BORDER);
          }
        }
      }
    }
    return;
  }

  // Normal Card (Face Up or Back)
  for (let y = 0; y < CARD_H; y++) {
    for (let x = 0; x < CARD_W; x++) {
      const globalX = cardX + x;
      const globalY = cardY + y;

      const isCorner = (x === 0 && y === 0) || (x === CARD_W - 1 && y === 0) || 
                       (x === 0 && y === CARD_H - 1) || (x === CARD_W - 1 && y === CARD_H - 1);
      const isSecondCorner = (x === 1 && y === 0) || (x === 0 && y === 1) ||
                             (x === CARD_W - 2 && y === 0) || (x === CARD_W - 1 && y === 1) ||
                             (x === 1 && y === CARD_H - 1) || (x === 0 && y === CARD_H - 2) ||
                             (x === CARD_W - 2 && y === CARD_H - 1) || (x === CARD_W - 1 && y === CARD_H - 2);

      if (isCorner) {
        continue; // Fully transparent corner pixel
      }

      const isBorder = isSecondCorner || x === 0 || x === CARD_W - 1 || y === 0 || y === CARD_H - 1;

      if (isBorder) {
        setPixel(globalX, globalY, COLOR_BORDER);
      } else {
        if (isFaceUp) {
          // Subtle shadow edge at bottom/right of face card
          if (x === CARD_W - 2 || y === CARD_H - 2) {
            setPixel(globalX, globalY, COLOR_SHADOW);
          } else {
            setPixel(globalX, globalY, COLOR_FACE_BG);
          }
        } else {
          // Card back pattern
          const isInnerBorder = (x <= 1 || x >= CARD_W - 2 || y <= 1 || y >= CARD_H - 2);
          if (isInnerBorder) {
            setPixel(globalX, globalY, COLOR_FACE_BG); // White border
          } else {
            // Draw a gorgeous retro checkered cross-hatch web pattern
            const isPattern = (x + y) % 4 === 0 || (x - y) % 4 === 0;
            setPixel(globalX, globalY, isPattern ? COLOR_BACK_ACCENT : COLOR_BACK_BG);
          }
        }
      }
    }
  }
}

// Draw a font character glyph at a coordinate
function drawGlyph(cardX: number, cardY: number, key: string, destX: number, destY: number, color: number[]) {
  const glyph = GLYPHS[key];
  if (!glyph) return;

  for (let r = 0; r < glyph.length; r++) {
    const rowStr = glyph[r];
    for (let c = 0; c < rowStr.length; c++) {
      if (rowStr[c] === 'X') {
        setPixel(cardX + destX + c, cardY + destY + r, color);
      }
    }
  }
}

// Draw a suit symbol at a coordinate
function drawSuit(cardX: number, cardY: number, suit: string, destX: number, destY: number, color: number[]) {
  const symbol = SUIT_GLYPHS[suit];
  if (!symbol) return;

  for (let r = 0; r < symbol.length; r++) {
    const rowStr = symbol[r];
    for (let c = 0; c < rowStr.length; c++) {
      if (rowStr[c] === 'X') {
        setPixel(cardX + destX + c, cardY + destY + r, color);
      }
    }
  }
}

// --- Render All Card Frames ---

// Rows 0 to 3: Suits (Spades, Hearts, Diamonds, Clubs)
const SUITS: ('spades' | 'hearts' | 'diamonds' | 'clubs')[] = ['spades', 'hearts', 'diamonds', 'clubs'];

SUITS.forEach((suit, rowIdx) => {
  const suitColor = (suit === 'hearts' || suit === 'diamonds') ? COLOR_RED : COLOR_BLACK;

  for (let colIdx = 0; colIdx < 13; colIdx++) {
    const rank = colIdx + 1;
    const cardX = colIdx * CARD_W;
    const cardY = rowIdx * CARD_H;

    // 1. Draw card base
    drawCardBackground(cardX, cardY, true);

    // 2. Draw Top Left Rank Text
    const rankStr = rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : rank.toString();
    drawGlyph(cardX, cardY, rankStr, 2, 2, suitColor);

    // 3. Draw Center Big Suit Icon
    drawSuit(cardX, cardY, suit, 5, 14, suitColor);
  }
});

// Row 4: Special Cards
// Col 0: Card Back
drawCardBackground(0 * CARD_W, 4 * CARD_H, false);

// Col 1: Empty Card Placeholder Slot
drawCardBackground(1 * CARD_W, 4 * CARD_H, true, true);

// Save generated image to file
const outputDir = path.resolve('.', 'public');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'cards.png');
png.pack()
  .pipe(fs.createWriteStream(outputPath))
  .on('finish', () => {
    console.log(`Success: Retro card spritesheet generated at ${outputPath} (Dimensions: ${IMG_W}x${IMG_H})`);
  });
