// Same-origin backend (Render serves frontend + backend)
const backendBase = "";

// UI elements
const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const standingsContainer = document.getElementById("standingsContainer");
const statusMessage = document.getElementById("statusMessage");
const weekLabel = document.getElementById("weekLabel");
const weekSelect = document.getElementById("weekSelect");

let scoreboardData = null;
let standingsData = null;
let currentSelectedWeek = null;

// -------- Helpers --------

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

function toNumberMaybe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Playoff labeling (you said playoffs start week 15)
function getPlayoffRoundLabel(weekNumber) {
  const w = toNumberMaybe(weekNumber);
  if (w === null) return "Playoffs";
  if (w === 15) return "Quarterfinal";
  if (w === 16) return "Semifinal";
  if (w === 17) return "Final";
  return "Playoffs";
}

// -------- Auth --------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// -------- Fetching --------

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    // Try to show the server's JSON error if possible
    let errPayload = text;
    try {
      errPayload = JSON.stringify(JSON.parse(text), null, 2);
    } catch (_) {}
    throw new Error(`${res.status} ${res.statusText}\n${errPayload}`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse JSON from ${url}\n${text}`);
  }
}

async function loadScoreboardForWeek(week) {
  const weekParam = week != null ? `?week=${encodeURIComponent(week)}` : "";
  const url = `${backendBase}/scoreboard${weekParam}`;
  const data = await fetchJson(url);
  scoreboardData = data;
  return data;
}

async function loadStandings() {
  // Your server route is /standings-raw (and it returns JSON text)
  const url = `${backendBase}/standings-raw`;
  const data = await fetchJson(url);
  standingsData = data;
  return data;
}

// -------- Week Dropdown --------

function buildWeekOptionsFromLeagueMeta(leagueMeta) {
  const startWeek = toNumberMaybe(leagueMeta?.start_week) ?? 1;
  const endWeek = toNumberMaybe(leagueMeta?.end_week) ?? 17;
  const currentWeek = toNumberMaybe(leagueMeta?.current_week) ?? endWeek;

  const weeks = [];
  for (let w = startWeek; w <= endWeek; w++) weeks.push(w);

  return { weeks, currentWeek, startWeek, endWeek };
}

function populateWeekDropdown(leagueMeta, preferredWeek) {
  if (!weekSelect) return;

  const { weeks, currentWeek } = buildWeekOptionsFromLeagueMeta(leagueMeta);

  weekSelect.innerHTML = "";
  for (const w of weeks) {
    const opt = document.createElement("option");
    opt.value = String(w);
    opt.textContent = `Week ${w}`;
    weekSelect.appendChild(opt);
  }

  const chosen = preferredWeek ?? currentSelectedWeek ?? currentWeek;
  currentSelectedWeek = chosen;
  weekSelect.value = String(chosen);
}

// -------- Scoreboard Parsing --------

function extractLeagueMeta(scoreboardJson) {
  const leagueArray = scoreboardJson?.fantasy_content?.league;
  if (!Array.isArray(leagueArray) || !leagueArray[0]) return null;
  return leagueArray[0];
}

function extractScoreboardObj(scoreboardJson) {
  const leagueArray = scoreboardJson?.fantasy_content?.league;
  if (!Array.isArray(leagueArray) || !leagueArray[1]?.scoreboard) return null;
  return leagueArray[1].scoreboard;
}

function extractMatchups(scoreboardJson) {
  try {
    const leagueMeta = extractLeagueMeta(scoreboardJson);
    const scoreboard = extractScoreboardObj(scoreboardJson);
    if (!leagueMeta || !scoreboard) return [];

    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot?.matchups;
    if (!matchupsObj) return [];

    const weekNumber = scoreboard?.week ?? leagueMeta?.current_week ?? currentSelectedWeek;

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchupWrapper = matchupsObj[key];
        const matchup = matchupWrapper?.matchup;
        const matchupInner = matchup?.["0"];
        if (!matchupInner?.teams) return;

        const teamsObj = matchupInner.teams;
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

        // matchup-level flags
        const isPlayoffs = safeText(matchupInner?.is_playoffs, "0") === "1";
        const playoffLabel = isPlayoffs ? getPlayoffRoundLabel(weekNumber) : null;

        result.push({
          week: weekNumber,
          isPlayoffs,
          playoffLabel,
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

// -------- Rendering: Matchups --------
// NOTE: Removes the redundant "Week X" inside each card.
// Adds playoff tag only when playoffs, using Quarterfinal/Semifinal/Final.
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

    // Header row: ONLY show playoff tag when applicable (no Week label here)
    const headerRow = `
      <div class="matchup-header-row">
        <span class="matchup-week-label"></span>
        ${
          m.isPlayoffs && m.playoffLabel
            ? `<span class="matchup-tag">${m.playoffLabel}</span>`
            : `<span></span>`
        }
      </div>
    `;

    card.innerHTML = `
      ${headerRow}

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
                Proj: ${m.teamA.projected}
                ${teamAProbPct != null ? ` · Win%: ${teamAProbPct}%` : ""}
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
                Proj: ${m.teamB.projected}
                ${teamBProbPct != null ? ` · Win%: ${teamBProbPct}%` : ""}
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

// -------- Standings Parsing + Rendering --------
// Uses the standings JSON you pasted (fantasy_content.league[1].standings[0].teams[...].team)
function extractStandings(standingsJson) {
  try {
    const leagueArr = standingsJson?.fantasy_content?.league;
    const standingsBlock = leagueArr?.[1]?.standings?.[0];
    const teamsObj = standingsBlock?.teams;
    if (!teamsObj) return [];

    const rows = [];
    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const teamArr = teamsObj[k]?.team;
        if (!Array.isArray(teamArr)) return;

        const meta = teamArr[0]; // array of objects (team_key, name, logos, managers, etc)
        const pointsObj = teamArr[1]?.team_points;
        const standingsObj = teamArr[2]?.team_standings;

        const name = pluckField(meta, "name") || "Unknown Team";
        const logos = pluckField(meta, "team_logos");
        const logo = logos?.[0]?.team_logo?.url ?? null;

        const managers = pluckField(meta, "managers");
        const managerNickname =
          managers?.[0]?.manager?.nickname ??
          managers?.[0]?.manager?.manager_id ??
          "";

        const rank = standingsObj?.rank ?? "";
        const wins = standingsObj?.outcome_totals?.wins ?? "";
        const losses = standingsObj?.outcome_totals?.losses ?? "";
        const ties = standingsObj?.outcome_totals?.ties ?? 0;

        const pf = standingsObj?.points_for ?? pointsObj?.total ?? "";
        const pa = standingsObj?.points_against ?? "";

        rows.push({
          rank: toNumberMaybe(rank) ?? 999,
          rankText: String(rank || ""),
          name,
          logo,
          manager: managerNickname,
          record: `${wins}-${losses}${Number(ties) ? `-${ties}` : ""}`,
          pf: typeof pf === "number" ? pf.toFixed(2) : String(pf || ""),
          pa: typeof pa === "number" ? pa.toFixed(2) : String(pa || ""),
        });
      });

    // Default sort by Yahoo rank
    rows.sort((a, b) => a.rank - b.rank);
    return rows;
  } catch (e) {
    console.error("extractStandings error:", e);
    return [];
  }
}

