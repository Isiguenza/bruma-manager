import sharp from "sharp";
import path from "path";

const assetsPath = "/Users/inakisiguenza/Desktop/Dev/POS Espantapajaros/bruma-manager/api-server/public/pass-assets";
const outputPath = "/Users/inakisiguenza/Desktop/test-stamp-strip.png";

const W = 1032;
const H = 336;
const STAMP_SIZE = 120;
const GAP_X = 110;   // horizontal gap
const GAP_Y = 70;    // vertical gap
const COLS = 4;
const stamps = 3;  // sellos llenos
const total = 8;   // total de sellos (2 filas x 4)

const rowW = COLS * STAMP_SIZE + (COLS - 1) * GAP_X;
const startX = Math.round((W - rowW) / 2);

const totalH = 2 * STAMP_SIZE + GAP_Y;
const startY = Math.round((H - totalH) / 2);

const composites = [];

const filledPath = path.join(assetsPath, "sello@2x.png");
const emptyPath = path.join(assetsPath, "sello_vacio@2x.png");

for (let i = 0; i < total; i++) {
  const isFilled = i < stamps;
  const imgPath = isFilled ? filledPath : emptyPath;
  const row = Math.floor(i / COLS);
  const col = i % COLS;
  composites.push({
    input: await sharp(imgPath).resize(STAMP_SIZE, STAMP_SIZE, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).toBuffer(),
    top: startY + row * (STAMP_SIZE + GAP_Y),
    left: startX + col * (STAMP_SIZE + GAP_X),
  });
}

await sharp({
  create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
})
  .composite(composites)
  .png()
  .toFile(outputPath);

console.log("Imagen generada:", outputPath);
console.log("Dimensiones:", W, "x", H);
console.log("Sellos:", stamps, "/", total);
