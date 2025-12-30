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

// ======================================================
//  DRAFT + ROSTERS ENDPOINTS  (IMPORTANT: ABOVE STATIC/*)
// ======================================================

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
//  ROSTERS RAW (supports ?week=)
// -----------------------------
app.get("/rosters-raw", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const week = req.query.week ? String(req.query.week) : null;
    const url =
      week && week.trim()
        ? `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster;week=${encodeURIComponent(
            week
          )}?format=json`
        : `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster?format=json`;

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
//  DRAFTBOARD DATA (draftresults + rosters + fallback players lookup)
// -----------------------------
app.get("/draftboard-data", async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  try {
    // 1) Pull draft results
    const draftUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`;
    const draftRes = await doFetch(draftUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const draftText = await draftRes.text();
    if (!draftRes.ok) return res.status(500).json({ error: "Yahoo draftresults error", body: draftText });

    const draftJson = JSON.parse(draftText);

    // 2) Pull rosters (for player metadata)
    const rosterUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster?format=json`;
    const rosterRes = await doFetch(rosterUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const rosterText = await rosterRes.text();
    if (!rosterRes.ok) return res.status(500).json({ error: "Yahoo roster error", body: rosterText });

    const rosterJson = JSON.parse(rosterText);

    // -----------------------------
    // Helpers to safely walk Yahoo JSON
    // -----------------------------
    const safeArr = (v) => (Array.isArray(v) ? v : []);
    const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

    function extractDraftResults(draftRoot) {
      // draftRoot.fantasy_content.league[1].draft_results
      const league = safeArr(draftRoot?.fantasy_content?.league);
      const draftBlock = league[1]?.draft_results;
      if (!draftBlock || !isObj(draftBlock)) return [];

      const out = [];
      for (const k of Object.keys(draftBlock)) {
        if (k === "count") continue;
        const dr = draftBlock[k]?.draft_result;
        if (!dr) continue;
        out.push({
          pick: Number(dr.pick),
          round: Number(dr.round),
          team_key: dr.team_key,
          player_key: dr.player_key,
        });
      }

      // sort by pick overall
      out.sort((a, b) => a.pick - b.pick);
      return out;
    }

    function extractPlayersFromRosters(rosterRoot) {
      // rosterRoot.fantasy_content.league[1].teams
      const league = safeArr(rosterRoot?.fantasy_content?.league);
      const teamsBlock = league[1]?.teams;
      const playerMap = new Map(); // player_key -> { name, pos, teamAbbr }

      if (!teamsBlock || !isObj(teamsBlock)) return playerMap;

      for (const tKey of Object.keys(teamsBlock)) {
        if (tKey === "count") continue;

        const teamNode = teamsBlock[tKey]?.team;
        // teamNode is [ teamMetaArray, { roster: ... } ]
        const rosterObj = teamNode?.[1]?.roster;
        if (!rosterObj || !isObj(rosterObj)) continue;

        // rosterObj has numeric keys for players blocks
        for (const rk of Object.keys(rosterObj)) {
          if (!/^\d+$/.test(rk)) continue;
          const playersBlock = rosterObj[rk]?.players;
          if (!playersBlock || !isObj(playersBlock)) continue;

          for (const pk of Object.keys(playersBlock)) {
            if (pk === "count") continue;
            const playerNode = playersBlock[pk]?.player;
            if (!playerNode) continue;

            const meta = playerNode[0]; // array of objects
            const playerKeyObj = meta?.find((x) => x && x.player_key)?.player_key;
            const nameObj = meta?.find((x) => x && x.name)?.name;
            const displayPos = meta?.find((x) => x && x.display_position)?.display_position;
            const teamAbbr = meta?.find((x) => x && x.editorial_team_abbr)?.editorial_team_abbr;

            if (playerKeyObj) {
              playerMap.set(playerKeyObj, {
                player_name: nameObj?.full || "",
                player_pos: displayPos || "",
                player_team: teamAbbr || "",
              });
            }
          }
        }
      }

      return playerMap;
    }

    // 3) Parse
    const picks = extractDraftResults(draftJson);
    const rosterPlayerMap = extractPlayersFromRosters(rosterJson);

    // 4) Attach whatever we already know from rosters
    const enriched = picks.map((p) => {
      const info = rosterPlayerMap.get(p.player_key);
      return {
        ...p,
        player_name: info?.player_name || "",
        player_pos: info?.player_pos || "",
        player_team: info?.player_team || "",
      };
    });

    // 5) Find unresolved player keys and bulk fetch from /players
    const missingKeys = enriched
      .filter((p) => !p.player_name || p.player_name === p.player_key)
      .map((p) => p.player_key);

    // de-dupe
    const uniqMissing = [...new Set(missingKeys)];

    async function fetchPlayersBulk(playerKeys) {
      if (!playerKeys.length) return new Map();

      // Yahoo URLs can get long — chunk to be safe
      const CHUNK = 25;
      const out = new Map();

      for (let i = 0; i < playerKeys.length; i += CHUNK) {
        const chunk = playerKeys.slice(i, i + CHUNK);
        const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/players;player_keys=${encodeURIComponent(
          chunk.join(",")
        )}?format=json`;

        const r = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        const txt = await r.text();
        if (!r.ok) continue;

        const j = JSON.parse(txt);

        // players live at fantasy_content.league[1].players
        const league = safeArr(j?.fantasy_content?.league);
        const playersBlock = league[1]?.players;
        if (!playersBlock || !isObj(playersBlock)) continue;

        for (const pk of Object.keys(playersBlock)) {
          if (pk === "count") continue;
          const playerNode = playersBlock[pk]?.player;
          if (!playerNode) continue;

          const meta = playerNode[0];
          const pKey = meta?.find((x) => x && x.player_key)?.player_key;
          const name = meta?.find((x) => x && x.name)?.name?.full || "";
          const pos = meta?.find((x) => x && x.display_position)?.display_position || "";
          const team = meta?.find((x) => x && x.editorial_team_abbr)?.editorial_team_abbr || "";

          if (pKey) out.set(pKey, { player_name: name, player_pos: pos, player_team: team });
        }
      }

      return out;
    }

    const fallbackPlayerMap = await fetchPlayersBulk(uniqMissing);

    // 6) Apply fallback
    for (const p of enriched) {
      if (!p.player_name || p.player_name === p.player_key) {
        const info = fallbackPlayerMap.get(p.player_key);
        if (info?.player_name) {
          p.player_name = info.player_name;
          p.player_pos = info.player_pos || p.player_pos;
          p.player_team = info.player_team || p.player_team;
        }
      }

      // absolute last-resort fallback display
      if (!p.player_name) p.player_name = p.player_key;
    }

    // 7) Draft order = round 1 team keys in pick order
    const round1 = enriched.filter((p) => p.round === 1).sort((a, b) => a.pick - b.pick);
    const draftOrder = round1.map((p) => p.team_key);

    // max round
    const maxRound = Math.max(...enriched.map((p) => p.round), 1);

    // group by rounds
    const rounds = [];
    for (let r = 1; r <= maxRound; r++) {
      rounds.push({
        round: r,
        picks: enriched.filter((p) => p.round === r).sort((a, b) => a.pick - b.pick),
      });
    }

    res.json({
      meta: {
        totalPicks: enriched.length,
        maxRound,
      },
      draftOrder,
      rounds,
    });
  } catch (err) {
    console.error("Draftboard data error:", err);
    res.status(500).json({ error: "Failed to build draftboard data" });
  }
});

// -----------------------------
//  FRONTEND STATIC FILES
// -----------------------------
const frontendPath = path.join(__dirname, "backend", "public", "frontend");
app.use(express.static(frontendPath));

// IMPORTANT: This must remain LAST so it doesn't swallow API routes.
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// -----------------------------
//  START SERVER
// -----------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
