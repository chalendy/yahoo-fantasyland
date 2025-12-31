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
//  Helpers to safely walk Yahoo's weird arrays
// -----------------------------
function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function pickLeagueBlock(json) {
  return json?.fantasy_content?.league;
}

// Find the object inside league[] that contains a key (ex: "draft_results", "teams", "players", "transactions")
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
      // enriched later
      player_name: dr.player_key,
      player_pos: "",
      player_team: "",
      player_headshot: null,
      is_keeper: false,
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

      // headshot: { url } OR image_url
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

// Build keeper set from rosters payload (week 1)
function extractKeeperSetFromRostersPayload(teamsNode) {
  const keeperSet = new Set();
  if (!isObj(teamsNode)) return keeperSet;

  for (const idx of Object.keys(teamsNode)) {
    const teamWrap = teamsNode[idx];
    const teamArr = teamWrap?.team;
    if (!Array.isArray(teamArr)) continue;

    const rosterObj = teamArr?.[1]?.roster;
    const playersNode = rosterObj?.[0]?.players;
    if (!isObj(playersNode)) continue;

    for (const pidx of Object.keys(playersNode)) {
      const playerArr = playersNode[pidx]?.player;
      if (!Array.isArray(playerArr) || !Array.isArray(playerArr[0])) continue;

      const core = playerArr[0];
      let player_key = null;
      let is_keeper = false;

      for (const part of core) {
        if (!isObj(part)) continue;
        if (part.player_key) player_key = part.player_key;
        if (part.is_keeper?.status === true) is_keeper = true;
      }

      if (player_key && is_keeper) keeperSet.add(player_key);
    }
  }

  return keeperSet;
}

// Extract roster map: team_key -> [player_key...]
function extractRosterMapFromRostersPayload(teamsNode) {
  const rostersByTeamKey = {};
  if (!isObj(teamsNode)) return rostersByTeamKey;

  for (const idx of Object.keys(teamsNode)) {
    const teamWrap = teamsNode[idx];
    const teamArr = teamWrap?.team;
    if (!Array.isArray(teamArr) || !Array.isArray(teamArr[0])) continue;

    // team key is in teamArr[0] (array of objects)
    const core = teamArr[0];
    let team_key = null;
    for (const part of core) {
      if (isObj(part) && part.team_key) team_key = part.team_key;
    }
    if (!team_key) continue;

    const rosterObj = teamArr?.[1]?.roster;
    const playersNode = rosterObj?.[0]?.players;
    if (!isObj(playersNode)) continue;

    const keys = [];
    for (const pidx of Object.keys(playersNode)) {
      const playerArr = playersNode[pidx]?.player;
      if (!Array.isArray(playerArr) || !Array.isArray(playerArr[0])) continue;

      const pcore = playerArr[0];
      for (const part of pcore) {
        if (isObj(part) && part.player_key) {
          keys.push(String(part.player_key));
          break;
        }
      }
    }

    rostersByTeamKey[team_key] = keys;
  }

  return rostersByTeamKey;
}

