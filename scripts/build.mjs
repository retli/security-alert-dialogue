import { build } from "esbuild";
import { rm, mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = path.join(ROOT, "dist");

async function cleanDist() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
}

const aliasPlugin = {
  name: "browser-alias",
  setup(buildCtx) {
    buildCtx.onResolve({ filter: /^node:async_hooks$/ }, () => ({
      path: path.join(ROOT, "src/shims/async_hooks.ts")
    }));
  }
};

async function bundle() {
  await build({
    entryPoints: [
      path.join(ROOT, "src/popup/popup.ts"),
      path.join(ROOT, "src/options/options.ts")
    ],
    outdir: DIST,
    bundle: true,
    format: "esm",
    splitting: true,
    sourcemap: true,
    minify: false,
    platform: "browser",
    target: ["chrome115"],
    outbase: path.join(ROOT, "src"),
    entryNames: "[dir]/[name]",
    tsconfig: path.join(ROOT, "tsconfig.json"),
    plugins: [aliasPlugin]
  });
}

async function copyStatic() {
  await cp(path.join(ROOT, "manifest.json"), path.join(DIST, "manifest.json"));
  await cp(path.join(ROOT, "src/popup/popup.html"), path.join(DIST, "popup/popup.html"), {
    recursive: true
  });
  await cp(path.join(ROOT, "src/popup/popup.css"), path.join(DIST, "popup/popup.css"), {
    recursive: true
  });
  await cp(
    path.join(ROOT, "src/options/options.html"),
    path.join(DIST, "options/options.html"),
    { recursive: true }
  );
  await cp(
    path.join(ROOT, "src/options/options.css"),
    path.join(DIST, "options/options.css"),
    { recursive: true }
  );
  await cp(path.join(ROOT, "src/background.js"), path.join(DIST, "background.js"));
  const assetsSrc = path.join(ROOT, "assets");
  await cp(assetsSrc, path.join(DIST, "assets"), { recursive: true }).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}

await cleanDist();
await bundle();
await copyStatic();
console.log("Build complete.");

