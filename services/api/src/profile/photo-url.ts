/** The path the apps load a user's photo from (with their token); the version busts caches. */
export function photoUrl(u: { id: string; photoKey: string | null; photoUpdatedAt: Date | null }): string | null {
  return u.photoKey ? `/v1/users/${u.id}/photo?v=${u.photoUpdatedAt?.getTime() ?? 0}` : null;
}
