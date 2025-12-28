// If frontend is served from the same origin as backend, we can use relative URLs
const backendBase = ""; // same origin

// UI elements
const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const weekSelect = document.getElementById("weekSelect");

const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const standingsContainer = document.getElementById("standingsContainer");

const statusMessage = document.getElementById("statusMessage");
const weekLabel = document.getElementById("weekLabel");

let scoreboardData = null;
let standingsData = null;

// ---------- Helpers ----------
function setStatus(msg) {
  if (statusMessage) statusMessage.textContent = msg || "";
}

function pluckField(objArray, key) {
  if (!Array.isArray(objArray)) return null;
  for (const entry of objArray) {
    if (entry && Object.prototype.hasOwnProperty.call(entry, key)) {
      return entry[key];
    }
  }
  return null;
}

function safeText(v, fallback = "") {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function getLeagueMetaFromScoreboard(data) {
  const leagueArr = data?.fantasy_content?.league;
  if (!Array.isArray(leagueArr) || leagueArr.length < 2) return null;
  return leagueArr[0] || null;
}

function getScoreboardNode(data) {
  const leagueArr = data?.fantasy_content?.league;
  if (!Array.isArray(leagueArr) || leagueArr.length < 2) return null;
  return leagueArr[1]?.scoreboard || null;
}

function getSelectedWeek() {
  if (!weekSelect) return null;
  const v = weekSelect.value;
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function setWeekUI(weekNum) {
  if (weekLabel && weekNum != null) weekLabel.textContent = `Week ${weekNum}`;
  if (weekSelect && weekNum != null) weekSelect.value = String(weekNum);
}

// ---------- Buttons ----------
if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    const week = getSelectedWeek();
    await loadScoreboardForWeek(week, { renderMatchups: true, updateJson: true });
  });
}

if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", () => {
    if (!scoreboardData) {
      setStatus("No scoreboard loaded yet. Click 'Load Scoreboard JSON' first.");
      return;
    }
    const matchups = extractMatchups(scoreboardData);
    if (!matchups || matchups.length === 0) {
      setStatus("No matchups found for this week.");
      if (matchupsContainer) matchupsContainer.innerHTML = "";
      return;
    }
    renderMatchupCards(matchups);
    setStatus(`Showing ${matchups.length} matchups for this week.`);
  });
}

// Week dropdown change
if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    const week = getSelectedWeek();
    await loadScoreboardForWeek(week, { renderMatchups: true, updateJson: false });
  });
}

// ---------- Data parsing (Matchups) ----------
function extractMatchups(data) {
  try {
    const leagueMeta = getLeagueMetaFromScoreboard(data);
    const scoreboard = getScoreboardNode(data);

    if (!scoreboard) return [];

    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot?.matchups;
    if (!matchupsObj) return [];

    // week can appear as scoreboard.week (number) or inside matchup wrapper as "week"
    const weekNumber =
      scoreboard.week ??
      leagueMeta?.matchup_week ??
      leagueMeta?.current_week ??
      null;

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchupWrapper = matchupsObj[key];
        const matchup = matchupWrapper?.matchup;
        const matchupInner = matchup?.["0"]; // contains teams + is_playoffs sometimes
        const teamsObj = matchupInner?.teams;
        if (!teamsObj) return;

        const team0 = teamsObj["0"]?.team;
        const team1 = teamsObj["1"]?.team;
        if (!team0 || !team1) return;

        const team0Meta = team0[0];
        const team0Stats = team0[1];
        const team1Meta = team1[0];
        const team1Stats = team1[1];

        const teamAName = pluckField(team0Meta, "name") || "Unknown Team";
        const teamBName = pluckField(team1Meta, "name") || "Unknown Team";

        const teamALogoObj = pluckField(team0Meta, "team_logos");
        const teamBLogoObj = pluckField(team1Meta, "team_logos");

        const teamALogo = teamALogoObj?.[0]?.team_logo?.url ?? null;
        const teamBLogo = teamBLogoObj?.[0]?.team_logo?.url ?? null;

        const teamAScore = team0Stats?.team_points?.total ?? "0.00";
        const teamBScore = team1Stats?.team_points?.total ?? "0.00";

        const teamAProj = team0Stats?.team_projected_points?.total ?? "0.00";
        const teamBProj = team1Stats?.team_projected_points?.total ?? "0.00";

        const teamAProb = team0Stats?.win_probability ?? null;
        const teamBProb = team1Stats?.win_probability ?? null;

        // playoffs flag comes from matchupInner.is_playoffs (string "1"/"0")
        const isPlayoffs = String(matchupInner?.is_playoffs ?? "0") === "1";

        result.push({
          week: String(matchupInner?.week ?? weekNumber ?? ""),
          isPlayoffs,
          teamA: {
            name: teamAName,
            logo: teamALogo,
            score: teamAScore,
            projected: teamAProj,
            winProbability: teamAProb,
          },
          teamB: {
            name: teamBName,
            logo: teamBLogo,
            score: teamBScore,
            projected: teamBProj,
            winProbability: teamBProb,
          },
        });
      });

    return result;
  } catch (err) {
    console.error("Error extracting matchups:", err);
    return [];
  }
}

