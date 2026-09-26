/** Bound decoded pixels as well as upload bytes before preserving masters. */
export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_IMAGE_SIDE = 6_000;

export function isSupportedMaster(width: number | undefined, height: number | undefined): boolean {
  return !!width && !!height && width <= MAX_IMAGE_SIDE && height <= MAX_IMAGE_SIDE &&
    width * height <= MAX_IMAGE_PIXELS;
}