import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();
app.use(cookieParser());

const PORT = process.env.PORT || 3000;

// -----------------------------
//  CONFIG
// -----------------------------
const CLIENT_ID = process.env.YH_CLIENT_ID;
const CLIENT_SECRET = process.env.YH_CLIENT_SECRET;

const REDIRECT_URI =
  process.env.YH_REDIRECT_URI || "https://yh-fantasyland.onrender.com/auth/callback";

const FRONTEND_SUCCESS =
  process.env.FRONTEND_SUCCESS || "https://yh-fantasyland.onrender.com/success";

const FRONTEND_ERROR =
  process.env.FRONTEND_ERROR || "https://yh-fantasyland.onrender.com/error";

// -----------------------------
//  ROUTES
// -----------------------------

// Start Yahoo OAuth
app.get("/auth/start", (req, res) => {
  const state = Math.random().toString(36).substring(7);
  res.cookie("oauth_state", state, { httpOnly: true });

  const url =
    `https://api.login.yahoo.com/oauth2/request_auth?` +
    `client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&language=en-us` +
    `&state=${state}`;

  console.log("Redirecting to Yahoo OAuth:", url);
  res.redirect(url);
});

// Yahoo redirects here after login
app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.cookies.oauth_state;

  if (!code) {
    console.log("❌ Missing authorization code");
    return res.redirect(FRONTEND_ERROR + "?msg=missing_code");
  }

  if (state !== storedState) {
    console.log("❌ Invalid OAuth state");
    return res.redirect(FRONTEND_ERROR + "?msg=invalid_state");
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body:
        `grant_type=authorization_code&code=${code}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
    });

    const tokenData = await tokenRes.json();
    console.log("Yahoo token response:", tokenData);

    if (!tokenData.access_token) {
      return res.redirect(FRONTEND_ERROR + "?msg=token_error");
    }

    // Pass tokens to frontend
    res.redirect(
      `${FRONTEND_SUCCESS}?access=${tokenData.access_token}&refresh=${tokenData.refresh_token}`
    );
  } catch (err) {
    console.error("Callback error:", err);
    res.redirect(FRONTEND_ERROR + "?msg=server_error");
  }
});

// Root test
app.get("/", (req, res) => {
  res.send("Yahoo Fantasy OAuth Server is running ✔");
});

// -----------------------------
//  START SERVER
// -----------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
