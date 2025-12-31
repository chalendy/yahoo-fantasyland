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

function requireAuth(req, res, next) {
  if (!accessToken) {
    return res.status(401).json({ error: "Not authenticated. Please click Sign In first." });
  }
  next();
}

async function yahooGetText(url) {
  const apiRes = await doFetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const bodyText = await apiRes.text();
  if (!apiRes.ok) {
    const err = new Error(`Yahoo API error ${apiRes.status}`);
    err.body = bodyText;
    throw err;
  }
  return bodyText;
}

async function yahooGetJson(url) {
  const txt = await yahooGetText(url);
  return JSON.parse(txt);
}

// -----------------------------
// Helpers to safely walk Yahoo JSON
// -----------------------------
function getLeagueNode(root) {
  // root.fantasy_content.league is an array: [leagueMeta, payloadObject]
  return root?.fantasy_content?.league;
}

function getLeaguePayload(root) {
  const leagueArr = getLeagueNode(root);
  if (!Array.isArray(leagueArr) || leagueArr.length < 2) return null;
  return leagueArr[1];
}

function extractDraftResults(root) {
  const payload = getLeaguePayload(root);
  const dr = payload?.draft_results;
  if (!dr) return [];
  const out = [];
  for (const k of Object.keys(dr)) {
    if (k === "count") continue;
    const item = dr[k]?.draft_result;
    if (item) out.push(item);
  }
  // ensure sorted by pick number
  out.sort((a, b) => Number(a.pick) - Number(b.pick));
  return out;
}

function extractTeamsFromRosters(root) {
  const payload = getLeaguePayload(root);
  const teamsObj = payload?.teams;
  if (!teamsObj) return [];
  const teams = [];
  for (const k of Object.keys(teamsObj)) {
    if (k === "count") continue;
    const teamArr = teamsObj[k]?.team;
    if (Array.isArray(teamArr)) teams.push(teamArr);
  }
  return teams;
}

function parseTeamHeader(teamArr) {
  // teamArr[0] is the "team info list"
  const infoList = teamArr?.[0];
  const getVal = (idx, key) => infoList?.[idx]?.[key];
  const team_key = getVal(0, "team_key");
  const name = getVal(2, "name") || team_key;
  const logos = infoList?.[5]?.team_logos;
  let logo_url = "";
  if (Array.isArray(logos) && logos[0]?.team_logo?.url) logo_url = logos[0].team_logo.url;

  return { team_key, name, logo_url };
}

function collectWeek1KeepersFromRosterJson(rosterJson) {
  const keeperSet = new Set();
  const teams = extractTeamsFromRosters(rosterJson);

  for (const teamArr of teams) {
    const rosterNode = teamArr?.[1]?.roster;
    if (!rosterNode) continue;

    // rosterNode has numeric keys: "0": { players: {...}}, plus coverage_type/week etc.
    for (const rk of Object.keys(rosterNode)) {
      if (!/^\d+$/.test(rk)) continue;
      const playersObj = rosterNode?.[rk]?.players;
      if (!playersObj) continue;

      for (const pk of Object.keys(playersObj)) {
        if (pk === "count") continue;
        const playerArr = playersObj[pk]?.player;
        const playerInfo = playerArr?.[0]; // info list
        if (!Array.isArray(playerInfo)) continue;

        const player_key = playerInfo?.[0]?.player_key;
        const isKeeper = playerInfo?.[9]?.is_keeper; // per your raw, is_keeper shows up around here
        // Make it resilient: scan for is_keeper object anywhere in the info list
        let keeperFlag = false;

        if (isKeeper && typeof isKeeper === "object") {
          keeperFlag = Boolean(isKeeper.status) || Boolean(isKeeper.kept);
        } else {
          for (const node of playerInfo) {
            if (node?.is_keeper && typeof node.is_keeper === "object") {
              keeperFlag = Boolean(node.is_keeper.status) || Boolean(node.is_keeper.kept);
              break;
            }
          }
        }

        if (keeperFlag && player_key) keeperSet.add(player_key);
      }
    }
  }

  return keeperSet;
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
app.get("/scoreboard", requireAuth, async (req, res) => {
  try {
    const week = req.query.week ? String(req.query.week) : null;
    const url =
      week && week.trim()
        ? `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/scoreboard;week=${encodeURIComponent(
            week
          )}?format=json`
        : `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/scoreboard?format=json`;

    const bodyText = await yahooGetText(url);
    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Scoreboard error:", err);
    res.status(500).json({ error: "Failed to fetch scoreboard", details: err.body || String(err) });
  }
});

// -----------------------------
//  STANDINGS RAW
// -----------------------------
app.get("/standings-raw", requireAuth, async (req, res) => {
  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/standings?format=json`;
    const bodyText = await yahooGetText(url);
    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Standings fetch error:", err);
    res.status(500).json({ error: "Failed to fetch league standings", details: err.body || String(err) });
  }
});

// -----------------------------
//  SETTINGS RAW
// -----------------------------
app.get("/settings-raw", requireAuth, async (req, res) => {
  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/settings?format=json`;
    const bodyText = await yahooGetText(url);
    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Settings fetch error:", err);
    res.status(500).json({ error: "Failed to fetch league settings", details: err.body || String(err) });
  }
});

