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
//  Small fetch helper (Node 18+ has global fetch)
// -----------------------------
async function doFetch(url, options = {}) {
  if (typeof fetch === "function") return fetch(url, options);
  const mod = await import("node-fetch");
  return mod.default(url, options);
}

async function yahooGetJson(url) {
  if (!accessToken) {
    const err = new Error("Not authenticated");
    err.status = 401;
    throw err;
  }

  const apiRes = await doFetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const bodyText = await apiRes.text();
  if (!apiRes.ok) {
    const err = new Error("Yahoo API error");
    err.status = 500;
    err.body = bodyText;
    throw err;
  }

  return JSON.parse(bodyText);
}

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
    const tokenResponse = await doFetch("https://api.login.yahoo.com/oauth2/get_token", {
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
    const url =
      week && week.trim()
        ? `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/scoreboard;week=${encodeURIComponent(
            week
          )}?format=json`
        : `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/scoreboard?format=json`;

    const apiRes = await doFetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) {
      return res.status(500).json({ error: "Yahoo API error", body: bodyText });
    }

    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Scoreboard error:", err);
    res.status(500).json({ error: "Failed to fetch scoreboard" });
  }
});

// -----------------------------
//  STANDINGS RAW
// -----------------------------
app.get("/standings-raw", async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: "Not authenticated." });

  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/standings?format=json`;
    const apiRes = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) return res.status(500).json({ error: "Yahoo API error", body: bodyText });

    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Standings fetch error:", err);
    res.status(500).json({ error: "Failed to fetch league standings" });
  }
});

// -----------------------------
//  SETTINGS RAW
// -----------------------------
app.get("/settings-raw", async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: "Not authenticated." });

  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/settings?format=json`;
    const apiRes = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) return res.status(500).json({ error: "Yahoo API error", body: bodyText });

    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Settings fetch error:", err);
    res.status(500).json({ error: "Failed to fetch league settings" });
  }
});

// -----------------------------
//  DRAFT RESULTS RAW
// -----------------------------
app.get("/draftresults-raw", async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: "Not authenticated." });

  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`;
    const apiRes = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) return res.status(500).json({ error: "Yahoo API error", body: bodyText });

    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Draftresults fetch error:", err);
    res.status(500).json({ error: "Failed to fetch draft results" });
  }
});

// -----------------------------
//  ROSTERS RAW (teams + players)
// -----------------------------
app.get("/rosters-raw", async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: "Not authenticated." });

  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster?format=json`;
    const apiRes = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) return res.status(500).json({ error: "Yahoo API error", body: bodyText });

    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Rosters fetch error:", err);
    res.status(500).json({ error: "Failed to fetch rosters" });
  }
});

// -----------------------------
//  DRAFTBOARD DATA (normalized)
// -----------------------------
app.get("/draftboard-data", async (req, res) => {
  try {
    const draftJson = await yahooGetJson(
      `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`
    );

    const rosterJson = await yahooGetJson(
      `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster?format=json`
    );

    // ---- Extract team meta + player lookup from rosters ----
    const teamsBlock = rosterJson?.fantasy_content?.league?.[1]?.teams;
    const teams = {}; // team_key -> { name, logo_url }
    const playerByKey = new Map(); // player_key -> { name, pos, team }

    if (teamsBlock) {
      for (const k of Object.keys(teamsBlock)) {
        if (k === "count") continue;
        const teamArr = teamsBlock[k]?.team;
        if (!Array.isArray(teamArr) || !teamArr.length) continue;

        const teamMetaArr = teamArr[0]; // array of objects (team_key, name, logos, etc.)
        const rosterObj = teamArr[1]?.roster;

        const teamKey = teamMetaArr?.find?.((o) => o?.team_key)?.team_key;
        const teamName = teamMetaArr?.find?.((o) => o?.name)?.name;
        const logoUrl =
          teamMetaArr
            ?.find?.((o) => o?.team_logos)
            ?.team_logos?.[0]?.team_logo?.url || "";

        if (teamKey) {
          teams[teamKey] = { name: teamName || teamKey, logo_url: logoUrl || "" };
        }

        // players
        const playersBlock = rosterObj?.["0"]?.players;
        if (playersBlock) {
          for (const pk of Object.keys(playersBlock)) {
            const pArr = playersBlock[pk]?.player;
            const pMetaArr = pArr?.[0];
            if (!Array.isArray(pMetaArr)) continue;

            const player_key = pMetaArr.find((o) => o?.player_key)?.player_key;
            const fullName = pMetaArr.find((o) => o?.name)?.name?.full;
            const pos = pMetaArr.find((o) => o?.display_position)?.display_position;
            const teamAbbr = pMetaArr.find((o) => o?.editorial_team_abbr)?.editorial_team_abbr;

            if (player_key) {
              playerByKey.set(player_key, {
                name: fullName || player_key,
                pos: pos || "",
                team: teamAbbr || "",
              });
            }
          }
        }
      }
    }

    // ---- Extract picks from draft results ----
    const draftResultsBlock = draftJson?.fantasy_content?.league?.[1]?.draft_results;
    const picks = [];
    let maxRound = 0;

    if (draftResultsBlock) {
      for (const k of Object.keys(draftResultsBlock)) {
        if (k === "count") continue;
        const dr = draftResultsBlock[k]?.draft_result;
        if (!dr) continue;

        const round = Number(dr.round);
        const pick = Number(dr.pick);
        if (round > maxRound) maxRound = round;

        const team_key = dr.team_key;
        const player_key = dr.player_key;

        const mapped = playerByKey.get(player_key);
        const isKept = !mapped; // your rule: unmapped => likely keeper/kept

        picks.push({
          pick,
          round,
          team_key,
          player_key,
          player_name: mapped?.name || player_key,
          player_pos: mapped?.pos || "",
          player_team: mapped?.team || "",
          is_kept: isKept,
        });
      }
    }

    // Draft order = round 1 team order by pick
    const round1 = picks.filter((p) => p.round === 1).sort((a, b) => a.pick - b.pick);
    const draftOrder = round1.map((p) => p.team_key);

    // Group picks by round
    const rounds = [];
    for (let r = 1; r <= maxRound; r++) {
      const rPicks = picks.filter((p) => p.round === r).sort((a, b) => a.pick - b.pick);
      rounds.push({ round: r, picks: rPicks });
    }

    res.json({
      meta: { totalPicks: picks.length, maxRound },
      draftOrder,
      rounds,
      teams,
    });
  } catch (err) {
    const status = err.status || 500;
    console.error("draftboard-data error:", err);
    res.status(status).json({
      error: status === 401 ? "Not authenticated" : "Failed to build draft board data",
      body: err.body,
    });
  }
});

// -----------------------------
//  FRONTEND STATIC FILES
// -----------------------------
const frontendPath = path.join(__dirname, "backend", "public", "frontend");
app.use(express.static(frontendPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// -----------------------------
//  START SERVER
// -----------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
