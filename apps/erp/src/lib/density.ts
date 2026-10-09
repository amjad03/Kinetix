// Display density (PRD section 79): a school desk is roomy, a college or university desk shows more rows per screen.
export const DENSITY_COOKIE = 'kx_density';
export type Density = 'comfortable' | 'compact';

export const isDensity = (v: unknown): v is Density => v === 'comfortable' || v === 'compact';

/** The default for an institution: schools comfortable, colleges and universities compact; a person's own choice (the cookie) wins. */
export function densityFor(academicModel: string | undefined, chosen: string | undefined): Density {
  if (isDensity(chosen)) return chosen;
  return academicModel === 'school' || academicModel === undefined ? 'comfortable' : 'compact';
}
