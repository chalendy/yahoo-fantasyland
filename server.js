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

// -----------------------------
//  DRAFT RESULTS RAW
// -----------------------------
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

// -----------------------------
//  ROSTERS RAW (supports ?week=)  <-- we will use week=1 for keeper truth
// -----------------------------
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

// -----------------------------
//  DRAFTBOARD DATA (merged + enriched)
//  - includes team names/logos
//  - includes player names/pos/team/headshot from roster where possible
//  - keeper flag from roster week=1 (fallback if unmapped)
// -----------------------------
app.get("/draftboard-data", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const [draftRes, rosterRes] = await Promise.all([
      doFetch(`https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      doFetch(`https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster;week=1?format=json`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);

    const draftText = await draftRes.text();
    const rosterText = await rosterRes.text();

    if (!draftRes.ok) return res.status(500).json({ error: "Yahoo API error (draftresults)", body: draftText });
    if (!rosterRes.ok) return res.status(500).json({ error: "Yahoo API error (rosters)", body: rosterText });

    const draftJson = JSON.parse(draftText);
    const rosterJson = JSON.parse(rosterText);

    // ---- parse rosters: build player lookup + keeper set + team meta
    const playerLookup = new Map(); // player_key -> { player_name, player_pos, player_team, player_headshot }
    const keeperSet = new Set(); // player_key that Yahoo flags as keeper in week 1 roster
    const teamsMeta = {}; // team_key -> { name, logo_url }

    const teamsBlock = rosterJson?.fantasy_content?.league?.[1]?.teams;
    if (teamsBlock) {
      for (const k of Object.keys(teamsBlock)) {
        const t = teamsBlock[k]?.team;
        if (!Array.isArray(t)) continue;

        const teamInfoArr = t[0] || [];
        const rosterObj = t[1]?.roster;

        const team_key = teamInfoArr?.find?.((x) => x?.team_key)?.team_key;
        const team_name = teamInfoArr?.find?.((x) => x?.name)?.name;

        let logo_url = "";
        const logos = teamInfoArr?.find?.((x) => x?.team_logos)?.team_logos;
        if (Array.isArray(logos) && logos[0]?.team_logo?.url) logo_url = logos[0].team_logo.url;

        if (team_key) {
          teamsMeta[team_key] = {
            name: team_name || team_key,
            logo_url,
          };
        }

        const playersBlock = rosterObj?.[0]?.players;
        if (!playersBlock) continue;

        for (const pk of Object.keys(playersBlock)) {
          const playerArr = playersBlock[pk]?.player;
          if (!Array.isArray(playerArr) || !Array.isArray(playerArr[0])) continue;

          const fields = playerArr[0];

          const player_key = fields?.find?.((x) => x?.player_key)?.player_key;
          const nameObj = fields?.find?.((x) => x?.name)?.name;
          const display_position = fields?.find?.((x) => x?.display_position)?.display_position;
          const editorial_team_abbr = fields?.find?.((x) => x?.editorial_team_abbr)?.editorial_team_abbr;

          const headshotObj = fields?.find?.((x) => x?.headshot)?.headshot;
          const imageUrlObj = fields?.find?.((x) => x?.image_url)?.image_url;

          // Prefer headshot.url, fallback to image_url (Yahoo sometimes duplicates)
          const player_headshot =
            (headshotObj && typeof headshotObj.url === "string" && headshotObj.url) ||
            (typeof imageUrlObj === "string" && imageUrlObj) ||
            "";

          const is_keeper = fields?.find?.((x) => x?.is_keeper)?.is_keeper?.status === true;

          if (player_key) {
            playerLookup.set(player_key, {
              player_name: nameObj?.full || player_key,
              player_pos: display_position || "",
              player_team: editorial_team_abbr || "",
              player_headshot,
            });
            if (is_keeper) keeperSet.add(player_key);
          }
        }
      }
    }

    // ---- parse draft results
    const draftResultsBlock = draftJson?.fantasy_content?.league?.[1]?.draft_results;
    const allDraft = [];
    let maxRound = 0;

    for (const idx of Object.keys(draftResultsBlock || {})) {
      if (idx === "count") continue;
      const dr = draftResultsBlock[idx]?.draft_result;
      if (!dr) continue;

      const pick = Number(dr.pick);
      const round = Number(dr.round);
      const team_key = dr.team_key;
      const player_key = dr.player_key;

      maxRound = Math.max(maxRound, round);

      const mapped = playerLookup.get(player_key);

      allDraft.push({
        pick,
        round,
        team_key,
        player_key,
        player_name: mapped?.player_name || player_key,
        player_pos: mapped?.player_pos || "",
        player_team: mapped?.player_team || "",
        player_headshot: mapped?.player_headshot || "",
        // keeper: from week-1 keeper flag if known, otherwise fallback to "unmapped => keeper-ish"
        is_keeper: keeperSet.has(player_key) || !mapped,
      });
    }

    allDraft.sort((a, b) => a.pick - b.pick);

    // draft order = round 1 order
    const draftOrder = allDraft
      .filter((p) => p.round === 1)
      .sort((a, b) => a.pick - b.pick)
      .map((p) => p.team_key);

    // group by rounds
    const roundsMap = new Map();
    for (const p of allDraft) {
      if (!roundsMap.has(p.round)) roundsMap.set(p.round, []);
      roundsMap.get(p.round).push(p);
    }

    const rounds = [];
    for (let r = 1; r <= maxRound; r++) {
      rounds.push({
        round: r,
        picks: (roundsMap.get(r) || []).slice().sort((a, b) => a.pick - b.pick),
      });
    }

    res.json({
      meta: { totalPicks: allDraft.length, maxRound },
      draftOrder,
      rounds,
      teams: teamsMeta, // stable team names/logos
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
