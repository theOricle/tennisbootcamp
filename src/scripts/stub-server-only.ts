// Import this file before a module that imports "server-only"
// (src/lib/players.ts, and through it the dashboard's view).
//
// Next.js answers `import "server-only"` itself: an empty module on the
// server, a build error in a client bundle. `npm test` runs under tsx with no
// bundler and no such package installed, so the bare import would throw. This
// points it at the empty module Next ships for the server, so a test can
// render a view that imports a server helper's names. Test-only: nothing
// under src/app or src/components imports it.

import Module, { createRequire } from "node:module";
import { join } from "node:path";

type Resolve = (this: unknown, request: string, ...rest: unknown[]) => string;

const loader = Module as unknown as { _resolveFilename: Resolve };
const original = loader._resolveFilename;
const empty = createRequire(join(process.cwd(), "package.json")).resolve("next/dist/compiled/server-only/empty.js");

loader._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return empty;
  return original.call(this, request, ...rest);
};
