// Same-origin backend
const backendBase = "";

// --------- Elements ----------
const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const weekSelect = document.getElementById("weekSelect");

const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const standingsContainer = document.getElementById("standingsContainer");

const statusMessage = document.getElementById("statusMessage");
const weekLabel = document.getElementById("weekLabel");

// Optional standings header (for injecting sort UI)
const standingsHeader = document.querySelector(".standings-header");

let scoreboardData = null;
let currentWeek = null;

// Standings state
let standingsRows = [];
let standingsSortKey = "rank";
let standingsSortDir = "asc";

// --------- Helpers ----------
function setStatus(msg) {
  if (statusMessage) statusMessage.textContent = msg || "";
}

function pluckField(objArray, key) {
  if (!Array.isArray(objArray)) return null;
  for (const entry of objArray) {
    if (entry && Object.prototype.hasOwnProperty.call(entry, key)) return entry[key];
  }
  return null;
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatRecord(w, l, t) {
  const tw = w ?? "0";
  const tl = l ?? "0";
  const tt = t ?? "0";
  if (String(tt) === "0" || tt === 0) return `${tw}-${tl}`;
  return `${tw}-${tl}-${tt}`;
}

// --------- Auth ----------
if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// --------- Week dropdown population ----------
function populateWeekDropdown(meta) {
  if (!weekSelect) return;

  const startWeek = safeNumber(meta?.start_week, 1);
  const endWeek = safeNumber(meta?.end_week, meta?.current_week ?? 17);
  const selected = safeNumber(currentWeek ?? meta?.current_week, startWeek);

  // Build options once per refresh
  weekSelect.innerHTML = "";
  for (let w = startWeek; w <= endWeek; w++) {
    const opt = document.createElement("option");
    opt.value = String(w);
    opt.textContent = `Week ${w}`;
    if (w === selected) opt.selected = true;
    weekSelect.appendChild(opt);
  }
}

function updateWeekLabel(week) {
  if (weekLabel && week != null) weekLabel.textContent = `Week ${week}`;
}

// --------- Fetch scoreboard ----------
async function loadScoreboardJSON() {
  setStatus("Loading scoreboard JSON...");
  if (jsonOutput) jsonOutput.textContent = "Loading...";

  const res = await fetch(`${backendBase}/scoreboard`);
  if (!res.ok) {
    const text = await res.text();
    console.error("Scoreboard error:", res.status, text);
    if (jsonOutput) jsonOutput.textContent = `Error: ${res.status}\n${text}`;
    setStatus(res.status === 401 ? "Not authenticated. Click Sign In with Yahoo." : "Failed to load scoreboard JSON.");
    return null;
  }

  const data = await res.json();
  scoreboardData = data;

  if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

  // Determine current week from JSON (prefer league.current_week)
  const leagueArr = data?.fantasy_content?.league;
  const leagueMeta = Array.isArray(leagueArr) ? leagueArr[0] : null;
  const scoreboard = Array.isArray(leagueArr) ? leagueArr[1]?.scoreboard : null;

  currentWeek =
    safeNumber(leagueMeta?.current_week, null) ??
    safeNumber(scoreboard?.week, null);

  updateWeekLabel(currentWeek);
  populateWeekDropdown(leagueMeta);

  setStatus("Scoreboard JSON loaded.");
  return data;
}

// --------- Extract matchups from scoreboard JSON ----------
function extractMatchups(data) {
  try {
    const fc = data?.fantasy_content;
    const leagueArray = fc?.league;
    const leagueMeta = leagueArray?.[0];
    const scoreboard = leagueArray?.[1]?.scoreboard;

    const weekNumber = scoreboard?.week ?? leagueMeta?.current_week;

    // Scoreboard root: scoreboard["0"].matchups
    const root = scoreboard?.["0"];
    const matchupsObj = root?.matchups;

    if (!matchupsObj) return [];

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchupWrapper = matchupsObj[key];
        const matchup = matchupWrapper?.matchup;
        const matchupInner = matchup?.["0"];
        const teamsObj = matchupInner?.teams;

        const team0 = teamsObj?.["0"]?.team;
        const team1 = teamsObj?.["1"]?.team;
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

        // Hide "Playoffs" tag unless it's actually playoffs.
        // Yahoo includes is_playoffs as "1" or "0" per matchup.
        const isPlayoffs = matchupInner?.is_playoffs === "1" || matchupWrapper?.matchup?.is_playoffs === "1";

        result.push({
          week: weekNumber,
          isPlayoffs,
          teamA: { name: teamAName, logo: teamALogo, score: teamAScore, projected: teamAProj, winProbability: teamAProb },
          teamB: { name: teamBName, logo: teamBLogo, score: teamBScore, projected: teamBProj, winProbability: teamBProb },
        });
      });

    return result;
  } catch (err) {
    console.error("Error extracting matchups:", err);
    return [];
  }
}

