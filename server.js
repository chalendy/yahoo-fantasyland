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

function requireAuth(req, res) {
  if (!accessToken) {
    res.status(401).json({ error: "Not authenticated. Please click Sign In first." });
    return false;
  }
  return true;
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

  if (!code) return res.status(400).send("Missing authorization code.");

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
  if (!requireAuth(req, res)) return;

  try {
    const week = req.query.week ? String(req.query.week) : null;
    const url =
      week && week.trim()
        ? `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/scoreboard;week=${encodeURIComponent(
            week
          )}?format=json`
        : `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/scoreboard?format=json`;

    const apiRes = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) return res.status(500).json({ error: "Yahoo API error", body: bodyText });

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
  if (!requireAuth(req, res)) return;

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
  if (!requireAuth(req, res)) return;

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
  if (!requireAuth(req, res)) return;

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
//  TEAMS RAW (names + logos)
// -----------------------------
app.get("/teams-raw", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams?format=json`;
    const apiRes = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) return res.status(500).json({ error: "Yahoo API error", body: bodyText });

    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Teams fetch error:", err);
    res.status(500).json({ error: "Failed to fetch teams" });
  }
});

// -----------------------------
//  DRAFT BOARD DATA (frontend-friendly)
// -----------------------------
function extractTeamKey(teamObj) {
  // team comes as an array: [ [metadata...], { roster? } ]
  // metadata array contains objects like { team_key: "..." }, { name: "..." }, { team_logos: [...] } etc.
  const metaArr = Array.isArray(teamObj?.[0]) ? teamObj[0] : [];
  const tkObj = metaArr.find((x) => x && typeof x === "object" && "team_key" in x);
  return tkObj?.team_key || null;
}

function extractTeamName(teamObj) {
  const metaArr = Array.isArray(teamObj?.[0]) ? teamObj[0] : [];
  const nameObj = metaArr.find((x) => x && typeof x === "object" && "name" in x);
  return nameObj?.name || null;
}

function extractTeamLogo(teamObj) {
  const metaArr = Array.isArray(teamObj?.[0]) ? teamObj[0] : [];
  const logosObj = metaArr.find((x) => x && typeof x === "object" && "team_logos" in x);
  const teamLogos = logosObj?.team_logos;
  if (!Array.isArray(teamLogos) || !teamLogos.length) return null;

  // usually: [{ team_logo: { size:"large", url:"..." } }]
  const first = teamLogos[0]?.team_logo?.url;
  return first || null;
}

async function fetchYahooJson(url) {
  const apiRes = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const bodyText = await apiRes.text();
  if (!apiRes.ok) {
    const err = new Error("Yahoo API error");
    err.status = apiRes.status;
    err.body = bodyText;
    throw err;
  }
  return JSON.parse(bodyText);
}

app.get("/draftboard-data", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    // 1) draft results
    const draftUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`;
    const draftJson = await fetchYahooJson(draftUrl);

    // 2) teams (names + logos)
    const teamsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams?format=json`;
    const teamsJson = await fetchYahooJson(teamsUrl);

    // Pull out draft results array-like object
    const league2 = draftJson?.fantasy_content?.league?.[1];
    const draftResultsObj = league2?.draft_results || {};
    const totalPicks = Number(draftResultsObj?.count || 0);

    const picks = [];
    for (const k of Object.keys(draftResultsObj)) {
      if (k === "count") continue;
      const dr = draftResultsObj[k]?.draft_result;
      if (!dr) continue;
      picks.push({
        pick: Number(dr.pick),
        round: Number(dr.round),
        team_key: dr.team_key,
        player_key: dr.player_key,
      });
    }

    picks.sort((a, b) => a.pick - b.pick);

    const maxRound = picks.reduce((m, p) => Math.max(m, p.round), 0);

    // Draft order = round 1 picks in pick order
    const draftOrder = picks
      .filter((p) => p.round === 1)
      .sort((a, b) => a.pick - b.pick)
      .map((p) => p.team_key);

    // Group into rounds for frontend
    const rounds = [];
    for (let r = 1; r <= maxRound; r++) {
      rounds.push({
        round: r,
        picks: picks
          .filter((p) => p.round === r)
          .sort((a, b) => a.pick - b.pick)
          .map((p) => ({
            ...p,
            // frontend will replace this with mapped name/pos/team if it has it.
            // If you already enrich these elsewhere, keep that logic there.
            player_name: p.player_key,
            player_pos: "",
            player_team: "",
          })),
      });
    }

    // Build teamsByKey map
    const teamsLeague2 = teamsJson?.fantasy_content?.league?.[1];
    const teamsObj = teamsLeague2?.teams || {};

    const teamsByKey = {};
    for (const tk of Object.keys(teamsObj)) {
      if (tk === "count") continue;
      const team = teamsObj[tk]?.team;
      if (!team) continue;

      // team sometimes comes as [ [meta...], ... ]
      const teamKey = extractTeamKey(team);
      if (!teamKey) continue;

      teamsByKey[teamKey] = {
        name: extractTeamName(team) || teamKey,
        logo: extractTeamLogo(team) || null,
      };
    }

    res.json({
      meta: { totalPicks, maxRound },
      draftOrder,
      rounds,
      teamsByKey, // ✅ THIS is what your frontend needs for headers
    });
  } catch (err) {
    console.error("draftboard-data error:", err);
    res.status(500).json({
      error: "Failed to build draft board data",
      details: err?.body ? String(err.body).slice(0, 500) : String(err?.message || err),
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