function renderStandingsUltraCompact(rows) {
  if (!standingsContainer) return;

  if (!rows || rows.length === 0) {
    standingsContainer.innerHTML = `<div style="color: rgba(255,255,255,0.65); font-size:0.85rem;">No standings found.</div>`;
    return;
  }

  // Keep your ultra-compact look by keeping markup simple;
  // your CSS should target .standings-row / .standings-left / .standings-right
  standingsContainer.innerHTML = rows
    .map((r) => {
      const logoHtml = r.logo
        ? `<img src="${r.logo}" alt="${r.name}" class="standings-logo" />`
        : `<div class="standings-logo standings-logo--placeholder">•</div>`;

      return `
        <div class="standings-row">
          <div class="standings-left">
            ${logoHtml}
            <div class="standings-text">
              <div class="standings-title">
                <span class="standings-rank">#${r.rankText}</span>
                <span class="standings-name" title="${r.name}">${r.name}</span>
              </div>
              <div class="standings-sub">
                <span class="standings-record">${r.record}</span>
                <span class="standings-dot">·</span>
                <span class="standings-manager">${r.manager}</span>
              </div>
            </div>
          </div>
          <div class="standings-right">
            <div class="standings-pf">${r.pf}</div>
            <div class="standings-pf-label">PF</div>
          </div>
        </div>
      `;
    })
    .join("");
}

