process.env.JWT_SECRET = "test-secret-for-e2e";
// no RESEND_API_KEY set -> email falls back to console logging, which is fine for this test

const path = require("path");
const Module = require("module");

// Inject the mock model so routes/auth.js's `require("../models/User")`
// resolves to it instead of the real Mongoose model.
const realUserPath = require.resolve("../src/models/User");
const mockUser = require("./mockUserModel");
require.cache[realUserPath] = { id: realUserPath, filename: realUserPath, loaded: true, exports: mockUser };

const express = require("express");
const request = require("supertest");
const authRoutes = require("../src/routes/auth");

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

async function run() {
  console.log("=== Test 1: Register ===");
  let res = await request(app).post("/api/auth/register").send({
    email: "bharani@rgcet.ac.in",
    password: "SecurePass123",
  });
  console.log(res.status, res.body);
  if (res.status !== 201) throw new Error("Register should succeed");

  console.log("\n=== Test 2: Register duplicate email should fail ===");
  res = await request(app).post("/api/auth/register").send({
    email: "bharani@rgcet.ac.in",
    password: "AnotherPass123",
  });
  console.log(res.status, res.body);
  if (res.status !== 409) throw new Error("Duplicate register should 409");

  console.log("\n=== Test 3: Register with weak password should fail ===");
  res = await request(app).post("/api/auth/register").send({
    email: "someone@rgcet.ac.in",
    password: "short",
  });
  console.log(res.status, res.body);
  if (res.status !== 400) throw new Error("Weak password should 400");

  console.log("\n=== Test 4: Login with wrong password should fail ===");
  res = await request(app).post("/api/auth/login").send({
    email: "bharani@rgcet.ac.in",
    password: "WrongPassword",
  });
  console.log(res.status, res.body);
  if (res.status !== 401) throw new Error("Wrong password should 401");

  console.log("\n=== Test 5: Login with nonexistent email gives SAME error as wrong password ===");
  const res5a = await request(app).post("/api/auth/login").send({
    email: "doesnotexist@rgcet.ac.in",
    password: "whatever123",
  });
  console.log(res5a.status, res5a.body);
  if (res5a.status !== 401 || res5a.body.error !== res.body.error) {
    throw new Error("Nonexistent-email and wrong-password errors should be identical (no enumeration)");
  }

  console.log("\n=== Test 6: Login with correct password sends OTP ===");
  res = await request(app).post("/api/auth/login").send({
    email: "bharani@rgcet.ac.in",
    password: "SecurePass123",
  });
  console.log(res.status, res.body);
  if (res.status !== 200) throw new Error("Correct login should succeed");

  const storedUser = mockUser.__dump()["bharani@rgcet.ac.in"];
  const realOtp = storedUser.otpCode;
  console.log("   (captured real OTP from mock store for next tests:", realOtp, ")");

  console.log("\n=== Test 7: Verify with WRONG OTP should fail ===");
  res = await request(app).post("/api/auth/verify-otp").send({
    email: "bharani@rgcet.ac.in",
    otp: "000000",
  });
  console.log(res.status, res.body);
  if (res.status !== 401) throw new Error("Wrong OTP should 401");

  console.log("\n=== Test 8: Verify with CORRECT OTP should succeed and return a JWT ===");
  res = await request(app).post("/api/auth/verify-otp").send({
    email: "bharani@rgcet.ac.in",
    otp: realOtp,
  });
  console.log(res.status, res.body);
  if (res.status !== 200 || !res.body.token) throw new Error("Correct OTP should return a token");

  console.log("\n=== Test 9: Reusing the SAME OTP again should fail (single-use) ===");
  res = await request(app).post("/api/auth/verify-otp").send({
    email: "bharani@rgcet.ac.in",
    otp: realOtp,
  });
  console.log(res.status, res.body);
  if (res.status !== 401) throw new Error("Reused OTP should be rejected - it was already consumed");

  console.log("\n=== Test 10: /me with the issued token works ===");
  const token = (await (async () => {
    // re-login + re-verify to get a fresh token since we consumed the last one
    await request(app).post("/api/auth/login").send({ email: "bharani@rgcet.ac.in", password: "SecurePass123" });
    const freshOtp = mockUser.__dump()["bharani@rgcet.ac.in"].otpCode;
    const verifyRes = await request(app).post("/api/auth/verify-otp").send({ email: "bharani@rgcet.ac.in", otp: freshOtp });
    return verifyRes.body.token;
  })());
  res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
  console.log(res.status, res.body);
  if (res.status !== 200 || res.body.email !== "bharani@rgcet.ac.in") throw new Error("/me should return the authenticated user");

  console.log("\n=== Test 11: /me with NO token should fail ===");
  res = await request(app).get("/api/auth/me");
  console.log(res.status, res.body);
  if (res.status !== 401) throw new Error("/me with no token should 401");

  console.log("\n\n✅ ALL TESTS PASSED");
}

run().catch((e) => {
  console.error("\n❌ TEST FAILED:", e.message);
  process.exit(1);
});
