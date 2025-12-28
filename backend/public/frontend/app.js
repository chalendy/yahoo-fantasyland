// app.js
// Same-origin backend
const backendBase = "";

// UI elements
const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");

const weekSelect = document.getElementById("weekSelect");
const weekLabel = document.getElementById("weekLabel");

const statusMessage = document.getElementById("statusMessage");
const jsonOutput = document.getElementById("jsonOutput");

const matchupsContainer = document.getElementById("matchupsContainer");
const standingsContainer = document.getElementById("standingsContainer");

// State
let scoreboardData = null;
let standingsData = null;
let selectedWeek = null;

// ---------------- Helpers ----------------

function setStatus(msg) {
  if (statusMessage) statusMessage.textContent = msg;
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

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// Compute playoff round label.
// We don’t get explicit “quarterfinal/semifinal/final” from Yahoo’s scoreboard,
// so we infer based on league end_week and current matchup week.
// This is an inference, but it works well for typical 3-week NFL fantasy playoffs.
//
// Logic: if playoffs=1:
// - last week (end_week) => Final
// - week before last => Semifinal
// - week before that => Quarterfinal
function playoffRoundLabel({ week, endWeek, isConsolation }) {
  if (isConsolation === "1") return "Consolation";

  const w = safeNumber(week);
  const e = safeNumber(endWeek);
  if (w == null || e == null) return "Playoffs";

  if (w === e) return "Final";
  if (w === e - 1) return "Semifinal";
  if (w === e - 2) return "Quarterfinal";

  return "Playoffs";
}

function clearMatchups() {
  if (matchupsContainer) matchupsContainer.innerHTML = "";
}

// ---------------- Auth button ----------------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ---------------- Fetching ----------------

async function fetchScoreboardForWeek(week) {
  const url = week
    ? `${backendBase}/scoreboard?week=${encodeURIComponent(week)}`
    : `${backendBase}/scoreboard`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Scoreboard error ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchStandings() {
  // Your server route is /standings-raw
  const res = await fetch(`${backendBase}/standings-raw`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Standings error ${res.status}: ${text}`);
  }
  // standings-raw returns JSON string body
  const text = await res.text();
  return JSON.parse(text);
}

// ---------------- Parsing Scoreboard ----------------

function extractLeagueMetaFromScoreboard(data) {
  const leagueArr = data?.fantasy_content?.league;
  const leagueMeta = Array.isArray(leagueArr) ? leagueArr[0] : null;
  const scoreboard = Array.isArray(leagueArr) ? leagueArr[1]?.scoreboard : null;
  return { leagueMeta, scoreboard };
}

function extractMatchups(data) {
  try {
    const { leagueMeta, scoreboard } = extractLeagueMetaFromScoreboard(data);
    if (!leagueMeta || !scoreboard) return [];

    const root = scoreboard?.["0"];
    const matchupsObj = root?.matchups;
    if (!matchupsObj) return [];

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const matchupWrapper = matchupsObj[k];
        const matchupObj = matchupWrapper?.matchup;
        if (!matchupObj) return;

        // Yahoo often uses matchup["0"] as the core object
        const core = matchupObj["0"];
        if (!core) return;

        const teamsObj = core?.teams;
        if (!teamsObj || !teamsObj["0"] || !teamsObj["1"]) return;

        // Teams
        const team0 = teamsObj["0"].team;
        const team1 = teamsObj["1"].team;

        const team0Meta = team0?.[0];
        const team0Stats = team0?.[1];

        const team1Meta = team1?.[0];
        const team1Stats = team1?.[1];

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

        // 🔥 Pull playoff fields from matchupObj itself (not teams)
        const matchupWeek = matchupObj?.week ?? core?.week ?? scoreboard?.week ?? leagueMeta?.current_week;
        const isPlayoffs = matchupObj?.is_playoffs ?? core?.is_playoffs ?? "0";
        const isConsolation = matchupObj?.is_consolation ?? core?.is_consolation ?? "0";
        const status = matchupObj?.status ?? core?.status ?? "";

        result.push({
          week: matchupWeek,
          status,
          isPlayoffs: String(isPlayoffs),
          isConsolation: String(isConsolation),
          endWeek: leagueMeta?.end_week, // used to infer round label
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

// ---------------- Standings parsing & rendering ----------------

function extractTeamsFromStandings(data) {
  try {
    const leagueArr = data?.fantasy_content?.league;
    const standingsRoot = Array.isArray(leagueArr) ? leagueArr[1]?.standings?.[0] : null;
    const teamsObj = standingsRoot?.teams;
    if (!teamsObj) return [];

    const teams = [];
    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const teamArr = teamsObj[k]?.team;
        const meta = teamArr?.[0];
        const points = teamArr?.[1]?.team_points?.total;
        const standings = teamArr?.[2]?.team_standings;

        const name = pluckField(meta, "name") || "Unknown";
        const logoObj = pluckField(meta, "team_logos");
        const logo = logoObj?.[0]?.team_logo?.url ?? null;

        const managersObj = pluckField(meta, "managers");
        const managerNick = managersObj?.[0]?.manager?.nickname ?? "";

        const rank = standings?.rank ?? "";
        const wins = standings?.outcome_totals?.wins ?? "";
        const losses = standings?.outcome_totals?.losses ?? "";

        teams.push({
          rank: safeNumber(rank) ?? 999,
          name,
          logo,
          manager: managerNick,
          record: `${wins}-${losses}`,
          pf: points ?? standings?.points_for ?? "",
        });
      });

    // Yahoo sorting = by rank
    teams.sort((a, b) => a.rank - b.rank);

    return teams;
  } catch (e) {
    console.error("extractTeamsFromStandings failed:", e);
    return [];
  }
}

function renderStandingsUltraCompact(teams) {
  if (!standingsContainer) return;
  standingsContainer.innerHTML = "";

  if (!teams.length) {
    standingsContainer.innerHTML = `<div class="standings-empty">No standings found.</div>`;
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "standings-ultra";

  teams.forEach((t) => {
    const row = document.createElement("div");
    row.className = "standings-row";

    row.innerHTML = `
      <div class="standings-left">
        ${t.logo ? `<img class="standings-logo" src="${t.logo}" alt="${t.name}">` : `<div class="standings-logo standings-logo--placeholder"></div>`}
        <div class="standings-text">
          <div class="standings-line1">
            <span class="standings-rank">#${t.rank}</span>
            <span class="standings-name" title="${t.name}">${t.name}</span>
          </div>
          <div class="standings-line2">${t.record}${t.manager ? ` · ${t.manager}` : ""}</div>
        </div>
      </div>

      <div class="standings-right">
        <div class="standings-pf">${t.pf}</div>
        <div class="standings-pf-label">PF</div>
      </div>
    `;

    wrapper.appendChild(row);
  });

  standingsContainer.appendChild(wrapper);
}

// ---------------- Rendering matchups ----------------

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

    // ✅ Only show tag in playoffs; infer round label
    const showPlayoffTag = String(m.isPlayoffs) === "1";
    const tagText = showPlayoffTag
      ? playoffRoundLabel({ week: m.week, endWeek: m.endWeek, isConsolation: m.isConsolation })
      : "";

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label"></span>
        ${showPlayoffTag ? `<span class="matchup-tag matchup-tag--playoffs">${tagText}</span>` : ``}
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
                Proj: ${m.teamA.projected}
                ${teamAProbPct != null ? ` · Win%: ${teamAProbPct}%` : ``}
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
                ${teamBProbPct != null ? ` · Win%: ${teamBProbPct}%` : ``}
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

// ---------------- Week dropdown ----------------

function buildWeekOptionsFromLeagueMeta(leagueMeta) {
  if (!weekSelect || !leagueMeta) return;

  const startWeek = safeNumber(leagueMeta.start_week) ?? 1;
  const endWeek = safeNumber(leagueMeta.end_week) ?? 17;
  const currentWeek = safeNumber(leagueMeta.current_week) ?? endWeek;

  weekSelect.innerHTML = "";

  for (let w = startWeek; w <= endWeek; w++) {
    const opt = document.createElement("option");
    opt.value = String(w);
    opt.textContent = `Week ${w}`;
    if (w === currentWeek) opt.selected = true;
    weekSelect.appendChild(opt);
  }

  selectedWeek = String(currentWeek);
  if (weekLabel) weekLabel.textContent = `Week ${selectedWeek}`;
}

async function loadScoreboardAndRender(week) {
  try {
    setStatus(`Loading scoreboard for Week ${week}...`);
    const data = await fetchScoreboardForWeek(week);
    scoreboardData = data;

    if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

    const { leagueMeta } = extractLeagueMetaFromScoreboard(data);
    if (leagueMeta) {
      // Build dropdown only once or when empty
      if (weekSelect && weekSelect.options.length === 0) {
        buildWeekOptionsFromLeagueMeta(leagueMeta);
      }

      // Always update label to selected week
      if (weekLabel) weekLabel.textContent = `Week ${week}`;
    }

    const matchups = extractMatchups(data);
    if (!matchups.length) {
      clearMatchups();
      setStatus("No matchups found for that week.");
      return;
    }

    renderMatchupCards(matchups);
    setStatus(`Loaded ${matchups.length} matchups for Week ${week}.`);
  } catch (e) {
    console.error(e);
    setStatus("Error loading scoreboard (are you signed in?).");
  }
}

// ---------------- Manual buttons ----------------

if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    const wk = selectedWeek || (weekSelect ? weekSelect.value : null) || "1";
    await loadScoreboardAndRender(wk);
  });
}

if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", () => {
    if (!scoreboardData) {
      setStatus("No scoreboard loaded yet. Click 'Load Scoreboard JSON' first.");
      return;
    }
    const matchups = extractMatchups(scoreboardData);
    if (!matchups.length) {
      setStatus("No matchups found for this week.");
      clearMatchups();
      return;
    }
    renderMatchupCards(matchups);
    setStatus(`Showing ${matchups.length} matchups.`);
  });
}

// ---------------- Auto-load + standings ----------------

async function boot() {
  // 1) Try standings immediately (it will 401 if not signed in)
  try {
    const st = await fetchStandings();
    standingsData = st;
    const teams = extractTeamsFromStandings(st);
    renderStandingsUltraCompact(teams);
  } catch (e) {
    console.warn("Standings not loaded yet:", e);
    // Keep container empty; user can sign in
  }

  // 2) Try to load scoreboard for current week (will 401 if not signed in)
  try {
    // load "current" week from a scoreboard response
    const data = await fetchScoreboardForWeek(null);
    scoreboardData = data;

    if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

    const { leagueMeta, scoreboard } = extractLeagueMetaFromScoreboard(data);
    const wk = String(scoreboard?.week ?? leagueMeta?.current_week ?? "1");

    buildWeekOptionsFromLeagueMeta(leagueMeta);

    selectedWeek = wk;
    if (weekSelect) weekSelect.value = wk;
    if (weekLabel) weekLabel.textContent = `Week ${wk}`;

    const matchups = extractMatchups(data);
    renderMatchupCards(matchups);
    setStatus(`Loaded Week ${wk}.`);
  } catch (e) {
    console.warn("Auto-load scoreboard failed (likely not signed in yet):", e);
    setStatus("Please sign in to load matchups and standings.");
  }
}

if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    selectedWeek = weekSelect.value;
    await loadScoreboardAndRender(selectedWeek);
  });
}

window.addEventListener("DOMContentLoaded", boot);
