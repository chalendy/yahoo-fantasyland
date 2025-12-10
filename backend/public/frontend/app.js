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

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

function setStatus(msg) {
  if (statusMessage) statusMessage.textContent = msg;
}

function pluckField(arr, key) {
  if (!Array.isArray(arr)) return null;
  for (const obj of arr) {
    if (obj && obj[key] !== undefined) return obj[key];
  }
  return null;
}

// -------------------------------------------------------------
// Week dropdown builder
// -------------------------------------------------------------
function populateWeekDropdown(meta) {
  const start = parseInt(meta.start_week);
  const end = parseInt(meta.end_week);
  const current = parseInt(meta.current_week);

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

// -------------------------------------------------------------
// Fetch scoreboard for selected week
// -------------------------------------------------------------
async function loadScoreboardForWeek(week) {
  try {
    setStatus(`Loading week ${week}...`);

    const res = await fetch(`${backendBase}/scoreboard?week=${week}`);

    if (!res.ok) {
      const text = await res.text();
      console.warn("Not authenticated:", res.status, text);
      setStatus("Please sign in first.");
      return null;
    }

    const data = await res.json();
    scoreboardData = data;
    selectedWeek = week;
    return data;

  } catch (err) {
    console.error("Fetch error:", err);
    setStatus("Error loading scoreboard.");
    return null;
  }
}

// -------------------------------------------------------------
// Extract matchups
// -------------------------------------------------------------
function extractMatchups(data) {
  try {
    const leagueArr = data.fantasy_content.league;
    const scoreboard = leagueArr[1].scoreboard;
    const root = scoreboard["0"];
    const matchupsObj = root.matchups;

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchup = matchupsObj[key].matchup["0"];
        const teamsObj = matchup.teams;

        const t0 = teamsObj["0"].team;
        const t1 = teamsObj["1"].team;

        const t0Meta = t0[0];
        const t0Stats = t0[1];
        const t1Meta = t1[0];
        const t1Stats = t1[1];

        result.push({
          week: selectedWeek,
          teamA: {
            name: pluckField(t0Meta, "name") || "Unknown",
            logo: pluckField(t0Meta, "team_logos")?.[0]?.team_logo?.url ?? null,
            score: t0Stats?.team_points?.total ?? "0.00",
            projected: t0Stats?.team_projected_points?.total ?? "0.00",
            winProbability: t0Stats?.win_probability,
          },
          teamB: {
            name: pluckField(t1Meta, "name") || "Unknown",
            logo: pluckField(t1Meta, "team_logos")?.[0]?.team_logo?.url ?? null,
            score: t1Stats?.team_points?.total ?? "0.00",
            projected: t1Stats?.team_projected_points?.total ?? "0.00",
            winProbability: t1Stats?.win_probability,
          },
        });
      });

    return result;

  } catch (err) {
    console.error("Error extracting matchups:", err);
    return [];
  }
}

// -------------------------------------------------------------
// Render matchups
// -------------------------------------------------------------
function renderMatchupCards(matchups) {
  matchupsContainer.innerHTML = "";

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const Aprob = m.teamA.winProbability != null ? Math.round(m.teamA.winProbability * 100) : null;
    const Bprob = m.teamB.winProbability != null ? Math.round(m.teamB.winProbability * 100) : null;

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">Week ${m.week}</span>
        <span class="matchup-tag">Playoffs</span>
      </div>

      <div class="matchup-body">
        <div class="team-column">
          <div class="team-info">
            ${m.teamA.logo
              ? `<img src="${m.teamA.logo}" class="team-logo">`
              : `<div class="team-logo placeholder-logo">A</div>`
            }
            <div>
              <div class="team-name">${m.teamA.name}</div>
              <div class="team-metadata">
                Proj: ${m.teamA.projected}
                ${Aprob != null ? `· Win% ${Aprob}%` : ""}
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
                ${Bprob != null ? `· Win% ${Bprob}%` : ""}
              </div>
            </div>
            ${m.teamB.logo
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

// -------------------------------------------------------------
// Button Handlers
// -------------------------------------------------------------

authBtn?.addEventListener("click", () => {
  window.location.href = `${backendBase}/auth/start`;
});

loadJsonBtn?.addEventListener("click", async () => {
  const data = await loadScoreboardForWeek(selectedWeek ?? 1);
  if (!data) return;

  jsonOutput.textContent = JSON.stringify(data, null, 2);

  const leagueMeta = data?.fantasy_content?.league?.[0];
  populateWeekDropdown(leagueMeta);

  weekLabel.textContent = `Week ${selectedWeek}`;
  setStatus("JSON Loaded.");
});

loadMatchupsBtn?.addEventListener("click", () => {
  if (!scoreboardData)
    return setStatus("Load JSON first.");

  const matchups = extractMatchups(scoreboardData);
  renderMatchupCards(matchups);

  weekLabel.textContent = `Week ${selectedWeek}`;
});

weekSelect?.addEventListener("change", async () => {
  selectedWeek = parseInt(weekSelect.value);
  setStatus(`Week changed to ${selectedWeek}`);

  const data = await loadScoreboardForWeek(selectedWeek);
  if (!data) return;

  const matchups = extractMatchups(data);
  renderMatchupCards(matchups);

  weekLabel.textContent = `Week ${selectedWeek}`;
});

// -------------------------------------------------------------
// Safe Auto-load (runs AFTER sign-in)
// -------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const data = await loadScoreboardForWeek(selectedWeek ?? 1);
    if (!data) return;

    const leagueMeta = data?.fantasy_content?.league?.[0];

    // Populate dropdown only once
    if (leagueMeta && weekSelect.innerHTML.trim() === "") {
      populateWeekDropdown(leagueMeta);
    }

    weekLabel.textContent = `Week ${selectedWeek}`;

    const matchups = extractMatchups(data);
    if (matchups.length > 0) {
      renderMatchupCards(matchups);
      setStatus(`Loaded matchups for Week ${selectedWeek}`);
    }

  } catch {
    console.warn("Auto-load skipped (not authenticated yet).");
  }
});
