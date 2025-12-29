import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- ES Module Path Fix ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- ENV ---
const CLIENT_ID = process.env.YAHOO_CLIENT_ID;
const CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET;
const REDIRECT_URI = "https://yh-fantasyland.onrender.com/auth/callback";

// League Info
const LEAGUE_ID = "38076";
const GAME_KEY = "nfl";
const LEAGUE_KEY = `${GAME_KEY}.l.${LEAGUE_ID}`;

// Token storage (simple)
let accessToken = null;

// -----------------------------
//  OAUTH START
// -----------------------------
app.get("/auth/start", (req, res) => {
  const authURL = new URL("https://api.login.yahoo.com/oauth2/request_auth");
  authURL.searchParams.set("client_id", CLIENT_ID);
  authURL.searchParams.set("redirect_uri", REDIRECT_URI);
  authURL.searchParams.set("response_type", "code");
  authURL.searchParams.set("language", "en-us");
  res.redirect(authURL.toString());
});

// -----------------------------
//  OAUTH CALLBACK
// -----------------------------
app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send("Missing authorization code.");
  }

  try {
    const tokenResponse = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Token error:", tokenData);
      return res.status(400).send("Token error: " + JSON.stringify(tokenData));
    }

    accessToken = tokenData.access_token;
    console.log("OAuth Success: token received.");
    res.redirect("/");
  } catch (err) {
    console.error("OAuth callback failure:", err);
    res.status(500).send("OAuth callback failure");
  }
});

// -----------------------------
//  SCOREBOARD (supports ?week=)
// -----------------------------
app.get("/scoreboard", async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: "Not authenticated. Please click Sign In first." });
  }

  try {
    const week = req.query.week ? String(req.query.week) : null;

    // Yahoo uses semicolon params: scoreboard;week=17
    const yahooPath = week
      ? `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/scoreboard;week=${encodeURIComponent(
          week
        )}?format=json`
      : `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/scoreboard?format=json`;

    const apiRes = await fetch(yahooPath, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) {
      console.error("Yahoo scoreboard error:", apiRes.status, bodyText);
      return res.status(500).json({ error: "Yahoo API error", status: apiRes.status, body: bodyText });
    }

    res.json(JSON.parse(bodyText));
  } catch (err) {
    console.error("Scoreboard error:", err);
    res.status(500).json({ error: "Failed to fetch scoreboard" });
  }
});

// -----------------------------
//  STANDINGS RAW
// -----------------------------
app.get("/standings-raw", async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/standings?format=json`;

    const apiRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) {
      console.error("Yahoo standings error:", apiRes.status, bodyText);
      return res.status(500).json({ error: "Yahoo API error", status: apiRes.status, body: bodyText });
    }

    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Standings fetch error:", err);
    res.status(500).json({ error: "Failed to fetch league standings" });
  }
});

// -----------------------------
//  LEAGUE SETTINGS (RAW)
// -----------------------------
app.get("/settings-raw", async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/settings?format=json`;

    const apiRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const bodyText = await apiRes.text();

    if (!apiRes.ok) {
      console.error("Yahoo settings error:", apiRes.status, bodyText);
      return res
        .status(500)
        .json({ error: "Yahoo API error", status: apiRes.status, body: bodyText });
    }

    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Settings fetch error:", err);
    res.status(500).json({ error: "Failed to fetch league settings" });
  }
});


// -----------------------------
//  FRONTEND STATIC FILES
// -----------------------------
const frontendPath = path.join(__dirname, "backend", "public", "frontend");
app.use(express.static(frontendPath));

// IMPORTANT: keep API routes above this catch-all
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// -----------------------------
//  START SERVER
// -----------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
