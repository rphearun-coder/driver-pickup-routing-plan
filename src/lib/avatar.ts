// Contrast-checked against white text; the same name always gets the same colour.
const PALETTE = ['#1a9c4b', '#0e7490', '#2563eb', '#7c3aed', '#c2410c', '#be185d', '#4d7c0f', '#0f766e'];
const NEUTRAL = '#9aa3ad';

// Grapheme clusters, not code points — a Khmer letter with its vowel/subscript marks is one
// visible character, and slicing it in half would leave a broken glyph.
// Intl.Segmenter is newer than the project's TypeScript lib, so its shape is declared here.
interface GraphemeSegmenter {
  segment(text: string): Iterable<{ segment: string }>;
}
type SegmenterConstructor = new (locale?: string, options?: { granularity: 'grapheme' }) => GraphemeSegmenter;

function graphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (Segmenter) return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.segment);
  return Array.from(text);
}

const hasLetter = (word: string): boolean => /\p{L}/u.test(word);

/**
 * "Jalat Driver" -> "JD", "Vichet" -> "V", "Driver None Pickup - None" -> "DN".
 * Empty when the name has no letters at all (e.g. only a phone number).
 */
export function avatarInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(hasLetter);
  if (!words.length) return '';
  return words
    .slice(0, 2)
    .map((word) => graphemes(word)[0].toLocaleUpperCase())
    .join('');
}

export function avatarColor(name: string): string {
  const key = name.trim();
  if (!key) return NEUTRAL;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