// -----------------------------
//  NEW: DRAFT RESULTS RAW
// -----------------------------
app.get("/draftresults-raw", requireAuth, async (req, res) => {
  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`;
    const bodyText = await yahooGetText(url);
    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Draftresults fetch error:", err);
    res.status(500).json({ error: "Failed to fetch draft results", details: err.body || String(err) });
  }
});

// -----------------------------
//  NEW: ROSTERS RAW (supports ?week=)
// -----------------------------
app.get("/rosters-raw", requireAuth, async (req, res) => {
  try {
    const week = req.query.week ? String(req.query.week) : null;
    const url =
      week && week.trim()
        ? `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster;week=${encodeURIComponent(
            week
          )}?format=json`
        : `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster?format=json`;

    const bodyText = await yahooGetText(url);
    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Rosters fetch error:", err);
    res.status(500).json({ error: "Failed to fetch rosters", details: err.body || String(err) });
  }
});

// -----------------------------
//  NEW: DRAFTBOARD DATA (names + logos + keeper flag from Week 1 rosters)
// -----------------------------
app.get("/draftboard-data", requireAuth, async (req, res) => {
  try {
    // 1) draft results
    const draftJson = await yahooGetJson(
      `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`
    );

    const draftResults = extractDraftResults(draftJson);
    if (!draftResults.length) {
      return res.json({ meta: { totalPicks: 0, maxRound: 0 }, draftOrder: [], rounds: [], teamsByKey: {} });
    }

    // 2) Teams (for names/logos) — easiest source: standings
    const standingsJson = await yahooGetJson(
      `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/standings?format=json`
    );

    const payload = getLeaguePayload(standingsJson);
    const teams = payload?.standings?.[0]?.teams || payload?.teams || null;

    // parse teams from standings-like structure
    const teamsByKey = {};
    if (teams) {
      for (const k of Object.keys(teams)) {
        if (k === "count") continue;
        const teamArr = teams[k]?.team;
        if (!Array.isArray(teamArr)) continue;
        const t = parseTeamHeader(teamArr);
        if (t.team_key) teamsByKey[t.team_key] = t;
      }
    }

    // 3) Week 1 rosters -> keeperSet
    const week1RosterJson = await yahooGetJson(
      `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster;week=1?format=json`
    );
    const keeperSet = collectWeek1KeepersFromRosterJson(week1RosterJson);

    // 4) Player metadata for drafted players (name/pos/team)
    const playerKeys = [...new Set(draftResults.map((d) => d.player_key).filter(Boolean))];
    const playerKeyStr = playerKeys.join(",");
    const playerMap = {};

    if (playerKeys.length) {
      // This endpoint returns players; we’ll map by player_key
      const playersJson = await yahooGetJson(
        `https://fantasysports.yahooapis.com/fantasy/v2/players;player_keys=${encodeURIComponent(playerKeyStr)}?format=json`
      );

      const playersPayload = playersJson?.fantasy_content?.players;
      if (playersPayload) {
        for (const pk of Object.keys(playersPayload)) {
          if (pk === "count") continue;
          const pArr = playersPayload[pk]?.player;
          const info = pArr?.[0];
          if (!Array.isArray(info)) continue;

          const key = info?.[0]?.player_key;
          const name = info?.[2]?.name?.full || key;
          const pos = info?.[12]?.display_position || info?.[14]?.primary_position || "";
          const team = info?.[7]?.editorial_team_abbr || "";
          if (key) playerMap[key] = { name, pos, team };
        }
      }
    }

    // 5) Draft order = round 1 order by pick
    const round1 = draftResults.filter((d) => Number(d.round) === 1).sort((a, b) => Number(a.pick) - Number(b.pick));
    const draftOrder = round1.map((d) => d.team_key);

    // 6) Build rounds object
    const maxRound = Math.max(...draftResults.map((d) => Number(d.round)));
    const rounds = [];
    for (let r = 1; r <= maxRound; r++) {
      const picks = draftResults
        .filter((d) => Number(d.round) === r)
        .sort((a, b) => Number(a.pick) - Number(b.pick))
        .map((d) => {
          const meta = playerMap[d.player_key] || null;
          return {
            pick: Number(d.pick),
            round: Number(d.round),
            team_key: d.team_key,
            player_key: d.player_key,
            player_name: meta?.name || d.player_key,
            player_pos: meta?.pos || "",
            player_team: meta?.team || "",
            is_keeper: keeperSet.has(d.player_key),
          };
        });

      rounds.push({ round: r, picks });
    }

    res.json({
      meta: { totalPicks: draftResults.length, maxRound },
      draftOrder,
      rounds,
      teamsByKey,
    });
  } catch (err) {
    console.error("Draftboard-data error:", err);
    res.status(500).json({ error: "Failed to build draftboard data", details: err.body || String(err) });
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
