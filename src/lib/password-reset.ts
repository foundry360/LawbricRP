export function isPasswordResetCooldown(message?: string | null) {
  if (!message) return false;

  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("security purposes") ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("too many") ||
    /after\s+\d+\s+seconds?/.test(normalizedMessage)
  );
}

export function getPasswordResetSkippedMessage(message?: string | null) {
  if (!message) return "Password reset email was not sent.";

  const secondsMatch = message.match(/after\s+(\d+)\s+seconds?/i);
  if (secondsMatch?.[1]) {
    return `A reset email was requested recently. Please wait ${secondsMatch[1]} seconds before sending another one.`;
  }

  if (isPasswordResetCooldown(message)) {
    return "A reset email was requested recently. Please wait a minute before sending another one.";
  }

  return message;
}
