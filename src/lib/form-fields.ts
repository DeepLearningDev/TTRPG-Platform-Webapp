export function readTextField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function readOptionalTextField(formData: FormData, key: string) {
  const value = readTextField(formData, key);
  return value.length > 0 ? value : null;
}

export function readNumberField(formData: FormData, key: string, fallback = 0) {
  const value = Number(formData.get(key));

  return Number.isFinite(value) ? value : fallback;
}

export function readOptionalNumberField(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();

  if (!raw) {
    return null;
  }

  const value = Number(raw);

  return Number.isFinite(value) ? value : null;
}

export function readBooleanField(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim().toLowerCase();

  return value === "true" || value === "on" || value === "1" || value === "yes";
}
