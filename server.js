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
//  DRAFTBOARD DATA (frontend-friendly)
//  - teamsByKey: team name/logo/manager (from week 1 rosters)
//  - keeper flags: from week 1 roster is_keeper.status === true
//  - player name fallback: from week 1 roster player map if draftresults lacks it
// -----------------------------
app.get("/draftboard-data", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    // 1) draft results
    const draftUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/draftresults?format=json`;
    const draftRes = await doFetch(draftUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const draftText = await draftRes.text();
    if (!draftRes.ok) return res.status(500).json({ error: "Yahoo API error (draft)", body: draftText });
    const draftJson = JSON.parse(draftText);

    // 2) rosters week 1 (for team names/logos + keeper flags + name fallback)
    const rosterUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/teams/roster;week=1?format=json`;
    const rosterRes = await doFetch(rosterUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const rosterText = await rosterRes.text();
    if (!rosterRes.ok) return res.status(500).json({ error: "Yahoo API error (rosters)", body: rosterText });
    const rosterJson = JSON.parse(rosterText);

    // ---------- helpers to deal with Yahoo's arrays-of-objects structure ----------
    const getFromTeamBlock = (teamArr, key) => {
      // teamArr is like: [ [ {team_key...}, {team_id...}, {name...}, ... ], { roster: {...} } ]
      // team meta is inside teamArr[0] (array)
      const metaList = teamArr?.[0];
      if (!Array.isArray(metaList)) return null;
      const found = metaList.find((o) => o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, key));
      return found ? found[key] : null;
    };

    const getTeamLogoUrl = (teamArr) => {
      const logos = getFromTeamBlock(teamArr, "team_logos");
      const url = logos?.[0]?.team_logo?.url;
      return typeof url === "string" ? url : "";
    };

    const getTeamManagerNick = (teamArr) => {
      const managers = getFromTeamBlock(teamArr, "managers");
      const nick = managers?.[0]?.manager?.nickname;
      return typeof nick === "string" ? nick : "";
    };

    // Build teamsByKey + playerMap + keeperSet from week1 rosters
    const teamsByKey = {};
    const playerMap = {}; // player_key -> { name, pos, teamAbbr }
    const keeperSet = new Set();

    const teamsObj = rosterJson?.fantasy_content?.league?.[1]?.teams;
    const teamCount = teamsObj?.count || 0;

    for (let i = 0; i < teamCount; i++) {
      const teamArr = teamsObj?.[String(i)]?.team;
      if (!teamArr) continue;

      const team_key = getFromTeamBlock(teamArr, "team_key");
      const name = getFromTeamBlock(teamArr, "name") || "";
      const logo_url = getTeamLogoUrl(teamArr);
      const manager = getTeamManagerNick(teamArr);

      if (team_key) {
        teamsByKey[team_key] = { team_key, name, logo_url, manager };
      }

      // roster players
      const roster = teamArr?.[1]?.roster;
      // roster has numeric keys "0","1","2"... each contains { players: {...} }
      if (!roster) continue;

      const rosterSlots = Object.keys(roster).filter((k) => /^\d+$/.test(k));
      for (const slotKey of rosterSlots) {
        const playersObj = roster?.[slotKey]?.players;
        const pCount = playersObj?.count || 0;

        for (let p = 0; p < pCount; p++) {
          const playerArr = playersObj?.[String(p)]?.player;
          const meta = playerArr?.[0];
          if (!Array.isArray(meta)) continue;

          const pk = meta.find((x) => x?.player_key)?.player_key;
          const nm = meta.find((x) => x?.name)?.name?.full;
          const pos = meta.find((x) => x?.display_position)?.display_position;
          const abbr = meta.find((x) => x?.editorial_team_abbr)?.editorial_team_abbr;

          const isKeeperObj = meta.find((x) => x?.is_keeper)?.is_keeper;
          const isKeeper = !!isKeeperObj?.status;

          if (pk) {
            playerMap[pk] = {
              name: typeof nm === "string" ? nm : pk,
              pos: typeof pos === "string" ? pos : "",
              teamAbbr: typeof abbr === "string" ? abbr : "",
            };
            if (isKeeper) keeperSet.add(pk);
          }
        }
      }
    }

    // Parse draft results into rounds + determine draftOrder from Round 1
    const dr = draftJson?.fantasy_content?.league?.[1]?.draft_results;
    const totalPicks = dr?.count || 0;

    const picks = [];
    for (let i = 0; i < totalPicks; i++) {
      const d = dr?.[String(i)]?.draft_result;
      if (!d) continue;
      picks.push({
        pick: Number(d.pick),
        round: Number(d.round),
        team_key: d.team_key,
        player_key: d.player_key,
      });
    }

    const maxRound = picks.reduce((m, p) => Math.max(m, p.round || 0), 0);

    // draft order = sorted by pick within round 1
    const round1 = picks
      .filter((p) => p.round === 1)
      .sort((a, b) => (a.pick ?? 0) - (b.pick ?? 0));

    const draftOrder = round1.map((p) => p.team_key);

    // build rounds
    const rounds = [];
    for (let r = 1; r <= maxRound; r++) {
      const roundPicks = picks
        .filter((p) => p.round === r)
        .sort((a, b) => (a.pick ?? 0) - (b.pick ?? 0))
        .map((p) => {
          // name/pos/team from playerMap fallback
          const pm = playerMap[p.player_key] || null;

          const player_name = pm?.name || p.player_key;
          const player_pos = pm?.pos || "";
          const player_team = pm?.teamAbbr || "";

          return {
            ...p,
            player_name,
            player_pos,
            player_team,
            // keeper flag purely from week 1 roster keeper status
            is_keeper: keeperSet.has(p.player_key),
          };
        });

      rounds.push({ round: r, picks: roundPicks });
    }

    res.json({
      meta: { totalPicks, maxRound },
      teamsByKey, // ✅ this is what your frontend needs for names/logos
      draftOrder,
      rounds,
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
