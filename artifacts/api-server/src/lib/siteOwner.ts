/** The verified founding account. Ownership survives display-name/username changes. */
export const SITE_OWNER_USER_ID = 1;

export function isSiteOwner(user: { id: number; role: string } | null | undefined): boolean {
  return user?.id === SITE_OWNER_USER_ID && user.role === "admin";
}
