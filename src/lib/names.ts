export function isEmailLike(value?: string | null) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function formatNamePart(part: string) {
  if (!part) return part;
  return part
    .split(/([-'\u2019])/)
    .map((segment) => {
      if (!segment || /^[-'\u2019]$/.test(segment)) return segment;
      return `${segment.charAt(0).toUpperCase()}${segment.slice(1).toLowerCase()}`;
    })
    .join("");
}

export function formatPersonName(value?: string | null) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name || isEmailLike(name)) return name;
  return name.split(" ").map(formatNamePart).join(" ");
}

export function formatFullName(firstName?: string | null, lastName?: string | null) {
  return formatPersonName([firstName, lastName].map((value) => String(value || "").trim()).filter(Boolean).join(" "));
}
