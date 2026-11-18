// Import this file before a page that imports an image
// (`import player from "…/player.png"`, the home page's hero).
//
// A static image import is the bundler's job: Next.js turns it into an object
// with the file's URL and size. `npm test` runs under tsx with no bundler, so
// the same import would load the PNG as JavaScript and throw. This registers
// a loader that answers with an object of that shape instead, so a test can
// render the whole page. Test-only: nothing under src/app or src/components
// imports it.

import Module from "node:module";

type Loader = (module: { exports: unknown }, filename: string) => void;

const extensions = (Module as unknown as { _extensions: Record<string, Loader> })._extensions;

for (const extension of [".png", ".jpg", ".jpeg", ".webp", ".avif"]) {
  extensions[extension] = (module, filename) => {
    const name = filename.split(/[\\/]/).pop() ?? "image";
    module.exports = { src: `/_static/${name}`, width: 1280, height: 446 };
  };
}
