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

// -----------------------------
//  Helpers to safely walk Yahoo's weird arrays
// -----------------------------
function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function pickLeagueBlock(json) {
  return json?.fantasy_content?.league;
}

// Find the object inside league[] that contains a key (ex: "draft_results", "teams", "players")
function findLeagueChild(leagueArr, key) {
  if (!Array.isArray(leagueArr)) return null;
  for (const item of leagueArr) {
    if (isObj(item) && key in item) return item[key];
  }
  return null;
}



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

    const apiRes = await doFetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

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

    const apiRes = await doFetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

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

    const apiRes = await doFetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) return res.status(500).json({ error: "Yahoo API error", body: bodyText });

    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Settings fetch error:", err);
    res.status(500).json({ error: "Failed to fetch league settings" });
  }
});



// Extract team meta from teams->team[0] block
function extractTeamsMapFromTeamsPayload(teamsNode) {
  const teamsByKey = {};
  if (!isObj(teamsNode)) return teamsByKey;

  for (const idx of Object.keys(teamsNode)) {
    const teamWrap = teamsNode[idx];
    const teamArr = teamWrap?.team;
    if (!Array.isArray(teamArr) || !Array.isArray(teamArr[0])) continue;

    const core = teamArr[0]; // array of objects
    let team_key = null;
    let name = null;
    let logo = null;

    for (const part of core) {
      if (!isObj(part)) continue;
      if (part.team_key) team_key = part.team_key;
      if (part.name) name = part.name;

      // team_logos: [{ team_logo: { url, size } }]
      if (part.team_logos && Array.isArray(part.team_logos)) {
        const first = part.team_logos[0]?.team_logo;
        if (first?.url) logo = first.url;
      }
    }

    if (team_key) {
      teamsByKey[team_key] = { name: name || team_key, logo };
    }
  }

  return teamsByKey;
}

// Parse draft_results into picks list
function extractDraftPicks(draftResultsNode) {
  const picks = [];
  if (!isObj(draftResultsNode)) return picks;

  for (const k of Object.keys(draftResultsNode)) {
    if (k === "count") continue;
    const dr = draftResultsNode[k]?.draft_result;
    if (!dr) continue;

    picks.push({
      pick: Number(dr.pick),
      round: Number(dr.round),
      team_key: dr.team_key,
      player_key: dr.player_key,
      // these will be enriched later
      player_name: dr.player_key,
      player_pos: "",
      player_team: "",
      player_headshot: null,
    });
  }

  // sort just in case
  picks.sort((a, b) => a.pick - b.pick);
  return picks;
}

// Yahoo "players" response parsing: players -> { "0": { player: [ [ {player_key},{name},{display_position},{editorial_team_abbr},{headshot/image_url}... ] ] } }
function extractPlayersMapFromPlayersPayload(playersNode) {
  const map = {};
  if (!isObj(playersNode)) return map;

  for (const idx of Object.keys(playersNode)) {
    const pwrap = playersNode[idx];
    const parr = pwrap?.player;
    if (!Array.isArray(parr) || !Array.isArray(parr[0])) continue;

    const core = parr[0]; // array of objects
    let player_key = null;
    let name = null;
    let pos = "";
    let team = "";
    let headshot = null;

    for (const part of core) {
      if (!isObj(part)) continue;

      if (part.player_key) player_key = part.player_key;

      if (part.name?.full) name = part.name.full;

      // Yahoo uses "display_position"
      if (part.display_position) pos = part.display_position;

      if (part.editorial_team_abbr) team = part.editorial_team_abbr;

      // headshot: { url, size } OR image_url
      if (part.headshot?.url) headshot = part.headshot.url;
      if (!headshot && part.image_url) headshot = part.image_url;
    }

    if (player_key) {
      map[player_key] = {
        player_name: name || player_key,
        player_pos: pos || "",
        player_team: team || "",
        player_headshot: headshot || null,
      };
    }
  }

  return map;
}

// Chunk player_keys to avoid huge URL issues
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
//  Draft Board data (draft results + team meta + player headshots)
// -----------------------------
app.get("/draftboard-data", async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: "Not authenticated. Please click Sign In first." });
  }

  try {
    // 1) Draft results
    const draftUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`;
    const draftRes = await doFetch(draftUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const draftText = await draftRes.text();
    if (!draftRes.ok) return res.status(500).json({ error: "Yahoo API error", body: draftText });
    const draftJson = JSON.parse(draftText);

    const leagueDraft = pickLeagueBlock(draftJson);
    const draftResultsNode = findLeagueChild(leagueDraft, "draft_results");
    const picks = extractDraftPicks(draftResultsNode);

    // 2) Teams + roster (we mostly need team names/logos)
    // Using week=1 here is fine; it reliably returns team meta
    const rosterUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster;week=1?format=json`;
    const rosterRes = await doFetch(rosterUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const rosterText = await rosterRes.text();
    if (!rosterRes.ok) return res.status(500).json({ error: "Yahoo API error", body: rosterText });
    const rosterJson = JSON.parse(rosterText);

    const leagueRoster = pickLeagueBlock(rosterJson);
    const teamsNode = findLeagueChild(leagueRoster, "teams");
    const teamsByKey = extractTeamsMapFromTeamsPayload(teamsNode);

    // 3) Draft order = Round 1 order
    const round1 = picks.filter((p) => p.round === 1).sort((a, b) => a.pick - b.pick);
    const draftOrder = round1.map((p) => p.team_key);

    // 4) Enrich ALL draft player_keys with one (chunked) players call
    const allPlayerKeys = Array.from(new Set(picks.map((p) => p.player_key))).filter(Boolean);

    const playersMap = {};
    // 25-50 per chunk tends to be safe for URL size; we’ll use 25
    for (const group of chunk(allPlayerKeys, 25)) {
      const keysParam = group.join(",");
      const playersUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/players;player_keys=${encodeURIComponent(
        keysParam
      )}?format=json`;

      const pRes = await doFetch(playersUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const pText = await pRes.text();
      if (!pRes.ok) {
        // Don't hard fail everything if one chunk fails — but log it
        console.error("Players lookup failed:", pRes.status, pText?.slice?.(0, 200));
        continue;
      }

      const pJson = JSON.parse(pText);
      const leaguePlayers = pickLeagueBlock(pJson);
      const playersNode = findLeagueChild(leaguePlayers, "players");
      const chunkMap = extractPlayersMapFromPlayersPayload(playersNode);

      Object.assign(playersMap, chunkMap);
    }

    // 5) Attach player info to each pick
    for (const p of picks) {
      const info = playersMap[p.player_key];
      if (info) {
        p.player_name = info.player_name || p.player_name;
        p.player_pos = info.player_pos || "";
        p.player_team = info.player_team || "";
        p.player_headshot = info.player_headshot || null;
      }
    }

    // 6) Group into rounds
    const maxRound = Math.max(...picks.map((p) => p.round));
    const rounds = [];
    for (let r = 1; r <= maxRound; r++) {
      rounds.push({
        round: r,
        picks: picks.filter((p) => p.round === r).sort((a, b) => a.pick - b.pick),
      });
    }

    res.json({
      meta: {
        totalPicks: picks.length,
        maxRound,
      },
      draftOrder,
      rounds,
      teamsByKey,
    });
  } catch (err) {
    console.error("draftboard-data error:", err);
    res.status(500).json({ error: "Failed to build draft board data" });
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
