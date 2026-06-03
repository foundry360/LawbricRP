export function getPhoneDigits(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\D/g, "");
}

function getDomesticPhoneDigits(value: unknown) {
  const digits = getPhoneDigits(value);
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function formatPhoneNumber(value: unknown, fallback = "N/A") {
  if (typeof value !== "string" && typeof value !== "number") return fallback;

  const rawValue = String(value).trim();
  if (!rawValue) return fallback;
  const digits = getDomesticPhoneDigits(value);
  if (digits.length !== 10) return rawValue || fallback;

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function formatPhoneInput(value: unknown) {
  const digits = getDomesticPhoneDigits(value).slice(0, 10);

  if (digits.length === 0) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
