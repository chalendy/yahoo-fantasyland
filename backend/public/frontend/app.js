// ----------------------
// Constants & Elements
// ----------------------
const backendBase = "";

const authBtn = document.getElementById("authBtn");
const weekSelect = document.getElementById("weekSelect");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");

const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const statusMessage = document.getElementById("statusMessage");
const standingsContainer = document.getElementById("standingsContainer");

let scoreboardData = null;
let currentWeek = null;

// ----------------------
// Helper functions
// ----------------------
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

// ----------------------
// Yahoo Authentication
// ----------------------
if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ----------------------
// Load Scoreboard JSON
// ----------------------
if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    await loadScoreboardForWeek(currentWeek);
  });
}

// ----------------------
// Load Matchups Button
// ----------------------
if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", renderCurrentWeekMatchups);
}

// ----------------------
// Week Dropdown Change
// ----------------------
if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    const selected = parseInt(weekSelect.value);
    currentWeek = selected;
    await loadScoreboardForWeek(selected);
  });
}

// ----------------------
// Load scoreboard for a week
// ----------------------
async function loadScoreboardForWeek(week) {
  try {
    setStatus("Loading scoreboard...");

    const res = await fetch(`${backendBase}/scoreboard`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      setStatus("Failed to load scoreboard.");
      return;
    }

    scoreboardData = await res.json();
    if (jsonOutput) jsonOutput.textContent = JSON.stringify(scoreboardData, null, 2);

    const leagueArr = scoreboardData?.fantasy_content?.league;
    const leagueMeta = leagueArr?.[0];
    const scoreboard = leagueArr?.[1]?.scoreboard;

    // Current week from Yahoo
    const yahooCurrentWeek = scoreboard?.week ?? leagueMeta?.current_week;
    if (!currentWeek) currentWeek = yahooCurrentWeek;

    populateWeekDropdown(leagueMeta);
    renderCurrentWeekMatchups();
    renderStandings();

    setStatus(`Loaded Week ${currentWeek}.`);
  } catch (e) {
    console.error("Error loading scoreboard:", e);
    setStatus("Error loading scoreboard.");
  }
}

// ----------------------
// Populate Week Dropdown
// ----------------------
function populateWeekDropdown(meta) {
  if (!weekSelect || !meta) return;

  const start = parseInt(meta.start_week);
  const end = parseInt(meta.end_week);

  weekSelect.innerHTML = "";

  for (let w = start; w <= end; w++) {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = `Week ${w}`;

    if (w === currentWeek) opt.selected = true;

    weekSelect.appendChild(opt);
  }
}

// ----------------------
// Extract Matches
// ----------------------
function extractMatchups(data, targetWeek) {
  try {
    const fc = data.fantasy_content;
    const leagueArr = fc.league;
    const scoreboard = leagueArr[1].scoreboard;

    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot.matchups;

    let result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const wrapper = matchupsObj[key].matchup;
        const matchup = wrapper["0"];
        const teamsObj = matchup.teams;

        const team0 = teamsObj["0"].team;
        const team1 = teamsObj["1"].team;

        const mWeek = parseInt(wrapper.week);
        if (mWeek !== targetWeek) return;

        const mIsPlayoffs = wrapper.is_playoffs === "1";

        result.push({
          week: mWeek,
          isPlayoffs: mIsPlayoffs,
          teamA: extractTeam(team0),
          teamB: extractTeam(team1)
        });
      });

    return result;
  } catch (err) {
    console.error("extractMatchups error:", err);
    return [];
  }
}

function extractTeam(teamArray) {
  const meta = teamArray[0];
  const stats = teamArray[1];

  const name = pluckField(meta, "name") ?? "Unknown";
  const logoArr = pluckField(meta, "team_logos");
  const logo = logoArr?.[0]?.team_logo?.url ?? null;

  return {
    name,
    logo,
    score: stats?.team_points?.total ?? "0.00",
    projected: stats?.team_projected_points?.total ?? "0.00",
    winProbability:
      stats?.win_probability != null
        ? Math.round(stats.win_probability * 100)
        : null
  };
}

// ----------------------
// Render Matchups
// ----------------------
function renderCurrentWeekMatchups() {
  if (!scoreboardData) {
    setStatus("No scoreboard loaded.");
    return;
  }

  const matchups = extractMatchups(scoreboardData, currentWeek);

  if (!matchups || matchups.length === 0) {
    matchupsContainer.innerHTML = "<p>No matchups this week.</p>";
    return;
  }

  matchupsContainer.innerHTML = "";

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const playoffsTag = m.isPlayoffs ? `<span class="matchup-tag">Playoffs</span>` : "";

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">Week ${m.week}</span>
        ${playoffsTag}
      </div>

      <div class="matchup-body">
        <div class="team-column">
          <div class="team-info">
            ${
              m.teamA.logo
                ? `<img class="team-logo" src="${m.teamA.logo}" />`
                : `<div class="team-logo placeholder-logo">A</div>`
            }
            <div>
              <div class="team-name">${m.teamA.name}</div>
              <div class="team-metadata">
                Proj: ${m.teamA.projected} ${
      m.teamA.winProbability != null ? `· Win%: ${m.teamA.winProbability}%` : ""
    }
              </div>
            </div>
          </div>
          <div class="team-score">${m.teamA.score}</div>
        </div>

        <div class="vs-column"><span class="vs-pill">VS</span></div>

        <div class="team-column">
          <div class="team-info team-info-right">
            <div>
              <div class="team-name">${m.teamB.name}</div>
              <div class="team-metadata">
                Proj: ${m.teamB.projected} ${
      m.teamB.winProbability != null ? `· Win%: ${m.teamB.winProbability}%` : ""
    }
              </div>
            </div>
            ${
              m.teamB.logo
                ? `<img class="team-logo" src="${m.teamB.logo}" />`
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

// ----------------------
// Render Standings
// ----------------------
function renderStandings() {
  if (!standingsContainer || !scoreboardData) return;

  const leagueArr = scoreboardData?.fantasy_content?.league;
  const leagueMeta = leagueArr[0];

  if (!leagueMeta.standings) {
    standingsContainer.innerHTML = "<p>No standings available.</p>";
    return;
  }

  const standings = leagueMeta.standings.teams;

  let html = `<table class="standings-table">
      <tr><th>Team</th><th>W-L-T</th><th>Points</th></tr>`;

  Object.keys(standings)
    .filter((k) => k !== "count")
    .forEach((key) => {
      const t = standings[key].team;
      const meta = t[0];
      const stats = t[1];

      const name = pluckField(meta, "name");
      const wins = stats.team_standings.outcome_totals.wins;
      const losses = stats.team_standings.outcome_totals.losses;
      const ties = stats.team_standings.outcome_totals.ties;
      const points = stats.team_points.total;

      html += `
        <tr>
          <td>${name}</td>
          <td>${wins}-${losses}-${ties}</td>
          <td>${points}</td>
        </tr>`;
    });

  html += "</table>";

  standingsContainer.innerHTML = html;
}

// ----------------------
// Auto-load on page load
// ----------------------
window.addEventListener("DOMContentLoaded", async () => {
  await loadScoreboardForWeek();
});