// --------- Render matchups ----------
function renderMatchupCards(matchups) {
  if (!matchupsContainer) return;
  matchupsContainer.innerHTML = "";

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const teamAProbPct = m.teamA.winProbability != null ? Math.round(m.teamA.winProbability * 100) : null;
    const teamBProbPct = m.teamB.winProbability != null ? Math.round(m.teamB.winProbability * 100) : null;

    // Tag only if playoffs
    const tagHtml = m.isPlayoffs ? `<span class="matchup-tag">Playoffs</span>` : ``;

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">Week ${m.week ?? "?"}</span>
        ${tagHtml}
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
                Proj: ${m.teamA.projected}${teamAProbPct != null ? ` · Win%: ${teamAProbPct}%` : ""}
              </div>
            </div>
          </div>
          <div class="team-score">${m.teamA.score}</div>
        </div>

        <div class="vs-column">
          <span class="vs-pill">VS</span>
        </div>

        <div class="team-column">
          <div class="team-info team-info-right">
            <div>
              <div class="team-name">${m.teamB.name}</div>
              <div class="team-metadata">
                Proj: ${m.teamB.projected}${teamBProbPct != null ? ` · Win%: ${teamBProbPct}%` : ""}
              </div>
            </div>
            ${
              m.teamB.logo
                ? `<img src="${m.teamB.logo}" alt="${m.teamB.name}" class="team-logo" />`
                : `<div class="team-logo placeholder-logo">B</div>`
            }
          </div>
          <div class="team-score">${m.teamB.score}</div>
        </div>
      </div>
    `;

    matchupsContainer.appendChild(card);
  });
}

// --------- Standings: fetch + parse ----------
async function loadStandings() {
  if (!standingsContainer) return;

  // If not logged in, standings-raw returns 401.
  const res = await fetch(`${backendBase}/standings-raw`);
  if (!res.ok) {
    const text = await res.text();
    console.error("Standings error:", res.status, text);
    standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
    return;
  }

  // NOTE: standings-raw may send JSON as text
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse standings JSON:", e);
    standingsContainer.innerHTML = `<div class="standings-empty">Error parsing standings.</div>`;
    return;
  }

  standingsRows = extractStandingsRows(data);
  applyStandingsSort();
  renderStandings();
}

function extractStandingsRows(data) {
  try {
    const leagueArr = data?.fantasy_content?.league;
    const standingsBlock = leagueArr?.[1]?.standings?.[0]?.teams;
    if (!standingsBlock) return [];

    const rows = [];

    Object.keys(standingsBlock)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const team = standingsBlock[key]?.team;
        if (!team) return;

        const meta = team[0];
        const points = team[1]?.team_points;
        const standings = team[2]?.team_standings;

        const name = pluckField(meta, "name") || "Unknown Team";
        const logos = pluckField(meta, "team_logos");
        const logo = logos?.[0]?.team_logo?.url ?? null;

        const managersObj = pluckField(meta, "managers");
        const managerName = managersObj?.[0]?.manager?.nickname ?? "";

        const rank = standings?.rank ?? "";
        const wins = standings?.outcome_totals?.wins ?? "0";
        const losses = standings?.outcome_totals?.losses ?? "0";
        const ties = standings?.outcome_totals?.ties ?? "0";

        const pointsFor = standings?.points_for ?? points?.total ?? "0";
        const pointsAgainst = standings?.points_against ?? "0";

        rows.push({
          rank: safeNumber(rank, 999),
          name,
          managerName,
          record: { wins: safeNumber(wins, 0), losses: safeNumber(losses, 0), ties: safeNumber(ties, 0) },
          pf: safeNumber(pointsFor, 0),
          pa: safeNumber(pointsAgainst, 0),
          logo,
        });
      });

    return rows;
  } catch (err) {
    console.error("extractStandingsRows error:", err);
    return [];
  }
}

// --------- Standings: sorting UI ----------
function ensureStandingsSortUI() {
  if (!standingsHeader) return;

  // Already injected?
  if (document.getElementById("standingsSortSelect")) return;

  const controls = document.createElement("div");
  controls.className = "standings-sort-controls";

  controls.innerHTML = `
    <select id="standingsSortSelect" class="standings-sort-select" aria-label="Sort standings">
      <option value="rank">Yahoo Rank</option>
      <option value="pf">Points For</option>
      <option value="pa">Points Against</option>
      <option value="wins">Wins</option>
    </select>
    <button id="standingsSortDirBtn" class="standings-sort-dir" title="Toggle sort direction" aria-label="Toggle sort direction">
      <span id="standingsSortDirIcon">↑</span>
    </button>
  `;

  standingsHeader.appendChild(controls);

  const sel = document.getElementById("standingsSortSelect");
  const btn = document.getElementById("standingsSortDirBtn");
  const icon = document.getElementById("standingsSortDirIcon");

  if (sel) {
    sel.value = standingsSortKey;
    sel.addEventListener("change", () => {
      standingsSortKey = sel.value;
      applyStandingsSort();
      renderStandings();
    });
  }

  if (btn) {
    btn.addEventListener("click", () => {
      standingsSortDir = standingsSortDir === "asc" ? "desc" : "asc";
      if (icon) icon.textContent = standingsSortDir === "asc" ? "↑" : "↓";
      applyStandingsSort();
      renderStandings();
    });
  }
}

function applyStandingsSort() {
  const dir = standingsSortDir === "asc" ? 1 : -1;

  standingsRows.sort((a, b) => {
    if (standingsSortKey === "rank") return (a.rank - b.rank) * dir;
    if (standingsSortKey === "pf") return (a.pf - b.pf) * dir;
    if (standingsSortKey === "pa") return (a.pa - b.pa) * dir;
    if (standingsSortKey === "wins") return (a.record.wins - b.record.wins) * dir;
    return 0;
  });

  // Default: Rank should be ASC, others feel better as DESC
  // We'll keep user's chosen direction once they toggle it.
}

// --------- Render standings ----------
function renderStandings() {
  if (!standingsContainer) return;

  if (!standingsRows || standingsRows.length === 0) {
    standingsContainer.innerHTML = `<div class="standings-empty">No standings found.</div>`;
    return;
  }

  standingsContainer.innerHTML = "";

  standingsRows.forEach((r) => {
    const row = document.createElement("div");
    row.className = "standings-row";

    row.innerHTML = `
      <div class="standings-left">
        ${
          r.logo
            ? `<img class="standings-logo" src="${r.logo}" alt="${r.name}" />`
            : `<div class="standings-logo standings-logo--placeholder"></div>`
        }
        <div class="standings-name-wrap">
          <div class="standings-name-line">
            <span class="standings-rank">#${r.rank}</span>
            <span class="standings-name" title="${r.name}">${r.name}</span>
          </div>
          <div class="standings-sub">
            <span class="standings-record">${formatRecord(r.record.wins, r.record.losses, r.record.ties)}</span>
            ${r.managerName ? `<span class="standings-dot">·</span><span class="standings-manager">${r.managerName}</span>` : ""}
          </div>
        </div>
      </div>

      <div class="standings-right">
        <div class="standings-pf">${r.pf.toFixed(2)}</div>
        <div class="standings-pf-label">PF</div>
      </div>
    `;

    standingsContainer.appendChild(row);
  });
}

// --------- Button handlers ----------
if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    await loadScoreboardJSON();
    // After loading JSON, render matchups for whatever week is in JSON
    if (scoreboardData) {
      const matchups = extractMatchups(scoreboardData);
      if (matchups.length) {
        renderMatchupCards(matchups);
        setStatus(`Loaded ${matchups.length} matchups.`);
      } else {
        matchupsContainer && (matchupsContainer.innerHTML = "");
        setStatus("No matchups found for this week.");
      }
    }
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

// Week selection (client-side re-render)
if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    const selectedWeek = safeNumber(weekSelect.value, null);
    if (!selectedWeek) return;

    // If your backend supports week-specific scoreboard later, you can swap this to:
    // await loadScoreboardForWeek(selectedWeek)
    // For now: just re-render from current loaded scoreboard data if available.
    currentWeek = selectedWeek;
    updateWeekLabel(selectedWeek);

    if (!scoreboardData) {
      setStatus("Load Scoreboard JSON first.");
      return;
    }

    // Scoreboard JSON already corresponds to the league’s current_week.
    // If you later add server support (?week=), update this handler.
    const matchups = extractMatchups(scoreboardData);
    if (!matchups.length) {
      setStatus("No matchups found for this week.");
      if (matchupsContainer) matchupsContainer.innerHTML = "";
      return;
    }

    renderMatchupCards(matchups);
    setStatus(`Showing matchups (scoreboard data).`);
  });
}

// --------- Auto-load ----------
async function boot() {
  ensureStandingsSortUI();

  // Try loading scoreboard + standings on page load.
  // If user isn't authenticated yet, scoreboard will 401; we show a friendly status.
  try {
    const data = await loadScoreboardJSON();
    if (data) {
      const matchups = extractMatchups(data);
      if (matchups.length) renderMatchupCards(matchups);
    }
  } catch (e) {
    // loadScoreboardJSON already prints status
  }

  try {
    await loadStandings();
  } catch (e) {
    console.error("Standings load error:", e);
  }
}

window.addEventListener("DOMContentLoaded", boot);
