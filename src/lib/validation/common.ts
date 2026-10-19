import { z } from "zod";

// Characters that can hide or disguise text shown to other users: C0/C1 control characters
// (except tab/newline), zero-width characters and bidi overrides ("trojan source" tricks).
// Built from code points so this source file itself stays plain ASCII.
const UNSAFE_RANGES: [number, number][] = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];
const UNSAFE_CHARS = new RegExp(
  `[${UNSAFE_RANGES.map(([a, b]) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`).join("")}]`,
  "gu",
);

export function cleanText(value: string) {
  return value.normalize("NFC").replace(UNSAFE_CHARS, "").trim();
}

/** Required single-line text: normalised, unsafe characters removed, length-checked. */
export function text(label: string, { min = 1, max }: { min?: number; max: number }) {
  return z
    .string({ message: `${label} is required` })
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(min, min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
        .max(max, `${label} must be at most ${max} characters`)
        .refine((v) => !/[\r\n]/.test(v), `${label} must be a single line`),
    );
}

/** Optional text: empty string becomes undefined. */
export function optionalText(label: string, max: number, { multiline = false } = {}) {
  return z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : cleanText(v)))
    .pipe(
      z
        .string()
        .max(max, `${label} must be at most ${max} characters`)
        .refine((v) => multiline || !/[\r\n]/.test(v), `${label} must be a single line`)
        .optional(),
    )
    .transform((v) => (v ? v : undefined));
}
