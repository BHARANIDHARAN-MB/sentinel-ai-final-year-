const jwt = require("jsonwebtoken");

const JWT_EXPIRES_IN = "7d";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set - refusing to sign tokens with no secret");
  }
  return secret;
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

module.exports = { signToken, verifyToken };