// Transactions: build a set of player_keys that were ever dropped/traded
function extractMovedPlayersFromTransactions(transactionsNode) {
  const moved = new Set();
  if (!isObj(transactionsNode)) return moved;

  for (const idx of Object.keys(transactionsNode)) {
    if (idx === "count") continue;

    const txArr = transactionsNode[idx]?.transaction;
    if (!Array.isArray(txArr) || !isObj(txArr[1])) continue;

    const playersNode = txArr[1]?.players;
    if (!isObj(playersNode)) continue;

    for (const pidx of Object.keys(playersNode)) {
      if (pidx === "count") continue;
      const playerWrap = playersNode[pidx]?.player;
      if (!Array.isArray(playerWrap) || !Array.isArray(playerWrap[0])) continue;

      const core = playerWrap[0];
      let player_key = null;

      for (const part of core) {
        if (isObj(part) && part.player_key) {
          player_key = String(part.player_key);
          break;
        }
      }
      if (!player_key) continue;

      // transaction_data can be object OR array
      const txDataBlock = playerWrap[1]?.transaction_data;
      const txDataList = Array.isArray(txDataBlock) ? txDataBlock : txDataBlock ? [txDataBlock] : [];

      for (const td of txDataList) {
        const type = String(td?.type || "").toLowerCase();
        // League rule: must NOT be in drop or trade history
        if (type === "drop" || type === "trade") {
          moved.add(player_key);
        }
      }
    }
  }

  return moved;
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
//  (existing endpoints you already had)
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

app.get("/draftresults-raw", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`;

    const apiRes = await doFetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) return res.status(500).json({ error: "Yahoo API error", body: bodyText });

    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Draftresults fetch error:", err);
    res.status(500).json({ error: "Failed to fetch draft results" });
  }
});

app.get("/rosters-raw", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const week = req.query.week ? String(req.query.week) : "1";
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster;week=${encodeURIComponent(
      week
    )}?format=json`;

    const apiRes = await doFetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) return res.status(500).json({ error: "Yahoo API error", body: bodyText });

    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Rosters fetch error:", err);
    res.status(500).json({ error: "Failed to fetch rosters" });
  }
});

// NEW: transactions raw
app.get("/transactions-raw", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const start = req.query.start ? String(req.query.start) : "0";
    const count = req.query.count ? String(req.query.count) : "25";

    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/transactions;start=${encodeURIComponent(
      start
    )};count=${encodeURIComponent(count)}?format=json`;

    const apiRes = await doFetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) return res.status(500).json({ error: "Yahoo API error", body: bodyText });

    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Transactions fetch error:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// -----------------------------
//  PLAYERS RAW (optional helper)
// -----------------------------
app.get("/players-raw", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const keys = req.query.player_keys ? String(req.query.player_keys) : "";
    if (!keys.trim()) return res.status(400).json({ error: "Missing player_keys" });

    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/players;player_keys=${encodeURIComponent(
      keys
    )}?format=json`;

    const apiRes = await doFetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) return res.status(500).json({ error: "Yahoo API error", body: bodyText });

    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Players fetch error:", err);
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

