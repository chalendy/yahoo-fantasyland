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
//  DRAFTBOARD DATA (normalized for draft.js)
//  GET /draftboard-data?week=17
// -----------------------------
app.get("/draftboard-data", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const week = req.query.week ? String(req.query.week) : null;

    const draftUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`;
    const rosterUrl =
      week && week.trim()
        ? `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster;week=${encodeURIComponent(
            week
          )}?format=json`
        : `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster?format=json`;

    const [draftRes, rosterRes] = await Promise.all([
      doFetch(draftUrl, { headers: { Authorization: `Bearer ${accessToken}` } }),
      doFetch(rosterUrl, { headers: { Authorization: `Bearer ${accessToken}` } }),
    ]);

    const draftText = await draftRes.text();
    const rosterText = await rosterRes.text();

    if (!draftRes.ok) return res.status(500).json({ error: "Yahoo API error (draft)", body: draftText });
    if (!rosterRes.ok) return res.status(500).json({ error: "Yahoo API error (rosters)", body: rosterText });

    const draftJson = JSON.parse(draftText);
    const rosterJson = JSON.parse(rosterText);

    // -------- Parse Draft Results --------
    const draftResultsObj = draftJson?.fantasy_content?.league?.[1]?.draft_results;
    const totalPicks = Number(draftResultsObj?.count || 0);

    const draftPicks = [];
    if (draftResultsObj) {
      for (const [k, v] of Object.entries(draftResultsObj)) {
        if (k === "count") continue;
        const dr = v?.draft_result;
        if (dr) {
          draftPicks.push({
            pick: Number(dr.pick),
            round: Number(dr.round),
            team_key: String(dr.team_key),
            player_key: String(dr.player_key),
          });
        }
      }
    }

    draftPicks.sort((a, b) => a.pick - b.pick);

    const maxRound = draftPicks.reduce((m, p) => Math.max(m, p.round), 0);

    // draftOrder = round 1 team order (pick 1..N)
    const round1 = draftPicks.filter((p) => p.round === 1).sort((a, b) => a.pick - b.pick);
    const draftOrder = round1.map((p) => p.team_key);

    // -------- Build player lookup from rosters (best-effort) --------
    // NOTE: roster is "current roster for week", so trades can affect matching.
    // We'll still use it to get names/pos/team when possible.
    const playerByKey = new Map();

    const teamsObj = rosterJson?.fantasy_content?.league?.[1]?.teams;
    const teamsByKey = {};

    if (teamsObj) {
      for (const [k, v] of Object.entries(teamsObj)) {
        if (k === "count") continue;

        const teamArr = v?.team;
        if (!Array.isArray(teamArr)) continue;

        const metaArr = teamArr[0] || [];
        const rosterBlock = teamArr[1]?.roster;

        const teamKey = metaArr?.find?.((x) => x?.team_key)?.team_key || metaArr?.[0]?.team_key;
        const teamName = metaArr?.find?.((x) => x?.name)?.name || metaArr?.[2]?.name || "Team";
        const logos = metaArr?.find?.((x) => x?.team_logos)?.team_logos;
        const logoUrl = logos?.[0]?.team_logo?.url || null;

        if (teamKey) {
          teamsByKey[teamKey] = { team_key: teamKey, name: teamName, logo_url: logoUrl };
        }

        // players live under rosterBlock["0"].players ...
        if (rosterBlock) {
          for (const [rk, rv] of Object.entries(rosterBlock)) {
            if (rk === "coverage_type" || rk === "week" || rk === "is_prescoring" || rk === "is_editable") continue;
            const playersObj = rv?.players;
            if (!playersObj) continue;

            for (const [pk, pv] of Object.entries(playersObj)) {
              if (pk === "count") continue;
              const playerArr = pv?.player;
              if (!Array.isArray(playerArr)) continue;

              const pMeta = playerArr[0] || [];
              const pKey = pMeta?.find?.((x) => x?.player_key)?.player_key || pMeta?.[0]?.player_key;
              const pNameObj = pMeta?.find?.((x) => x?.name)?.name;
              const pName = pNameObj?.full || null;

              const displayPos = pMeta?.find?.((x) => x?.display_position)?.display_position || null;
              const teamAbbr = pMeta?.find?.((x) => x?.editorial_team_abbr)?.editorial_team_abbr || null;

              if (pKey && pName) {
                playerByKey.set(pKey, {
                  player_key: pKey,
                  player_name: pName,
                  player_pos: displayPos || "",
                  player_team: teamAbbr || "",
                });
              }
            }
          }
        }
      }
    }

    // -------- Convert to rounds array shape your draft.js expects --------
    const rounds = [];
    for (let r = 1; r <= maxRound; r++) {
      const picks = draftPicks
        .filter((p) => p.round === r)
        .map((p) => {
          const info = playerByKey.get(p.player_key);
          return {
            pick: p.pick,
            round: p.round,
            team_key: p.team_key,
            player_key: p.player_key,
            player_name: info?.player_name || p.player_key, // fallback
            player_pos: info?.player_pos || "",
            player_team: info?.player_team || "",
          };
        });

      rounds.push({ round: r, picks });
    }

    res.json({
      meta: { totalPicks, maxRound, week: week || null },
      draftOrder,
      rounds,
      teamsByKey,
    });
  } catch (err) {
    console.error("Draftboard-data error:", err);
    res.status(500).json({ error: "Failed to build draft board data" });
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
