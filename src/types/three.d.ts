// Fallback type declaration for `three` so the build passes when @types/three
// isn't installed. The runtime code uses three.js's own JS, but its bundled
// type definitions aren't always picked up by Next.js/Vercel's strict build.
// Treats THREE as `any` — fine for our small particle-wave usage.
declare module "three";
