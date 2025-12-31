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

      // will be added later
      is_keeper_eligible: false,
    });
  }

  picks.sort((a, b) => a.pick - b.pick);
  return picks;
}

// Yahoo "players" response parsing
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
      if (part.display_position) pos = part.display_position;
      if (part.editorial_team_abbr) team = part.editorial_team_abbr;

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

// From a teams payload (teams->team[1].roster), build map team_key -> Set(player_key)
function extractRosterKeysByTeam(teamsNode) {
  const byTeam = {};
  if (!isObj(teamsNode)) return byTeam;

  for (const idx of Object.keys(teamsNode)) {
    const teamWrap = teamsNode[idx];
    const teamArr = teamWrap?.team;
    if (!Array.isArray(teamArr) || !Array.isArray(teamArr[0])) continue;

    const core = teamArr[0];
    const rosterObj = teamArr[1]?.roster;

    let team_key = null;
    for (const part of core) {
      if (isObj(part) && part.team_key) team_key = part.team_key;
    }
    if (!team_key) continue;

    const set = new Set();

    // rosterObj is an object with numeric key "0": { players: { ... } }
    const playersNode = rosterObj?.[0]?.players;
    if (isObj(playersNode)) {
      for (const pk of Object.keys(playersNode)) {
        const playerArr = playersNode[pk]?.player;
        if (!Array.isArray(playerArr) || !Array.isArray(playerArr[0])) continue;

        const fields = playerArr[0];
        let player_key = null;
        for (const part of fields) {
          if (isObj(part) && part.player_key) player_key = part.player_key;
        }
        if (player_key) set.add(player_key);
      }
    }

    byTeam[team_key] = set;
  }

  return byTeam;
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
//  Draft Board data (draft results + team meta + player headshots + keeper eligibility)
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

    // 2) Teams + roster (week=1) to get team names/logos (and also current_week from meta)
    const rosterWeek1Url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster;week=1?format=json`;
    const rosterWeek1Res = await doFetch(rosterWeek1Url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const rosterWeek1Text = await rosterWeek1Res.text();
    if (!rosterWeek1Res.ok) return res.status(500).json({ error: "Yahoo API error", body: rosterWeek1Text });
    const rosterWeek1Json = JSON.parse(rosterWeek1Text);

    const leagueRosterW1 = pickLeagueBlock(rosterWeek1Json);
    const teamsNodeW1 = findLeagueChild(leagueRosterW1, "teams");
    const teamsByKey = extractTeamsMapFromTeamsPayload(teamsNodeW1);

    // current_week from meta (in league[0])
    const meta0 = Array.isArray(rosterWeek1Json?.fantasy_content?.league)
      ? rosterWeek1Json.fantasy_content.league[0]
      : null;
    const currentWeek = Number(meta0?.current_week) || 1;

    // 3) Current rosters (week=currentWeek) for "hasn't been dropped"
    const rosterCurrentUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster;week=${encodeURIComponent(
      String(currentWeek)
    )}?format=json`;
    const rosterCurrentRes = await doFetch(rosterCurrentUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const rosterCurrentText = await rosterCurrentRes.text();
    if (!rosterCurrentRes.ok) {
      // If this fails for some reason, we still return the board (eligibility will just be false)
      console.error("Current roster fetch failed:", rosterCurrentRes.status, rosterCurrentText?.slice?.(0, 250));
    }
    const rosterCurrentJson = rosterCurrentRes.ok ? JSON.parse(rosterCurrentText) : null;
    const leagueRosterCur = rosterCurrentJson ? pickLeagueBlock(rosterCurrentJson) : null;
    const teamsNodeCur = leagueRosterCur ? findLeagueChild(leagueRosterCur, "teams") : null;
    const rosterKeysByTeam = teamsNodeCur ? extractRosterKeysByTeam(teamsNodeCur) : {};

    // 4) Draft order = Round 1 order
    const round1 = picks.filter((p) => p.round === 1).sort((a, b) => a.pick - b.pick);
    const draftOrder = round1.map((p) => p.team_key);

    // 5) Enrich ALL draft player_keys with chunked players call
    const allPlayerKeys = Array.from(new Set(picks.map((p) => p.player_key))).filter(Boolean);

    const playersMap = {};
    for (const group of chunk(allPlayerKeys, 25)) {
      const keysParam = group.join(",");
      const playersUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/players;player_keys=${encodeURIComponent(
        keysParam
      )}?format=json`;

      const pRes = await doFetch(playersUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const pText = await pRes.text();
      if (!pRes.ok) {
        console.error("Players lookup failed:", pRes.status, pText?.slice?.(0, 200));
        continue;
      }

      const pJson = JSON.parse(pText);
      const leaguePlayers = pickLeagueBlock(pJson);
      const playersNode = findLeagueChild(leaguePlayers, "players");
      const chunkMap = extractPlayersMapFromPlayersPayload(playersNode);

      Object.assign(playersMap, chunkMap);
    }

    // 6) Attach player info + keeper eligibility
    for (const p of picks) {
      const info = playersMap[p.player_key];
      if (info) {
        p.player_name = info.player_name || p.player_name;
        p.player_pos = info.player_pos || "";
        p.player_team = info.player_team || "";
        p.player_headshot = info.player_headshot || null;
      }

      // Keeper eligibility rule:
      // - drafted round 6 or later
      // - still on that team's roster (current week roster)
      const onTeamNow = rosterKeysByTeam?.[p.team_key]?.has?.(p.player_key) === true;
      p.is_keeper_eligible = p.round >= 6 && onTeamNow;
    }

    // 7) Group into rounds
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
        currentWeek,
      },
      draftOrder,
      rounds,
      teamsByKey,
      // optional debug/feature support
      // currentRosterByTeam: Object.fromEntries(Object.entries(rosterKeysByTeam).map(([k, set]) => [k, Array.from(set)])),
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
