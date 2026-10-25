/** Helpers for reading FormData in server actions without trusting input. */

export function str(form: FormData, key: string, fallback = ""): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : fallback;
}

export function optional(form: FormData, key: string): string | undefined {
  const value = str(form, key);
  return value.length > 0 ? value : undefined;
}

export function number(form: FormData, key: string, fallback = 0): number {
  const parsed = Number.parseFloat(str(form, key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function int(form: FormData, key: string, fallback = 0): number {
  const parsed = Number.parseInt(str(form, key), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function bool(form: FormData, key: string): boolean {
  const value = form.get(key);
  return value === "on" || value === "true" || value === "1";
}

/** Accepts repeated fields or a comma-separated list. */
export function list(form: FormData, key: string, limit = 20): string[] {
  const values = form.getAll(key).filter((value): value is string => typeof value === "string");
  const flat = values.flatMap((value) => value.split(","));
  return [...new Set(flat.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

export function links(form: FormData, prefix: string, count = 5): { label: string; url: string }[] {
  const result: { label: string; url: string }[] = [];
  for (let index = 0; index < count; index += 1) {
    const url = str(form, `${prefix}Url${index}`);
    if (!url) continue;
    result.push({ label: str(form, `${prefix}Label${index}`, "Link"), url });
  }
  return result;
}

/**
 * Read a file part from FormData.
 *
 * `entry instanceof File` throws `ReferenceError: File is not defined` on Node 18, which the
 * engines field still allows, so detection goes through `Blob` (global since Node 18) and
 * returns null for anything that is not a non-empty upload.
 */
export function file(form: FormData, key: string): (Blob & { name?: string }) | null {
  const entry = form.get(key);
  if (!entry || typeof entry === "string") return null;
  if (!(entry instanceof Blob) || entry.size === 0) return null;
  return entry;
}

/** Only allow http(s) URLs from user input. */
export function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
