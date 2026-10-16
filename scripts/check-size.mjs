import { readdir, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
async function size(path) {
  const info = await stat(path);
  if (!info.isDirectory()) return info.size;
  const entries = await readdir(path, { withFileTypes: true });
  let bytes = 0;
  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name === ".git") continue;
    bytes += await size(resolve(path, entry.name));
  }
  return bytes;
}
const total = await size(root);
console.log(
  `Project including dependencies and build: ${(total / 1_000_000).toFixed(2)} MB / 1000 MB`,
);
if (total >= 1_000_000_000)
  throw new Error("Project exceeds the 1 GB storage budget.");
const dist = resolve(root, "dist");
try {
  console.log(
    `${relative(root, dist)}: ${((await size(dist)) / 1_000_000).toFixed(2)} MB`,
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  console.log(
    "Production build not present yet. Run npm run build to measure it.",
  );
}