// -------- Buttons (manual) --------

if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    try {
      setStatus("Loading scoreboard JSON...");
      if (jsonOutput) jsonOutput.textContent = "Loading...";

      const data = await loadScoreboardForWeek(currentSelectedWeek);

      if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);
      setStatus("Scoreboard JSON loaded successfully.");

      const leagueMeta = extractLeagueMeta(data);
      if (leagueMeta) {
        populateWeekDropdown(leagueMeta, currentSelectedWeek);
      }

      // Update top week label
      const sb = extractScoreboardObj(data);
      const week = sb?.week ?? leagueMeta?.current_week ?? currentSelectedWeek;
      if (weekLabel && week != null) weekLabel.textContent = `Week ${week}`;

    } catch (err) {
      console.error(err);
      if (jsonOutput) jsonOutput.textContent = String(err);
      setStatus("Failed to load scoreboard JSON.");
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
    setStatus(`Showing ${matchups.length} matchups.`);
  });
}

// Week dropdown change -> fetch that week and re-render matchups + JSON
if (weekSelect) {
  weekSelect.addEventListener("change", async (e) => {
    const newWeek = Number(e.target.value);
    currentSelectedWeek = newWeek;

    try {
      setStatus(`Loading Week ${newWeek}...`);

      const data = await loadScoreboardForWeek(newWeek);

      // Update debug JSON
      if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

      // Update top week label from the returned scoreboard (authoritative)
      const leagueMeta = extractLeagueMeta(data);
      const sb = extractScoreboardObj(data);
      const returnedWeek = sb?.week ?? newWeek;

      if (weekLabel) weekLabel.textContent = `Week ${returnedWeek}`;

      // Render matchups for that week
      const matchups = extractMatchups(data);
      renderMatchupCards(matchups);

      setStatus(`Loaded Week ${returnedWeek} matchups (${matchups.length}).`);
    } catch (err) {
      console.error("Week change error:", err);
      setStatus("Error loading selected week.");
    }
  });
}

// -------- Auto-load on page load --------

async function autoLoadEverything() {
  try {
    setStatus("Loading standings + scoreboard...");

    // Load standings first (independent of week)
    try {
      const sData = await loadStandings();
      const sRows = extractStandings(sData);
      renderStandingsUltraCompact(sRows);
    } catch (e) {
      console.warn("Standings load failed:", e);
      if (standingsContainer) {
        standingsContainer.innerHTML = `<div style="color: rgba(255,255,255,0.65); font-size:0.85rem;">Error loading standings.</div>`;
      }
    }

    // Load scoreboard for "current week" based on league meta
    // Step 1: load without a week param to get leagueMeta.current_week
    const first = await loadScoreboardForWeek(null);
    const leagueMeta = extractLeagueMeta(first);
    const sb = extractScoreboardObj(first);

    const metaWeek = toNumberMaybe(leagueMeta?.current_week);
    const sbWeek = toNumberMaybe(sb?.week);
    const defaultWeek = sbWeek ?? metaWeek ?? 1;

    // Populate dropdown + set selection
    if (leagueMeta) {
      populateWeekDropdown(leagueMeta, defaultWeek);
    }
    currentSelectedWeek = defaultWeek;

    // Step 2: load again for the selected/default week to ensure correct matchups
    const data = await loadScoreboardForWeek(defaultWeek);

    // Debug JSON (optional)
    if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

    // Update top week label
    const sb2 = extractScoreboardObj(data);
    const shownWeek = sb2?.week ?? defaultWeek;
    if (weekLabel) weekLabel.textContent = `Week ${shownWeek}`;

    // Matchups
    const matchups = extractMatchups(data);
    renderMatchupCards(matchups);

    setStatus(`Loaded Week ${shownWeek}: ${matchups.length} matchups.`);
  } catch (err) {
    console.error("Auto load error:", err);
    setStatus("Not authenticated yet. Click “Sign In with Yahoo”.");
  }
}

window.addEventListener("DOMContentLoaded", autoLoadEverything);
