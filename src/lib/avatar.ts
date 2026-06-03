type AvatarIdentity = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
};

function getInitialToken(value?: string | null) {
  return value?.trim().charAt(0) ?? "";
}

function isPlaceholderName(value?: string | null) {
  const normalizedValue = value?.trim().toLowerCase();
  return !normalizedValue || normalizedValue === "unknown" || normalizedValue === "n/a";
}

function getNameParts(identity: AvatarIdentity) {
  if (identity.firstName || identity.lastName) {
    return [identity.firstName, identity.lastName].filter(Boolean) as string[];
  }

  const fullName = identity.fullName?.trim();
  if (fullName && !isPlaceholderName(fullName)) {
    return fullName.split(/\s+/).filter(Boolean);
  }

  const emailName = identity.email?.split("@")[0];
  if (emailName) {
    return emailName.split(/[._-]+/).filter(Boolean);
  }

  return [];
}

export function getAvatarInitials(identity: AvatarIdentity, fallback = "LB") {
  const parts = getNameParts(identity);
  const initials =
    parts.length > 1
      ? `${getInitialToken(parts[0])}${getInitialToken(parts[parts.length - 1])}`
      : parts[0]?.slice(0, 2) ?? "";

  return initials.trim().toUpperCase() || fallback;
}
