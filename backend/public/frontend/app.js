// If frontend is served from the same origin as backend, we can use relative URLs
const backendBase = ""; // same origin

// UI elements
const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const statusMessage = document.getElementById("statusMessage");
const weekLabel = document.getElementById("weekLabel");
const weekSelect = document.getElementById("weekSelect");

let scoreboardData = null;
let selectedWeek = null;

// ------------- Helpers -------------

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

// Build the week dropdown
function populateWeekDropdown(meta) {
  const start = parseInt(meta.start_week);
  const end = parseInt(meta.end_week);
  const current = parseInt(meta.current_week);

  if (!start || !end) return;

  weekSelect.innerHTML = "";

  for (let w = start; w <= end; w++) {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = `Week ${w}`;
    if (w === current) opt.selected = true;
    weekSelect.appendChild(opt);
  }

  selectedWeek = current;
}

// Fetch scoreboard for selected week
async function loadScoreboardForWeek(week) {
  try {
    setStatus(`Loading week ${week}...`);

    const res = await fetch(`${backendBase}/scoreboard`);
    if (!res.ok) {
      const text = await res.text();
      console.warn("Scoreboard not available yet:", res.status, text);
      setStatus("Not authenticated yet.");
      return null;
    }

    const data = await res.json();
    scoreboardData = data;

    return data;
  } catch (err) {
    console.error("Fetch error:", err);
    setStatus("Error fetching scoreboard.");
    return null;
  }
}

// Extract matchups ONLY for selected week
function extractMatchups(data) {
  try {
    const leagueArray = data.fantasy_content.league;
    const scoreboard = leagueArray[1].scoreboard;
    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot.matchups;

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchup = matchupsObj[key].matchup["0"];
        const teamsObj = matchup.teams;

        const team0 = teamsObj["0"].team;
        const team1 = teamsObj["1"].team;

        const team0Meta = team0[0];
        const team0Stats = team0[1];
        const team1Meta = team1[0];
        const team1Stats = team1[1];

        const teamAName = pluckField(team0Meta, "name") || "Unknown Team";
        const teamBName = pluckField(team1Meta, "name") || "Unknown Team";

        const teamALogoObj = pluckField(team0Meta, "team_logos");
        const teamBLogoObj = pluckField(team1Meta, "team_logos");

        const teamALogo =
          teamALogoObj?.[0]?.team_logo?.url ?? null;
        const teamBLogo =
          teamBLogoObj?.[0]?.team_logo?.url ?? null;

        result.push({
          week: selectedWeek,
          teamA: {
            name: teamAName,
            logo: teamALogo,
            score: team0Stats?.team_points?.total ?? "0.00",
            projected: team0Stats?.team_projected_points?.total ?? "0.00",
            winProbability: team0Stats?.win_probability ?? null,
          },
          teamB: {
            name: teamBName,
            logo: teamBLogo,
            score: team1Stats?.team_points?.total ?? "0.00",
            projected: team1Stats?.team_projected_points?.total ?? "0.00",
            winProbability: team1Stats?.win_probability ?? null,
          },
        });
      });

    return result;
  } catch (err) {
    console.error("Error extracting matchups:", err);
    return [];
  }
}

// Render matchups
function renderMatchupCards(matchups) {
  matchupsContainer.innerHTML = "";

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const teamAProbPct =
      m.teamA.winProbability != null
        ? Math.round(m.teamA.winProbability * 100)
        : null;
    const teamBProbPct =
      m.teamB.winProbability != null
        ? Math.round(m.teamB.winProbability * 100)
        : null;

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">Week ${m.week}</span>
        <span class="matchup-tag">Playoffs</span>
      </div>

      <div class="matchup-body">
        <div class="team-column">
          <div class="team-info">
            ${
              m.teamA.logo
                ? `<img src="${m.teamA.logo}" class="team-logo">`
                : `<div class="team-logo placeholder-logo">A</div>`
            }
            <div>
              <div class="team-name">${m.teamA.name}</div>
              <div class="team-metadata">
                Proj: ${m.teamA.projected}
                ${teamAProbPct != null ? `· Win% ${teamAProbPct}%` : ""}
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
                Proj: ${m.teamB.projected}
                ${teamBProbPct != null ? `· Win% ${teamBProbPct}%` : ""}
              </div>
            </div>
            ${
              m.teamB.logo
                ? `<img src="${m.teamB.logo}" class="team-logo">`
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

// ---------- BUTTON HANDLERS ----------

// SIGN IN
if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// LOAD JSON
if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    scoreboardData = await loadScoreboardForWeek(selectedWeek ?? 1);
    if (!scoreboardData) return;

    jsonOutput.textContent = JSON.stringify(scoreboardData, null, 2);

    const leagueMeta = scoreboardData?.fantasy_content?.league?.[0];
    populateWeekDropdown(leagueMeta);

    weekLabel.textContent = `Week ${selectedWeek}`;
    setStatus("JSON Loaded.");
  });
}

// RENDER MATCHUPS
if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", () => {
    if (!scoreboardData) {
      setStatus("Load JSON first.");
      return;
    }

    const matchups = extractMatchups(scoreboardData);
    renderMatchupCards(matchups);

    weekLabel.textContent = `Week ${selectedWeek}`;
    setStatus(`Showing matchups for week ${selectedWeek}`);
  });
}

// WEEK CHANGE
weekSelect?.addEventListener("change", async () => {
  selectedWeek = parseInt(weekSelect.value);
  setStatus(`Week changed to ${selectedWeek}`);

  scoreboardData = await loadScoreboardForWeek(selectedWeek);
  if (!scoreboardData) return;

  const matchups = extractMatchups(scoreboardData);
  renderMatchupCards(matchups);

  weekLabel.textContent = `Week ${selectedWeek}`;
});

// ---------- SAFE AUTO-LOAD (won’t block Sign In) ----------
window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadScoreboardForWeek(selectedWeek ?? 1);
  } catch {
    console.warn("Auto-load skipped (not authenticated).");
  }
});
