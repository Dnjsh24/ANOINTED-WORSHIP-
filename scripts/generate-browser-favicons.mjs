import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const logo = await readFile(new URL("../public/brand/sunday-setlist-icon.svg", import.meta.url));
await writeFile(new URL("../public/sunday-setlist-favicon-v2.svg", import.meta.url), logo);
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => sharp(logo).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let index = 0; index < sizes.length; index += 1) {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
const icon = Buffer.concat([header, ...images]);
for (const path of ["../src/app/favicon.ico", "../public/sunday-setlist-favicon.ico", "../public/sunday-setlist-favicon-v2.ico"]) {
  await writeFile(new URL(path, import.meta.url), icon);
}
for (let index = 0; index < 2; index += 1) {
  for (const prefix of ["favicon-", "sunday-setlist-favicon-", "sunday-setlist-favicon-v2-"]) {
    await writeFile(new URL(`../public/${prefix}${sizes[index]}x${sizes[index]}.png`, import.meta.url), images[index]);
  }
}
console.log("Generated transparent purple browser favicons; PWA and Apple icons preserved.");
