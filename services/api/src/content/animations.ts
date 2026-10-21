/**
 * The board's built-in concept animations (packages/kinetix_animations, lib/src/anims/*.dart),
 * by catalogue id with the English title. A topic material of kind `animation` names one of these
 * ids; the board plays it offline. A test checks this list against the Dart catalogue.
 */
export const ANIMATIONS: Readonly<Record<string, string>> = {
  photosynthesis: 'Photosynthesis',
  'circular-flow-of-income': 'Circular flow of income',
  'packet-switching': 'Packet switching',
  'cellular-respiration': 'Cellular respiration',
  'heart-circulation': 'Heart and circulation',
  breathing: 'Breathing',
  digestion: 'Digestion',
  'water-cycle': 'Water cycle',
  'rock-cycle': 'Rock cycle',
  'plate-tectonics-earthquake': 'Plate tectonics and earthquakes',
  volcano: 'Volcano',
  'day-night-seasons': 'Day, night and seasons',
  'moon-phases': 'Phases of the moon',
  eclipses: 'Eclipses',
  'nerve-impulse': 'Nerve impulse',
  mitosis: 'Mitosis',
  meiosis: 'Meiosis',
  'dna-replication': 'DNA replication',
  'protein-synthesis': 'Protein synthesis',
  'states-of-matter': 'States of matter',
  'atomic-structure': 'Atomic structure',
  electrolysis: 'Electrolysis',
  'electric-circuit': 'Electric circuit',
  'em-induction-generator': 'Electromagnetic induction (generator)',
  waves: 'Waves',
  refraction: 'Refraction',
  'osmosis-diffusion': 'Osmosis and diffusion',
  'nitrogen-cycle': 'Nitrogen cycle',
  'carbon-cycle': 'Carbon cycle',
};

export const isAnimation = (id: string) => Object.hasOwn(ANIMATIONS, id);
