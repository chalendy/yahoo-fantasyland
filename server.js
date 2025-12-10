import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Frontend path
const frontendPath = path.join(__dirname, "backend", "public", "frontend");

// Env variables
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// Store tokens in memory (you can switch to DB later)
let oauthTokens = null;

// -----------------------------
// Start Yahoo OAuth Login
// -----------------------------
app.get("/auth/start", (req, res) => {
  const yahooOAuthURL =
    `https://api.login.yahoo.com/oauth2/request_auth?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code&scope=fspt-w`;

  res.redirect(yahooOAuthURL);
});

// -----------------------------
// OAuth Callback (Yahoo → You)
// -----------------------------
app.get("/auth/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("Missing authorization code.");

    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", REDIRECT_URI);
    params.append("client_id", CLIENT_ID);
    params.append("client_secret", CLIENT_SECRET);

    const tokenResponse = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization":
          "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      },
      body: params.toString(),
    });

    const tokenData = await tokenResponse.json();
    oauthTokens = tokenData;

    if (tokenData.error) {
      console.error("Yahoo OAuth Error:", tokenData);
      return res.status(500).send("Failed to obtain access token.");
    }

    res.send(`
      <h2>Yahoo Login Successful!</h2>
      <p>You can close this tab and return to the app.</p>
    `);
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("OAuth callback failed.");
  }
});

// -----------------------------
// League Scoreboard API
// -----------------------------
app.get("/league/:leagueKey/scoreboard", async (req, res) => {
  if (!oauthTokens) {
    return res.status(401).send("Not logged in. Please click Sign In.");
  }

  const { leagueKey } = req.params;

  try {
    const apiRes = await fetch(
      `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/scoreboard?format=json`,
      {
        headers: {
          Authorization: `Bearer ${oauthTokens.access_token}`,
        },
      }
    );

    const data = await apiRes.json();
    res.json(data);
  } catch (err) {
    console.error("Scoreboard API error:", err);
    res.status(500).send("Unable to fetch scoreboard.");
  }
});

// -----------------------------
// Serve Frontend
// -----------------------------
app.use(express.static(frontendPath));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// -----------------------------
// Start server
// -----------------------------
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
