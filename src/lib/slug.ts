import { customAlphabet } from "nanoid";

// Unambiguous alphabet: no 0/O, 1/l/I.
const nano = customAlphabet(
  "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ",
  10
);

export function generateSlug() {
  return nano();
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
