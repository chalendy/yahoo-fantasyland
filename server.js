import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import YahooFantasy from "yahoo-fantasy";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to frontend folder
const frontendPath = path.join(__dirname, "frontend");

// --- Yahoo OAuth Setup ---
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.warn("⚠ Missing CLIENT_ID, CLIENT_SECRET, or REDIRECT_URI in env");
}

const yf = new YahooFantasy(CLIENT_ID, CLIENT_SECRET);

// --- OAuth Routes ---
// Start OAuth
app.get("/auth/start", (req, res) => {
  const url = yf.authURL();
  res.redirect(url);
});

// OAuth callback
app.get("/auth/callback", async (req, res) => {
  try {
    const { code } = req.query;
    const tokens = await yf.authCallback(code);
    global.oauthTokens = tokens; // temporarily store in memory
    res.send("Yahoo authentication successful! You may now close this page.");
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("Authentication failed");
  }
});

// --- League API route ---
app.get("/league/:leagueKey/scoreboard", async (req, res) => {
  if (!global.oauthTokens) return res.status(401).send("Not authenticated. Please sign in first.");
  try {
    yf.setUserToken(global.oauthTokens.access_token);
    const data = await yf.league.scoreboard(req.params.leagueKey);
    res.json(data);
  } catch (err) {
    console.error("Error fetching scoreboard:", err);
    res.status(500).send("Error fetching scoreboard");
  }
});

// --- Serve Frontend ---
// Static frontend files
app.use(express.static(frontendPath));

// Catch-all for frontend SPA (after API/OAuth routes)
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