// ---------- Rendering (Matchups) ----------
function renderMatchupCards(matchups) {
  if (!matchupsContainer) return;
  matchupsContainer.innerHTML = "";

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const teamAProbPct =
      m.teamA.winProbability != null ? Math.round(m.teamA.winProbability * 100) : null;
    const teamBProbPct =
      m.teamB.winProbability != null ? Math.round(m.teamB.winProbability * 100) : null;

    const showPlayoffsTag = !!m.isPlayoffs;

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">Week ${safeText(m.week, "?")}</span>
        ${showPlayoffsTag ? `<span class="matchup-tag">Playoffs</span>` : ``}
      </div>

      <div class="matchup-body">
        <div class="team-column">
          <div class="team-info">
            ${
              m.teamA.logo
                ? `<img src="${m.teamA.logo}" alt="${m.teamA.name}" class="team-logo" />`
                : `<div class="team-logo placeholder-logo">A</div>`
            }
            <div>
              <div class="team-name">${m.teamA.name}</div>
              <div class="team-metadata">
                Proj: ${safeText(m.teamA.projected, "0.00")}
                ${teamAProbPct != null ? ` · Win%: ${teamAProbPct}%` : ""}
              </div>
            </div>
          </div>
          <div class="team-score">${safeText(m.teamA.score, "0.00")}</div>
        </div>

        <div class="vs-column">
          <span class="vs-pill">VS</span>
        </div>

        <div class="team-column">
          <div class="team-info team-info-right">
            <div>
              <div class="team-name">${m.teamB.name}</div>
              <div class="team-metadata">
                Proj: ${safeText(m.teamB.projected, "0.00")}
                ${teamBProbPct != null ? ` · Win%: ${teamBProbPct}%` : ""}
              </div>
            </div>
            ${
              m.teamB.logo
                ? `<img src="${m.teamB.logo}" alt="${m.teamB.name}" class="team-logo" />`
                : `<div class="team-logo placeholder-logo">B</div>`
            }
          </div>
          <div class="team-score">${safeText(m.teamB.score, "0.00")}</div>
        </div>
      </div>
    `;

    matchupsContainer.appendChild(card);
  });
}

// ---------- Standings parsing + rendering ----------
function extractStandingsTeams(standingsJson) {
  try {
    const leagueArr = standingsJson?.fantasy_content?.league;
    const standingsNode = leagueArr?.[1]?.standings;
    const teamsObj = standingsNode?.[0]?.teams;
    if (!teamsObj) return [];

    const teams = [];

    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const teamArr = teamsObj[k]?.team;
        if (!Array.isArray(teamArr)) return;

        const meta = teamArr[0]; // array of objects/fields
        const pointsNode = teamArr[1];
        const standingsNode2 = teamArr[2];

        const name = pluckField(meta, "name") || "Unknown Team";
        const logos = pluckField(meta, "team_logos");
        const logo = logos?.[0]?.team_logo?.url ?? null;

        const managers = pluckField(meta, "managers");
        const managerName = managers?.[0]?.manager?.nickname ?? "";

        const standings = standingsNode2?.team_standings ?? {};
        const rank = standings?.rank != null ? parseInt(standings.rank, 10) : null;

        const outcome = standings?.outcome_totals || {};
        const wins = outcome?.wins ?? "0";
        const losses = outcome?.losses ?? "0";

        const pf = standings?.points_for ?? pointsNode?.team_points?.total ?? "0.00";

        teams.push({
          name,
          logo,
          managerName,
          rank,
          wins: parseInt(wins, 10),
          losses: parseInt(losses, 10),
          pf: parseFloat(pf),
        });
      });

    return teams;
  } catch (e) {
    console.error("extractStandingsTeams error:", e);
    return [];
  }
}

function renderStandings(teams) {
  if (!standingsContainer) return;
  standingsContainer.innerHTML = "";

  if (!teams || teams.length === 0) {
    standingsContainer.innerHTML = `<div class="standings-empty">No standings found.</div>`;
    return;
  }

  // default yahoo sorting: by rank asc
  const sorted = [...teams].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  const wrap = document.createElement("div");
  wrap.className = "standings-wrap";

  for (const t of sorted) {
    const row = document.createElement("div");
    row.className = "standings-row";

    row.innerHTML = `
      <div class="standings-left">
        ${
          t.logo
            ? `<img class="standings-logo" src="${t.logo}" alt="${t.name}" />`
            : `<div class="standings-logo standings-logo--placeholder">?</div>`
        }
        <div class="standings-nameblock">
          <div class="standings-topline">
            <span class="standings-rank">#${t.rank ?? "?"}</span>
            <span class="standings-teamname" title="${t.name}">${t.name}</span>
          </div>
          <div class="standings-subline">${t.wins}-${t.losses}${t.managerName ? ` · ${t.managerName}` : ""}</div>
        </div>
      </div>

      <div class="standings-right">
        <div class="standings-pf">${Number.isFinite(t.pf) ? t.pf.toFixed(2) : safeText(t.pf, "0.00")}</div>
        <div class="standings-pf-label">PF</div>
      </div>
    `;

    wrap.appendChild(row);
  }

  standingsContainer.appendChild(wrap);
}

// ---------- Network loaders ----------
async function loadStandings() {
  try {
    // Your server route is /standings-raw (not /standings)
    const res = await fetch(`${backendBase}/standings-raw`);
    if (!res.ok) {
      const txt = await res.text();
      console.error("Standings error:", res.status, txt);
      if (standingsContainer) standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
      return;
    }
    const data = await res.json();
    standingsData = data;
    const teams = extractStandingsTeams(data);
    renderStandings(teams);
  } catch (e) {
    console.error("Standings fetch error:", e);
    if (standingsContainer) standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
  }
}

async function loadScoreboardForWeek(week, opts = {}) {
  const { renderMatchups = true, updateJson = false } = opts;

  try {
    setStatus("Loading scoreboard...");

    const qs = week ? `?week=${encodeURIComponent(String(week))}` : "";
    const res = await fetch(`${backendBase}/scoreboard${qs}`);

    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);

      // If not authed, tell user to sign in
      if (res.status === 401) {
        setStatus("Not authenticated. Click 'Sign In with Yahoo' first.");
      } else {
        setStatus("Failed to load scoreboard.");
      }

      if (updateJson && jsonOutput) jsonOutput.textContent = `Error: ${res.status}\n${text}`;
      return;
    }

    const data = await res.json();
    scoreboardData = data;

    if (updateJson && jsonOutput) {
      jsonOutput.textContent = JSON.stringify(data, null, 2);
    }

    // populate week dropdown (once) from league meta
    const leagueMeta = getLeagueMetaFromScoreboard(data);
    if (leagueMeta) {
      const start = parseInt(leagueMeta.start_week, 10);
      const end = parseInt(leagueMeta.end_week, 10);
      const cur = parseInt(leagueMeta.current_week, 10);

      if (weekSelect && weekSelect.options.length === 0 && Number.isFinite(start) && Number.isFinite(end)) {
        for (let w = start; w <= end; w++) {
          const opt = document.createElement("option");
          opt.value = String(w);
          opt.textContent = `Week ${w}`;
          weekSelect.appendChild(opt);
        }
      }

      // what week did we actually load?
      const scoreboard = getScoreboardNode(data);
      const loadedWeek =
        parseInt(scoreboard?.week, 10) ||
        parseInt(leagueMeta.matchup_week, 10) ||
        (Number.isFinite(week) ? week : cur);

      setWeekUI(loadedWeek);
    }

    if (renderMatchups) {
      const matchups = extractMatchups(data);
      if (!matchups || matchups.length === 0) {
        setStatus("No matchups found for this week.");
        if (matchupsContainer) matchupsContainer.innerHTML = "";
      } else {
        renderMatchupCards(matchups);
        setStatus(`Loaded ${matchups.length} matchups.`);
      }
    }
  } catch (err) {
    console.error("Scoreboard fetch error:", err);
    setStatus("Error loading scoreboard.");
  }
}

// ---------- Auto load ----------
async function autoLoadEverything() {
  // Don’t spam 401s—try once; if not authed, user clicks Sign In.
  await loadScoreboardForWeek(null, { renderMatchups: true, updateJson: false });
  await loadStandings();
}

window.addEventListener("DOMContentLoaded", autoLoadEverything);
