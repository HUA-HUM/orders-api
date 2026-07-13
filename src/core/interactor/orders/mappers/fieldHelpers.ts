export function trimOrNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function toStringOrNull(value?: string | number | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

export function joinName(firstName?: string, lastName?: string): string | null {
  const full = [firstName, lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  return full || null;
}

export function joinParts(
  ...parts: (string | number | undefined | null)[]
): string | null {
  const full = parts
    .map((part) =>
      part === undefined || part === null ? '' : String(part).trim(),
    )
    .filter(Boolean)
    .join(' ')
    .trim();

  return full || null;
}

export function toIsoOrNull(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function formatDateYmd(value?: string | null): string {
  const date = toDate(value);
  if (!date) {
    return '';
  }
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}`;
}

export function formatDateDmy(value?: string | null): string {
  const date = toDate(value);
  if (!date) {
    return '';
  }
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

function toDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function normalizePhone(value?: string | number | null): string | null {
  const text = toStringOrNull(value);
  if (!text || text === '00') {
    return null;
  }
  return text;
}

export function mergeDefined<T extends object>(base: T, patch: Partial<T>): T {
  const result = { ...base };

  for (const key of Object.keys(patch) as (keyof T)[]) {
    const value = patch[key];
    if (value !== null && value !== undefined) {
      result[key] = value as T[keyof T];
    }
  }

  return result;
}
