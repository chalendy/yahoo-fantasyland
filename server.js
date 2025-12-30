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
// Small fetch helper (Node 18+ has global fetch)
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
  const apiRes = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const bodyText = await apiRes.text();
  if (!apiRes.ok) {
    const err = new Error("Yahoo API error");
    err.status = apiRes.status;
    err.body = bodyText;
    throw err;
  }
  return bodyText;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// -----------------------------
// OAUTH START
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
// OAUTH CALLBACK
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
// SCOREBOARD (supports ?week=)
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
// STANDINGS RAW
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
// SETTINGS RAW
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
// DRAFT RESULTS RAW (NEW)
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
// ROSTERS RAW (NEW) supports ?week=
// -----------------------------
app.get("/rosters-raw", requireAuth, async (req, res) => {
  try {
    const week = req.query.week ? String(req.query.week) : null;

    // matches your extracted yahoo:uri: /league/.../teams/roster
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
// DRAFT BOARD DATA (NEW) combines draft + teams meta
// Columns = Round 1 draft order; rows = rounds
// -----------------------------
function extractTeamMeta(teamArr) {
  // teamArr looks like: [ [meta...], { roster: ... } ]
  const meta = Array.isArray(teamArr?.[0]) ? teamArr[0] : [];
  const getObjWithKey = (k) => meta.find((x) => x && typeof x === "object" && k in x);

  const team_key = getObjWithKey("team_key")?.team_key ?? null;
  const name = getObjWithKey("name")?.name ?? null;

  // team_logos: [ { team_logo: { size, url } } ]
  let logo_url = null;
  const logosObj = getObjWithKey("team_logos")?.team_logos;
  if (Array.isArray(logosObj) && logosObj.length) {
    const first = logosObj[0]?.team_logo;
    if (first?.url) logo_url = first.url;
  }

  // managers: [ { manager: { nickname } } ]
  let manager = null;
  const managersObj = getObjWithKey("managers")?.managers;
  if (Array.isArray(managersObj) && managersObj.length) {
    const m = managersObj[0]?.manager;
    if (m?.nickname) manager = m.nickname;
  }

  return { team_key, name, logo_url, manager };
}

app.get("/draft-board-data", requireAuth, async (req, res) => {
  try {
    const week = req.query.week ? String(req.query.week) : null;

    const draftUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`;
    const rosterUrl =
      week && week.trim()
        ? `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster;week=${encodeURIComponent(
            week
          )}?format=json`
        : `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster?format=json`;

    const [draftText, rosterText] = await Promise.all([yahooGetText(draftUrl), yahooGetText(rosterUrl)]);

    const draftJson = safeJsonParse(draftText);
    const rosterJson = safeJsonParse(rosterText);

    if (!draftJson || !rosterJson) {
      return res.status(500).json({
        error: "Failed to parse Yahoo response as JSON",
        draftIsJson: !!draftJson,
        rosterIsJson: !!rosterJson,
      });
    }

    const leagueName = draftJson?.fantasy_content?.league?.[0]?.name ?? "Draft Board";

    // Draft results object with numeric keys + "count"
    const draftResultsObj = draftJson?.fantasy_content?.league?.[1]?.draft_results;
    const draftItems = [];
    if (draftResultsObj && typeof draftResultsObj === "object") {
      for (const k of Object.keys(draftResultsObj)) {
        if (k === "count") continue;
        const dr = draftResultsObj[k]?.draft_result;
        if (dr) draftItems.push(dr);
      }
    }

    // Sort by round then pick (overall)
    draftItems.sort((a, b) => (a.round - b.round) || (a.pick - b.pick));

    // Team meta from rosters response
    const teamsObj = rosterJson?.fantasy_content?.league?.[1]?.teams;
    const teams = [];
    if (teamsObj && typeof teamsObj === "object") {
      for (const k of Object.keys(teamsObj)) {
        if (k === "count") continue;
        const teamArr = teamsObj[k]?.team;
        const meta = extractTeamMeta(teamArr);
        if (meta.team_key) teams.push(meta);
      }
    }
    const teamMetaByKey = Object.fromEntries(teams.map((t) => [t.team_key, t]));

    // Determine Round 1 order (columns)
    const round1 = draftItems.filter((d) => Number(d.round) === 1).sort((a, b) => a.pick - b.pick);
    const columnOrder = round1.map((d) => d.team_key);

    // Determine number of rounds
    const maxRound = draftItems.reduce((m, d) => Math.max(m, Number(d.round) || 0), 0);

    // Map picks by (team_key, round)
    const pickMap = new Map(); // `${team_key}|${round}` -> player_key
    for (const d of draftItems) {
      pickMap.set(`${d.team_key}|${d.round}`, d.player_key);
    }

    const board = [];
    for (let r = 1; r <= maxRound; r++) {
      const row = columnOrder.map((team_key) => ({
        team_key,
        player_key: pickMap.get(`${team_key}|${r}`) ?? null,
      }));
      board.push({ round: r, picks: row });
    }

    res.json({
      leagueName,
      week: week ?? null,
      columns: columnOrder.map((team_key) => ({
        team_key,
        name: teamMetaByKey[team_key]?.name ?? team_key,
        logo_url: teamMetaByKey[team_key]?.logo_url ?? null,
        manager: teamMetaByKey[team_key]?.manager ?? null,
      })),
      rounds: board,
    });
  } catch (err) {
    console.error("Draft board data error:", err);
    res.status(500).json({ error: "Failed to build draft board data", details: err.body || String(err) });
  }
});

// -----------------------------
// FRONTEND STATIC FILES
// -----------------------------
const frontendPath = path.join(__dirname, "backend", "public", "frontend");
app.use(express.static(frontendPath));

// IMPORTANT: keep this LAST, after all API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// -----------------------------
// START SERVER
// -----------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
