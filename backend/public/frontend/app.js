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

// ------------------------------------------------
// Helpers
// ------------------------------------------------

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

// ------------------------------------------------
// Auth button
// ------------------------------------------------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ------------------------------------------------
// Populate week dropdown
// ------------------------------------------------

function populateWeekDropdown(leagueMeta) {
  if (!leagueMeta) return;

  const start = parseInt(leagueMeta.start_week);
  const end = parseInt(leagueMeta.end_week);

  if (!start || !end) return;

  weekSelect.innerHTML = "";
  for (let w = start; w <= end; w++) {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = `Week ${w}`;
    weekSelect.appendChild(opt);
  }

  selectedWeek = parseInt(leagueMeta.current_week);
  weekSelect.value = selectedWeek;
}

// ------------------------------------------------
// Load scoreboard JSON manually
// ------------------------------------------------

if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    try {
      setStatus("Loading scoreboard JSON...");
      jsonOutput.textContent = "Loading...";

      const res = await fetch(`${backendBase}/scoreboard`);
      if (!res.ok) {
        const text = await res.text();
        console.error("Scoreboard error:", res.status, text);
        jsonOutput.textContent = `Error: ${res.status}\n${text}`;
        setStatus("Failed to load scoreboard JSON.");
        return;
      }

      const data = await res.json();
      scoreboardData = data;

      jsonOutput.textContent = JSON.stringify(data, null, 2);
      setStatus("Scoreboard JSON loaded successfully.");

      const leagueArr = data?.fantasy_content?.league;
      if (leagueArr) {
        const leagueMeta = leagueArr[0];
        const scoreboard = leagueArr[1]?.scoreboard;

        const week = scoreboard?.week ?? leagueMeta?.current_week;
        if (weekLabel) weekLabel.textContent = `Week ${week}`;

        populateWeekDropdown(leagueMeta);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      jsonOutput.textContent = "Error fetching scoreboard. See console.";
      setStatus("Error fetching scoreboard JSON.");
    }
  });
}

// ------------------------------------------------
// Load scoreboard for a selected week
// ------------------------------------------------

async function loadScoreboardForWeek(week) {
  try {
    setStatus(`Loading week ${week}...`);
    selectedWeek = week;

    const res = await fetch(`${backendBase}/scoreboard?week=${week}`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      setStatus("Failed to load scoreboard.");
      return null;
    }

    const data = await res.json();
    scoreboardData = data;

    if (jsonOutput) {
      jsonOutput.textContent = JSON.stringify(data, null, 2);
    }

    const leagueArr = data?.fantasy_content?.league;
    const leagueMeta = leagueArr?.[0];
    const scoreboard = leagueArr?.[1]?.scoreboard;

    const realWeek = scoreboard?.week ?? leagueMeta?.current_week;
    if (weekLabel) weekLabel.textContent = `Week ${realWeek}`;

    if (weekSelect && weekSelect.innerHTML.trim() === "") {
      populateWeekDropdown(leagueMeta);
    }

    return data;
  } catch (err) {
    console.error("loadScoreboardForWeek error:", err);
    return null;
  }
}

// ------------------------------------------------
// Extract matchups
// ------------------------------------------------

function extractMatchups(data) {
  try {
    const fc = data.fantasy_content;
    const leagueArr = fc.league;
    const leagueMeta = leagueArr[0];
    const scoreboard = leagueArr[1].scoreboard;

    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot.matchups;
    const weekNumber = scoreboard.week ?? leagueMeta.current_week;

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const wrapper = matchupsObj[key];
        const matchup = wrapper.matchup;
        const matchupInner = matchup["0"];

        const teamsObj = matchupInner.teams;

        const team0 = teamsObj["0"].team;
        const team1 = teamsObj["1"].team;

        const team0Meta = team0[0];
        const team1Meta = team1[0];
        const team0Stats = team0[1];
        const team1Stats = team1[1];

        // Extract metadata
        const teamAName = pluckField(team0Meta, "name") || "Unknown Team";
        const teamBName = pluckField(team1Meta, "name") || "Unknown Team";

        const teamALogoObj = pluckField(team0Meta, "team_logos");
        const teamBLogoObj = pluckField(team1Meta, "team_logos");

        const teamALogo =
          teamALogoObj?.[0]?.team_logo?.url ?? null;
        const teamBLogo =
          teamBLogoObj?.[0]?.team_logo?.url ?? null;

        const teamAScore = team0Stats?.team_points?.total ?? "0.00";
        const teamBScore = team1Stats?.team_points?.total ?? "0.00";

        const teamAProj = team0Stats?.team_projected_points?.total ?? "0.00";
        const teamBProj = team1Stats?.team_projected_points?.total ?? "0.00";

        const teamAProb = team0Stats?.win_probability ?? null;
        const teamBProb = team1Stats?.win_probability ?? null;

        // Determine matchup type
        const isPlayoffs = matchup.is_playoffs === "1";
        const isConsolation = matchup.is_consolation === "1";

        let matchupTag = null; // hide tag for regular season
        if (isPlayoffs) matchupTag = "Playoffs";
        else if (isConsolation) matchupTag = "Consolation";

        result.push({
          week: weekNumber,
          matchupTag,
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

// ------------------------------------------------
// Render matchup cards
// ------------------------------------------------

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
        <span class="matchup-week-label">Week ${m.week ?? "?"}</span>
        ${m.matchupTag ? `<span class="matchup-tag">${m.matchupTag}</span>` : ""}
      </div>

      <div class="matchup-body">
        <div class="team-column">
          <div class="team-info">
            ${
              m.teamA.logo
                ? `<img src="${m.teamA.logo}" class="team-logo"/>`
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

        <div class="vs-column"><span class="vs-pill">VS</span></div>

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
                ? `<img src="${m.teamB.logo}" class="team-logo"/>`
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

// ------------------------------------------------
// Change week
// ------------------------------------------------

if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    const newWeek = parseInt(weekSelect.value);
    const data = await loadScoreboardForWeek(newWeek);

    if (data) {
      const matchups = extractMatchups(data);
      renderMatchupCards(matchups);
      setStatus(`Loaded matchups for Week ${newWeek}`);
    }
  });
}

// ------------------------------------------------
// Auto-load on page load
// ------------------------------------------------

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const data = await loadScoreboardForWeek(selectedWeek ?? 1);
    if (!data) return;

    const leagueArr = data?.fantasy_content?.league;
    const leagueMeta = leagueArr?.[0];

    if (leagueMeta && weekSelect.innerHTML.trim() === "") {
      populateWeekDropdown(leagueMeta);
    }

    weekLabel.textContent = `Week ${selectedWeek}`;

    const matchups = extractMatchups(data);
    if (matchups.length > 0) {
      renderMatchupCards(matchups);
      setStatus(`Loaded ${matchups.length} matchups.`);
    }
  } catch {
    console.warn("Auto-load skipped (likely not authenticated yet).");
  }
});
