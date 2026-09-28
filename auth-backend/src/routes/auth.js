const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { generateOtp, otpExpiryDate, validateOtp } = require("../utils/otp");
const { sendOtpEmail } = require("../utils/email");
const { signToken, verifyToken } = require("../utils/jwt");

const router = express.Router();

const BCRYPT_ROUNDS = 12;

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body || {};

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({ email: email.toLowerCase(), passwordHash, name: name || "" });

  return res.status(201).json({ message: "Account created. You can now sign in.", email: user.email });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login  (step 1: password check -> sends OTP)
// ---------------------------------------------------------------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!isValidEmail(email) || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = await User.findOne({ email: email.toLowerCase() });

  // Deliberately identical response whether the account doesn't exist or
  // the password is wrong - distinguishing the two lets an attacker
  // enumerate which emails have accounts.
  const genericError = { error: "Invalid email or password" };
  if (!user) {
    return res.status(401).json(genericError);
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    return res.status(401).json(genericError);
  }

  const otp = generateOtp();
  user.otpCode = otp;
  user.otpExpiresAt = otpExpiryDate();
  user.otpAttempts = 0;
  await user.save();

  try {
    await sendOtpEmail(user.email, otp);
    return res.json({ message: "Password verified. Check your email for a 6-digit code.", email: user.email });
  } catch (e) {
    // Don't hard-block login just because email delivery failed (e.g. Resend's
    // shared test sender only delivers to the account owner's own address).
    // Log the real reason server-side, log the OTP as a visible dev fallback,
    // and tell the user honestly that email failed rather than pretending it
    // succeeded - this keeps local testing unblocked without silently lying
    // about what actually happened.
    console.error(`[auth] Email send failed for ${user.email}:`, e.message);
    console.warn(`[auth] DEV FALLBACK - OTP for ${user.email}: ${otp}`);
    return res.json({
      message: "Password verified, but the verification email could not be sent. Check the auth-backend console for your code (dev mode).",
      email: user.email,
      emailFailed: true,
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/verify-otp  (step 2: OTP check -> issues JWT)
// ---------------------------------------------------------------------------
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body || {};

  if (!isValidEmail(email) || typeof otp !== "string") {
    return res.status(400).json({ error: "Email and code are required" });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ error: "Invalid email or code" });
  }

  const result = validateOtp({
    storedCode: user.otpCode,
    storedExpiresAt: user.otpExpiresAt,
    attempts: user.otpAttempts,
    submittedCode: otp,
  });

  if (!result.valid) {
    if (result.reason === "wrong_code") {
      user.otpAttempts += 1;
      await user.save();
    }
    const messages = {
      no_otp_pending: "No verification code was requested. Log in again to get a new one.",
      too_many_attempts: "Too many incorrect attempts. Log in again to get a new code.",
      expired: "This code has expired. Log in again to get a new one.",
      wrong_code: "Incorrect code. Please try again.",
    };
    return res.status(401).json({ error: messages[result.reason] || "Invalid code" });
  }

  // OTP consumed - clear it so it can't be replayed
  user.otpCode = null;
  user.otpExpiresAt = null;
  user.otpAttempts = 0;
  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken({ sub: user._id.toString(), email: user.email });

  return res.json({ token, user: { email: user.email, name: user.name } });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me  (protected route example)
// ---------------------------------------------------------------------------
router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const payload = verifyToken(token);
    return res.json({ email: payload.email });
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

module.exports = router;