// -----------------------------
//  DRAFTBOARD DATA (merged + enriched)
//  - team names/logos from week=1 rosters payload
//  - player name/pos/team/headshot from players lookup using draft player_keys
//  - keeper flag from week=1 roster's is_keeper.status === true
//  - current rosters map (week=current_week) for eligibility checks
//  - movedPlayers set from transactions (drop/trade)
// -----------------------------
app.get("/draftboard-data", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    // 1) Draft results
    const draftUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`;
    const draftRes = await doFetch(draftUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const draftText = await draftRes.text();
    if (!draftRes.ok) return res.status(500).json({ error: "Yahoo API error (draftresults)", body: draftText });
    const draftJson = JSON.parse(draftText);

    const leagueDraft = pickLeagueBlock(draftJson);
    const draftResultsNode = findLeagueChild(leagueDraft, "draft_results");
    const picks = extractDraftPicks(draftResultsNode);

    // 2) Week 1 rosters (team meta + keeper truth + also contains current_week we can read)
    const rosterWeek1Url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster;week=1?format=json`;
    const rosterW1Res = await doFetch(rosterWeek1Url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const rosterW1Text = await rosterW1Res.text();
    if (!rosterW1Res.ok) return res.status(500).json({ error: "Yahoo API error (rosters week 1)", body: rosterW1Text });
    const rosterW1Json = JSON.parse(rosterW1Text);

    const leagueRosterW1 = pickLeagueBlock(rosterW1Json);
    const leagueMetaW1 = Array.isArray(leagueRosterW1) ? leagueRosterW1[0] : null;
    const currentWeekFromLeague = Number(leagueMetaW1?.current_week || leagueMetaW1?.matchup_week || 0) || 1;

    const teamsNodeW1 = findLeagueChild(leagueRosterW1, "teams");
    const teamsByKey = extractTeamsMapFromTeamsPayload(teamsNodeW1);
    const keeperSet = extractKeeperSetFromRostersPayload(teamsNodeW1);

    // 3) Draft order = Round 1 order
    const round1 = picks.filter((p) => p.round === 1).sort((a, b) => a.pick - b.pick);
    const draftOrder = round1.map((p) => p.team_key);

    // 4) Enrich ALL draft player_keys via players endpoint in chunks
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
        console.error("Players lookup failed:", pRes.status, pText?.slice?.(0, 300));
        continue;
      }

      const pJson = JSON.parse(pText);
      const leaguePlayers = pickLeagueBlock(pJson);
      const playersNode = findLeagueChild(leaguePlayers, "players");
      const chunkMap = extractPlayersMapFromPlayersPayload(playersNode);

      Object.assign(playersMap, chunkMap);
    }

    // 5) Attach player info + keeper flag
    for (const p of picks) {
      const info = playersMap[p.player_key];
      if (info) {
        p.player_name = info.player_name || p.player_name;
        p.player_pos = info.player_pos || "";
        p.player_team = info.player_team || "";
        p.player_headshot = info.player_headshot || null;
      }
      p.is_keeper = keeperSet.has(p.player_key);
    }

    // 6) Current rosters (use current week; allow override with ?week=)
    const rosterWeek = req.query.week ? Number(req.query.week) : currentWeekFromLeague;
    const rosterCurrentUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster;week=${encodeURIComponent(
      String(rosterWeek)
    )}?format=json`;

    const rosterCurRes = await doFetch(rosterCurrentUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const rosterCurText = await rosterCurRes.text();
    if (!rosterCurRes.ok) return res.status(500).json({ error: "Yahoo API error (rosters current)", body: rosterCurText });
    const rosterCurJson = JSON.parse(rosterCurText);

    const leagueRosterCur = pickLeagueBlock(rosterCurJson);
    const teamsNodeCur = findLeagueChild(leagueRosterCur, "teams");
    const currentRostersByTeamKey = extractRosterMapFromRostersPayload(teamsNodeCur);

    // 7) Transactions: page through to build movedPlayers set
    const movedPlayers = new Set();
    const PAGE = 25;
    let start = 0;

    while (start < 1000) {
      const txUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/transactions;start=${start};count=${PAGE}?format=json`;
      const txRes = await doFetch(txUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const txText = await txRes.text();
      if (!txRes.ok) {
        console.error("Transactions page failed:", txRes.status, txText?.slice?.(0, 200));
        break; // don’t kill the whole board if transactions fail
      }

      const txJson = JSON.parse(txText);
      const leagueTx = pickLeagueBlock(txJson);
      const txNode = findLeagueChild(leagueTx, "transactions");

      if (!txNode) break;

      const count = Number(txNode?.count || 0);
      const pageMoved = extractMovedPlayersFromTransactions(txNode);
      for (const k of pageMoved) movedPlayers.add(k);

      // no more results
      if (!count || count < PAGE) break;

      start += PAGE;
    }

    // 8) Group into rounds
    const maxRound = Math.max(...picks.map((p) => p.round));
    const rounds = [];
    for (let r = 1; r <= maxRound; r++) {
      rounds.push({
        round: r,
        picks: picks.filter((p) => p.round === r).sort((a, b) => a.pick - b.pick),
      });
    }

    res.json({
      meta: { totalPicks: picks.length, maxRound, rosterWeek },
      draftOrder,
      rounds,
      teamsByKey,                 // names/logos
      currentRostersByTeamKey,     // eligibility
      movedPlayers: Array.from(movedPlayers), // dropped/traded list
    });
  } catch (err) {
    console.error("draftboard-data error:", err);
    res.status(500).json({ error: "Failed to build draft board data" });
  }
});

// -----------------------------
//  AUTH STATUS (for UI)
// -----------------------------
app.get("/auth-status", (req, res) => {
  res.json({
    authenticated: !!accessToken,
  });
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
