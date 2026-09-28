// TEST-ONLY harness - runs the real auth routes with the mock in-memory
// model swapped in, so the frontend can be tested against real HTTP calls
// without needing an actual MongoDB connection. Not part of the shipped
// auth-backend; production uses src/server.js with real Mongoose.

process.env.JWT_SECRET = "test-secret-for-integration";

const realUserPath = require.resolve("../src/models/User");
const mockUser = require("./mockUserModel");
require.cache[realUserPath] = { id: realUserPath, filename: realUserPath, loaded: true, exports: mockUser };

const express = require("express");
const cors = require("cors");
const authRoutes = require("../src/routes/auth");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);

app.get("/health", (req, res) => res.json({ status: "ok", service: "auth-backend-test" }));

// TEST-ONLY: exposes the last OTP generated for an email, since there's no
// real inbox to check in this environment. Never exists in production.
app.get("/test/last-otp/:email", (req, res) => {
  const record = mockUser.__dump()[req.params.email.toLowerCase()];
  res.json({ otp: record?.otpCode || null });
});

const PORT = 8009;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Test auth server (mock DB) running on port ${PORT}`);
});
