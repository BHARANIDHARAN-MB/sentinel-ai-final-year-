require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "auth-backend", db: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 8009;
const MONGODB_URI = process.env.MONGODB_URI;

async function start() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to auth-backend/.env - see .env.example");
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not set. Add it to auth-backend/.env - see .env.example");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  app.listen(PORT, () => {
    console.log(`Sentinel AI - Auth Backend running on port ${PORT}`);
  });
}

start();

module.exports = app;
