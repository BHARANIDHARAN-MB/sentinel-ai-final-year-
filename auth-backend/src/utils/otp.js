const crypto = require("crypto");

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_ATTEMPTS = 5; // prevents brute-forcing a 6-digit code

/**
 * Generates a random numeric OTP using crypto.randomInt (NOT Math.random -
 * that's not cryptographically secure and is guessable for something
 * gating account access).
 */
function generateOtp() {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return String(crypto.randomInt(min, max + 1));
}

function otpExpiryDate() {
  return new Date(Date.now() + OTP_TTL_MS);
}

/**
 * Validates a submitted OTP against the stored code/expiry/attempt-count.
 * Returns { valid: boolean, reason?: string } - reason is used for
 * specific, honest error messages (expired vs wrong vs too-many-attempts)
 * rather than a single generic "invalid" that hides what actually happened.
 */
function validateOtp({ storedCode, storedExpiresAt, attempts, submittedCode }) {
  if (!storedCode || !storedExpiresAt) {
    return { valid: false, reason: "no_otp_pending" };
  }
  if (attempts >= MAX_OTP_ATTEMPTS) {
    return { valid: false, reason: "too_many_attempts" };
  }
  if (new Date() > new Date(storedExpiresAt)) {
    return { valid: false, reason: "expired" };
  }
  // Constant-time comparison so response timing doesn't leak whether a
  // guess was "close" - matters for a 6-digit code that's otherwise
  // brute-forceable within the attempt limit.
  const a = Buffer.from(String(submittedCode));
  const b = Buffer.from(String(storedCode));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "wrong_code" };
  }
  return { valid: true };
}

module.exports = { generateOtp, otpExpiryDate, validateOtp, OTP_TTL_MS, MAX_OTP_ATTEMPTS };
