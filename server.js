import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Frontend folder
const frontendPath = path.join(__dirname, "backend", "public", "frontend");

// --- Environment variables ---
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.warn("⚠ Missing CLIENT_ID, CLIENT_SECRET, or REDIRECT_URI in env");
}

// Store OAuth token in memory (for demo purposes)
let oauthTokens = null;

// --- OAuth Start ---
app.get("/auth/start", (req, res) => {
  const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=code&scope=fspt-w`;
  res.redirect(authUrl);
});

// --- OAuth Callback ---
app.get("/auth/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("Missing code");

    // Exchange code for access token
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", REDIRECT_URI);
    params.append("client_id", CLIENT_ID);
    params.append("client_secret", CLIENT_SECRET);

    const tokenRes = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      },
      body: params.toString(),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("Token error:", tokenData);
      return res.status(500).send("Failed to get access token");
    }

    oauthTokens = tokenData; // Store in memory

    res.send(
      "Yahoo authentication successful! You may now close this page and return to the app."
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("Authentication failed");
  }
});

// --- League Scoreboard API ---
app.get("/league/:leagueKey/scoreboard", async (req, res) => {
  if (!oauthTokens) return res.status(401).send("Not authenticated. Please sign in first.");

  try {
    const { leagueKey } = req.params;

    // Example: fetch league scoreboard using Yahoo Fantasy API
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
    console.error("Error fetching scoreboard:", err);
    res.status(500).send("Error fetching scoreboard");
  }
});

// --- Serve Frontend ---
app.use(express.static(frontendPath));

// Catch-all for SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
