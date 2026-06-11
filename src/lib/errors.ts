function getRawErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  if (error && typeof error === "object" && "error" in error && typeof error.error === "string") {
    return error.error;
  }
  return "";
}

export function getUserFriendlyErrorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  const rawMessage = getRawErrorMessage(error).trim();
  const normalizedMessage = rawMessage.toLowerCase();

  if (!rawMessage || normalizedMessage === "unknown error" || normalizedMessage === "error") {
    return fallback;
  }

  if (
    normalizedMessage.includes("not authorized for this scope") ||
    normalizedMessage.includes("not authorised for this scope") ||
    normalizedMessage.includes("insufficient scope") ||
    normalizedMessage.includes("unauthorized for this scope")
  ) {
    return "The saved GHL Private Integration token is missing the required scope. For email sending, update the sub-account Private Integration key to include conversations/message.write, then save it again in Account Activation.";
  }

  if (
    normalizedMessage.includes("jwt expired") ||
    normalizedMessage.includes("invalid bearer token") ||
    normalizedMessage.includes("not authenticated") ||
    normalizedMessage.includes("auth session missing")
  ) {
    return "Your session has expired. Please sign in again.";
  }

  if (
    normalizedMessage.includes("permission denied") ||
    normalizedMessage.includes("row-level security") ||
    normalizedMessage.includes("rls") ||
    normalizedMessage.includes("access denied") ||
    normalizedMessage.includes("admin access required")
  ) {
    return "You do not have permission to complete this action. Please refresh and try again, or contact an administrator.";
  }

  if (normalizedMessage.includes("duplicate key") || normalizedMessage.includes("already exists")) {
    return "This record already exists.";
  }

  if (
    normalizedMessage.includes("schema cache") ||
    normalizedMessage.includes("column") && normalizedMessage.includes("does not exist") ||
    normalizedMessage.includes("relation") && normalizedMessage.includes("does not exist")
  ) {
    return "The database is still updating. Please refresh and try again.";
  }

  if (normalizedMessage.includes("invalid input syntax for type uuid")) {
    return "One of the selected records is invalid. Please refresh and choose it again.";
  }

  if (
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("networkerror") ||
    normalizedMessage.includes("network error")
  ) {
    return "Network connection failed. Please check your connection and try again.";
  }

  if (
    normalizedMessage.includes("non-2xx") ||
    normalizedMessage.includes("404") ||
    normalizedMessage.includes("not found")
  ) {
    return "The connected service could not find the requested record. Please refresh and try again.";
  }

  if (normalizedMessage.includes("rate limit") || normalizedMessage.includes("too many")) {
    return "Too many requests were sent recently. Please wait a moment and try again.";
  }

  if (normalizedMessage.includes("private integration api key") || normalizedMessage.includes("location is not configured")) {
    return "This location is not fully configured. Please complete Account Activation in Settings.";
  }

  return rawMessage;
}
