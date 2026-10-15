// Models built in code (atoms, molecules, solids, the globe, the solar
// system…). Each returns {partId: Mesh} for the parts in its manifest.
export const generators = {};

export function procedural(manifest) {
  const make = generators[manifest.generator];
  if (!make) throw new Error(`no generator ${manifest.generator}`);
  return make(manifest);
}
