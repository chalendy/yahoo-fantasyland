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
app.get("/scoreboard", async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: "Not authenticated. Please click Sign In first." });
  }

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
    if (!apiRes.ok) {
      return res.status(500).json({ error: "Yahoo API error", body: bodyText });
    }

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
  if (!accessToken) {
    return res.status(401).json({ error: "Not authenticated." });
  }

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
  if (!accessToken) {
    return res.status(401).json({ error: "Not authenticated." });
  }

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

// =====================================================
//  DRAFT + ROSTERS ROUTES (NEW)
// =====================================================

// Raw draftresults JSON
app.get("/draftresults-raw", async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: "Not authenticated." });

  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`;
    const apiRes = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const bodyText = await apiRes.text();
    if (!apiRes.ok) return res.status(500).json({ error: "Yahoo API error", body: bodyText });
    res.type("application/json").send(bodyText);
  } catch (err) {
    console.error("Draftresults fetch error:", err);
    res.status(500).json({ error: "Failed to fetch draftresults" });
  }
});

// Raw rosters JSON (all teams). Supports ?week= (optional)
app.get("/rosters-raw", async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: "Not authenticated." });

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

// Combined draftboard data for frontend
app.get("/draftboard-data", async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: "Not authenticated." });

  try {
    // Fetch draftresults + rosters
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

    // --- Helpers to safely walk Yahoo JSON ---
    const getLeagueBlock = (obj) => obj?.fantasy_content?.league;
    const leagueArrDraft = getLeagueBlock(draftJson);
    const leagueArrRoster = getLeagueBlock(rosterJson);

    const draftResultsObj = leagueArrDraft?.[1]?.draft_results;
    const teamsObj = leagueArrRoster?.[1]?.teams;

    // Build: player_key -> {name,pos,teamAbbr}
    const playerMap = new Map();
    // Build: team_key -> {name, logo, manager}
    const teamMap = new Map();

    if (teamsObj) {
      const teamKeys = Object.keys(teamsObj).filter((k) => k !== "count");

      for (const idx of teamKeys) {
        const teamNode = teamsObj[idx]?.team;
        if (!Array.isArray(teamNode)) continue;

        const metaArr = teamNode[0] || [];
        const rosterBlock = teamNode[1]?.roster;

        const team_key = metaArr?.find?.((x) => x?.team_key)?.team_key;
        const team_name = metaArr?.find?.((x) => x?.name)?.name;

        let team_logo = "";
        const logosObj = metaArr?.find?.((x) => x?.team_logos)?.team_logos;
        const maybeLogo = Array.isArray(logosObj) ? logosObj?.[0]?.team_logo?.url : "";
        if (typeof maybeLogo === "string") team_logo = maybeLogo;

        let manager = "";
        const mgrs = metaArr?.find?.((x) => x?.managers)?.managers;
        const maybeNick = mgrs?.[0]?.manager?.nickname;
        if (typeof maybeNick === "string") manager = maybeNick;

        if (team_key) {
          teamMap.set(team_key, { team_key, name: team_name || team_key, logo_url: team_logo, manager });
        }

        // roster players
        const playersObj = rosterBlock?.["0"]?.players;
        if (!playersObj) continue;

        const pKeys = Object.keys(playersObj).filter((k) => k !== "count");
        for (const pk of pKeys) {
          const pNode = playersObj[pk]?.player;
          if (!Array.isArray(pNode)) continue;
          const pMetaArr = pNode[0] || [];

          const player_key = pMetaArr?.find?.((x) => x?.player_key)?.player_key;
          const fullName = pMetaArr?.find?.((x) => x?.name)?.name?.full;
          const pos = pMetaArr?.find?.((x) => x?.display_position)?.display_position;
          const teamAbbr = pMetaArr?.find?.((x) => x?.editorial_team_abbr)?.editorial_team_abbr;

          if (player_key && fullName) {
            playerMap.set(player_key, {
              player_name: fullName,
              player_pos: pos || "",
              player_team: teamAbbr || "",
            });
          }
        }
      }
    }

    // Flatten draft results
    const picks = [];
    let totalPicks = 0;
    let maxRound = 0;

    if (draftResultsObj) {
      const keys = Object.keys(draftResultsObj).filter((k) => k !== "count");
      totalPicks = Number(draftResultsObj.count || keys.length);

      for (const k of keys) {
        const dr = draftResultsObj[k]?.draft_result;
        if (!dr) continue;

        const pickNum = Number(dr.pick);
        const roundNum = Number(dr.round);
        const team_key = dr.team_key;
        const player_key = dr.player_key;

        maxRound = Math.max(maxRound, roundNum);

        const mapped = playerMap.get(player_key);
        const mappedName = mapped?.player_name || player_key;

        const isUnmapped = mappedName === player_key || /^(\d+\.)?(\w+\.)?p\./.test(mappedName) || /^461\.p\./.test(mappedName);
        // Your rule: if it didn't map, treat it like a keeper-style pick
        const is_keeper_guess = isUnmapped;

        picks.push({
          pick: pickNum,
          round: roundNum,
          team_key,
          player_key,
          player_name: mappedName,
          player_pos: mapped?.player_pos || "",
          player_team: mapped?.player_team || "",
          is_keeper_guess,
        });
      }

      // sort by overall pick #
      picks.sort((a, b) => a.pick - b.pick);
    }

    // Draft order from Round 1 picks by pick ascending
    const round1 = picks.filter((p) => p.round === 1).sort((a, b) => a.pick - b.pick);
    const draftOrder = round1.map((p) => p.team_key);

    // Group by rounds
    const rounds = [];
    for (let r = 1; r <= maxRound; r++) {
      rounds.push({
        round: r,
        picks: picks.filter((p) => p.round === r),
      });
    }

    // Teams aligned to draftOrder (so headers line up)
    const teams = draftOrder.map((tk) => teamMap.get(tk) || { team_key: tk, name: tk, logo_url: "", manager: "" });

    res.json({
      meta: { totalPicks: picks.length || totalPicks, maxRound },
      draftOrder,
      teams,
      rounds,
    });
  } catch (err) {
    console.error("Draftboard-data error:", err);
    res.status(500).json({ error: "Failed to build draft board data" });
  }
});

// =====================================================
//  FRONTEND STATIC FILES (KEEP LAST)
// =====================================================
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
