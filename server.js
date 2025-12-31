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

async function yahooGet(url) {
  const apiRes = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const text = await apiRes.text();
  if (!apiRes.ok) {
    const err = new Error(`Yahoo API error HTTP ${apiRes.status}`);
    err.body = text;
    throw err;
  }
  return JSON.parse(text);
}

// -----------------------------
//  Yahoo JSON helpers (Yahoo returns a lot of arrays/objects)
// -----------------------------
function extractDraftResults(draftJson) {
  // draftJson.fantasy_content.league[1].draft_results
  const leagueArr = draftJson?.fantasy_content?.league;
  const draftResultsObj = leagueArr?.[1]?.draft_results;
  if (!draftResultsObj) return [];

  const results = [];
  for (const k of Object.keys(draftResultsObj)) {
    if (k === "count") continue;
    const dr = draftResultsObj[k]?.draft_result;
    if (!dr) continue;
    results.push({
      pick: Number(dr.pick),
      round: Number(dr.round),
      team_key: String(dr.team_key),
      player_key: String(dr.player_key),
    });
  }
  // Sort by overall pick
  results.sort((a, b) => a.pick - b.pick);
  return results;
}

function extractTeamsMeta(teamsJson) {
  // teamsJson.fantasy_content.league[1].teams
  const leagueArr = teamsJson?.fantasy_content?.league;
  const teamsObj = leagueArr?.[1]?.teams;
  if (!teamsObj) return new Map();

  const map = new Map();

  for (const k of Object.keys(teamsObj)) {
    if (k === "count") continue;
    const teamArr = teamsObj[k]?.team;
    if (!Array.isArray(teamArr) || !Array.isArray(teamArr[0])) continue;

    const parts = teamArr[0]; // array of small objects
    const team_key = parts.find((x) => x?.team_key)?.team_key;
    const name = parts.find((x) => x?.name)?.name;

    // logo: parts.find(x => x.team_logos)?.team_logos[0].team_logo.url
    let logoUrl = "";
    const logosBlock = parts.find((x) => x?.team_logos)?.team_logos;
    if (Array.isArray(logosBlock) && logosBlock[0]?.team_logo?.url) {
      logoUrl = logosBlock[0].team_logo.url;
    }

    if (team_key) {
      map.set(String(team_key), { team_key: String(team_key), name: name ? String(name) : String(team_key), logoUrl });
    }
  }

  return map;
}

function extractPlayersMeta(playersJson) {
  // playersJson.fantasy_content.league[1].players
  const leagueArr = playersJson?.fantasy_content?.league;
  const playersObj = leagueArr?.[1]?.players;
  const map = new Map();
  if (!playersObj) return map;

  for (const k of Object.keys(playersObj)) {
    if (k === "count") continue;
    const playerArr = playersObj[k]?.player;
    if (!Array.isArray(playerArr) || !Array.isArray(playerArr[0])) continue;

    const parts = playerArr[0];
    const player_key = parts.find((x) => x?.player_key)?.player_key;

    const nameFull = parts.find((x) => x?.name)?.name?.full;
    const displayPos = parts.find((x) => x?.display_position)?.display_position;
    const teamAbbr = parts.find((x) => x?.editorial_team_abbr)?.editorial_team_abbr;

    if (player_key) {
      map.set(String(player_key), {
        player_key: String(player_key),
        player_name: nameFull ? String(nameFull) : "",
        player_pos: displayPos ? String(displayPos) : "",
        player_team: teamAbbr ? String(teamAbbr) : "",
      });
    }
  }

  return map;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
//  DRAFT BOARD DATA (NEW)
//  Returns: { meta, draftOrder, teamsByKey, rounds }
// -----------------------------
app.get("/draftboard-data", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    // 1) Draft results
    const draftUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`;
    const draftJson = await yahooGet(draftUrl);
    const picks = extractDraftResults(draftJson);

    if (!picks.length) {
      return res.json({ meta: { totalPicks: 0, maxRound: 0 }, draftOrder: [], teamsByKey: {}, rounds: [] });
    }

    const maxRound = Math.max(...picks.map((p) => p.round));

    // draft order = round 1 by ascending pick
    const round1 = picks.filter((p) => p.round === 1).sort((a, b) => a.pick - b.pick);
    const draftOrder = round1.map((p) => p.team_key);

    // 2) Teams (names + logos)
    const teamsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams?format=json`;
    const teamsJson = await yahooGet(teamsUrl);
    const teamsMeta = extractTeamsMeta(teamsJson);
    const teamsByKey = Object.fromEntries(teamsMeta.entries());

    // 3) Players info in batches
    const allPlayerKeys = Array.from(new Set(picks.map((p) => p.player_key)));
    const playerInfoMap = new Map();

    // keep batches modest to avoid URL-length issues
    const batches = chunk(allPlayerKeys, 25);

    for (const batch of batches) {
      const keys = batch.join(",");
      const playersUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/players;player_keys=${encodeURIComponent(
        keys
      )}?format=json`;

      const playersJson = await yahooGet(playersUrl);
      const batchMap = extractPlayersMeta(playersJson);

      for (const [k, v] of batchMap.entries()) playerInfoMap.set(k, v);
    }

    // 4) Build rounds + enrich picks
    const rounds = [];
    for (let r = 1; r <= maxRound; r++) {
      const roundPicks = picks
        .filter((p) => p.round === r)
        .sort((a, b) => a.pick - b.pick)
        .map((p) => {
          const info = playerInfoMap.get(p.player_key);
          const resolvedName = info?.player_name?.trim();

          const keeperGuess = !resolvedName; // only flag when we couldn't resolve player meta

          return {
            pick: p.pick,
            round: p.round,
            team_key: p.team_key,
            player_key: p.player_key,
            player_name: resolvedName ? info.player_name : p.player_key, // fallback to raw key (what you saw)
            player_pos: resolvedName ? (info.player_pos || "") : "",
            player_team: resolvedName ? (info.player_team || "") : "",
            keeperGuess,
          };
        });

      rounds.push({ round: r, picks: roundPicks });
    }

    res.json({
      meta: { totalPicks: picks.length, maxRound },
      draftOrder,
      teamsByKey,
      rounds,
    });
  } catch (err) {
    console.error("Draftboard error:", err?.message, err?.body ? `\nBody: ${err.body}` : "");
    res.status(500).json({ error: "Failed to build draftboard data" });
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
