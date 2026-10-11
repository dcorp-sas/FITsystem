export { brand, APP_NAME, APP_VERSION } from '@fitsystem/config';

type ClassValue = string | number | null | undefined | false;
type ClassArray = (ClassValue | ClassArray)[];

/** Combina clases condicionalmente (clon minimalista de clsx). */
export function cn(...classes: ClassArray): string {
  const out: string[] = [];
  const flatten = (list: ClassArray) => {
    for (const item of list) {
      if (!item) continue;
      if (typeof item === 'string' || typeof item === 'number') out.push(String(item));
      else if (Array.isArray(item)) flatten(item);
    }
  };
  flatten(classes);
  return out.join(' ').trim();
}