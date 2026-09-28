# Sentinel AI — Auth Backend

Real authentication: email + password, then a 6-digit OTP emailed to the
user, then a JWT. Replaces the frontend's earlier demo login (which
accepted any credentials).

## Why two steps (password, then OTP)

This matches the flow from your Nexus AI project and your original
Sentinel AI design doc — password proves you know the secret, OTP proves
you also control the email account right now. Either alone is weaker:
password-only is vulnerable to credential stuffing; OTP-only (magic link)
has no secret at all.

## Setup

```powershell
cd auth-backend
npm install
copy .env.example .env
```

Edit `.env`:
- `MONGODB_URI` — your MongoDB Atlas connection string (same account as
  Nexus AI works fine, just use a different database name)
- `JWT_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `GMAIL_USER` + `GMAIL_APP_PASSWORD` — sends OTPs through your own Gmail
  account. Works with **any** recipient address, no domain needed — the
  practical choice if you don't own a domain. Requires enabling 2-Step
  Verification on your Google account, then generating an App Password
  at myaccount.google.com/apppasswords. See `.env.example` for the full
  walkthrough.
- `RESEND_API_KEY` — alternative to Gmail. From resend.com. Their shared
  `onboarding@resend.dev` sender can only deliver to the email address
  that owns your Resend account — real arbitrary-recipient delivery
  needs a verified domain.
- **Without either configured**, OTPs print to the
  server console instead of emailing** — fine for local dev/demo, never
  acceptable for anything real.

```powershell
npm start
```

Runs on **port 8009**.

## API

```
POST /api/auth/register     { email, password }        -> creates account
POST /api/auth/login        { email, password }         -> verifies password, emails OTP
POST /api/auth/verify-otp   { email, otp }               -> verifies OTP, returns { token, user }
GET  /api/auth/me           (Authorization: Bearer <token>) -> returns the authenticated user
```

## Security properties (all covered by the test suite)

- Passwords hashed with bcrypt (12 rounds), never stored in plaintext
- OTPs generated with `crypto.randomInt` (cryptographically random, not
  `Math.random`, which is predictable)
- OTPs expire after 5 minutes and are single-use — verifying consumes
  them, so replaying a captured OTP request doesn't work
- OTP comparison uses `crypto.timingSafeEqual`, so response timing can't
  leak how close a guess was
- Max 5 wrong OTP attempts before the code is locked out, forcing a fresh
  login rather than allowing unlimited brute-force guesses at a 6-digit
  space
- Login failure (wrong password) and login failure (no such account)
  return the **identical** error message and status code, so a caller
  can't enumerate which emails have accounts by checking error type

## Testing

```powershell
npm test
```

Runs `test/auth.test.js` — 11 end-to-end scenarios against an in-memory
mock of the User model (no real MongoDB needed for the test itself),
covering registration, duplicate accounts, weak passwords, wrong
password, nonexistent email, correct login → OTP issuance, wrong OTP,
correct OTP → token issuance, OTP replay rejection, and the protected
`/me` route with and without a token.

`test/mockUserModel.js` and `test/testServer.js` are test-only scaffolding
— they're never loaded by `src/server.js`, which always uses the real
Mongoose model.

## Wiring into the frontend

Already done — `frontend/src/components/LoginModal.jsx` calls this
service directly (`api.js` has `register`, `login`, `verifyOtp`) with a
two-step form: password first, then a 6-digit code input. A "Don't have
an account? Create one" toggle handles registration in the same modal.

## Files

| File | Purpose |
|---|---|
| `src/server.js` | Express app entry point (real MongoDB, real Resend) |
| `src/routes/auth.js` | The four endpoints above |
| `src/models/User.js` | Mongoose schema |
| `src/utils/otp.js` | OTP generation/validation - pure functions, no DB |
| `src/utils/jwt.js` | Token signing/verification |
| `src/utils/email.js` | Resend integration with console fallback |
| `test/auth.test.js` | Full route test suite |
| `test/mockUserModel.js` | In-memory User model for testing |
| `test/testServer.js` | Test-only server (mocked DB) for manual/integration testing |
