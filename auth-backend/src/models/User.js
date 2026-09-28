const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: "" },

    otpCode: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },

    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
