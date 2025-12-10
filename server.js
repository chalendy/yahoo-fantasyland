import express from "express";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ================================
//   STATIC FILES (THE IMPORTANT PART)
// ================================

// Serve frontend folder (index + css + js)
app.use(express.static(path.join(__dirname, "backend/public/frontend")));

// Serve index.html on root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "backend/public/frontend/index.html"));
});

// =================================
//   YAHOO OAUTH START
// =================================

app.get("/auth/start", (req, res) => {
  const redirectUri = encodeURIComponent(process.env.YAHOO_REDIRECT_URI);
  const clientId = process.env.YAHOO_CLIENT_ID;

  const authURL =
    `https://api.login.yahoo.com/oauth2/request_auth` +
    `?client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&language=en-us`;

  res.redirect(authURL);
});

// =================================
//   YAHOO OAUTH CALLBACK
// =================================

let yahooAccessToken = null;

app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing authorization code.");

  try {
    // Exchange code for token
    const tokenRes = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
          ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.YAHOO_REDIRECT_URI,
      }),
    });

    const tokenJson = await tokenRes.json();
    yahooAccessToken = tokenJson.access_token;

    res.redirect("/");
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("OAuth Error");
  }
});

// =================================
//   SCOREBOARD API PROXY
// =================================

app.get("/api/scoreboard", async (req, res) => {
  if (!yahooAccessToken) {
    return res.status(401).json({ error: "Not authenticated with Yahoo." });
  }

  const leagueKey = "nfl.l.38076";
  const url =
    `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/scoreboard?format=json`;

  try {
    const scoreRes = await fetch(url, {
      headers: { Authorization: `Bearer ${yahooAccessToken}` },
    });

    const json = await scoreRes.json();
    res.json(json);
  } catch (err) {
    console.error("Scoreboard API error:", err);
    res.status(500).json({ error: "Failed to fetch scoreboard" });
  }
});

// =================================
//   START SERVER
// =================================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
