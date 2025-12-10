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
const weekSelect = document.getElementById("weekSelect"); // dropdown for week selection

let scoreboardData = null;
let leagueMetaCache = null; // store league meta (start_week, end_week, current_week)

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

// Populate / refresh week dropdown
function populateWeekDropdown(meta, currentWeek) {
  if (!weekSelect || !meta) return;

  const startWeek = Number(meta.start_week || 1);
  const endWeek = Number(meta.end_week || meta.current_week || currentWeek || 1);

  // Only populate once or when empty
  if (weekSelect.options.length === 0) {
    for (let w = startWeek; w <= endWeek; w++) {
      const opt = document.createElement("option");
      opt.value = String(w);
      opt.textContent = `Week ${w}`;
      weekSelect.appendChild(opt);
    }
  }

  // Sync dropdown with the effective week
  if (currentWeek != null) {
    const valueStr = String(currentWeek);
    const found = Array.from(weekSelect.options).some((opt) => opt.value === valueStr);
    if (found) {
      weekSelect.value = valueStr;
    }
  }
}

// ------------- Button handlers -------------

// Sign in with Yahoo
if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// Load raw scoreboard JSON (manual button)
if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    // If a week is selected, respect it; otherwise let backend default
    const selectedWeek = weekSelect && weekSelect.value ? Number(weekSelect.value) : null;
    await loadScoreboardForWeek(selectedWeek, { showJson: true, reRenderMatchups: false });
  });
}

// Render this week's matchups from already-loaded JSON
if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", () => {
    if (!scoreboardData) {
      setStatus("No scoreboard loaded yet. Click 'Load Scoreboard JSON' first.");
      return;
    }

    const matchups = extractMatchups(scoreboardData);
    if (!matchups || matchups.length === 0) {
      setStatus("No matchups found for this week.");
      matchupsContainer.innerHTML = "";
      return;
    }

    renderMatchupCards(matchups);
    setStatus(`Showing ${matchups.length} matchups for this week.`);
  });
}

// Week dropdown change → load that week's scoreboard & matchups
if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    const week = Number(weekSelect.value);
    await loadScoreboardForWeek(week, { showJson: true, reRenderMatchups: true });
  });
}

// ------------- Data parsing -------------

function extractMatchups(data) {
  try {
    const fc = data.fantasy_content;
    const leagueArray = fc.league;
    const leagueMeta = leagueArray[0];
    const scoreboard = leagueArray[1].scoreboard;

    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot.matchups;
    const weekNumber = scoreboard.week ?? leagueMeta.current_week;

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchupWrapper = matchupsObj[key];
        const matchup = matchupWrapper.matchup;
        const matchupInner = matchup["0"]; // contains "teams" etc.
        const teamsObj = matchupInner.teams;
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
          teamALogoObj && teamALogoObj[0]?.team_logo?.url
            ? teamALogoObj[0].team_logo.url
            : null;
        const teamBLogo =
          teamBLogoObj && teamBLogoObj[0]?.team_logo?.url
            ? teamBLogoObj[0].team_logo.url
            : null;

        const teamAScore = team0Stats?.team_points?.total ?? "0.00";
        const teamBScore = team1Stats?.team_points?.total ?? "0.00";

        const teamAProj = team0Stats?.team_projected_points?.total ?? "0.00";
        const teamBProj = team1Stats?.team_projected_points?.total ?? "0.00";

        const teamAProb = team0Stats?.win_probability ?? null;
        const teamBProb = team1Stats?.win_probability ?? null;

        // Detect playoffs from matchupInner
        const isPlayoffs = matchupInner.is_playoffs === "1";

        result.push({
          week: weekNumber,
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

// ------------- Rendering -------------

function renderMatchupCards(matchups) {
  if (!matchupsContainer) return;
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

    // Show "Playoffs" tag only if this matchup is actually a playoff matchup
    const playoffsTagHtml = m.isPlayoffs
      ? `<span class="matchup-tag">Playoffs</span>`
      : "";

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">
          Week ${m.week ?? "?"}
        </span>
        ${playoffsTagHtml}
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
                ${
                  teamAProbPct != null
                    ? ` · Win%: ${teamAProbPct}%`
                    : ""
                }
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
                ${
                  teamBProbPct != null
                    ? ` · Win%: ${teamBProbPct}%`
                    : ""
                }
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

// ------------- Core loader -------------

/**
 * Load scoreboard (optionally for a specific week) and update:
 * - jsonOutput (if showJson)
 * - weekLabel + weekSelect
 * - matchups (if reRenderMatchups)
 */
async function loadScoreboardForWeek(week, options = {}) {
  const { showJson = true, reRenderMatchups = true } = options;

  try {
    const url =
      week != null
        ? `${backendBase}/scoreboard?week=${encodeURIComponent(week)}`
        : `${backendBase}/scoreboard`;

    setStatus("Loading scoreboard...");

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);

      if (res.status === 401) {
        setStatus("Not authenticated. Please click 'Sign In with Yahoo' first.");
      } else {
        setStatus("Failed to load scoreboard.");
      }

      if (showJson && jsonOutput) {
        jsonOutput.textContent = `Error: ${res.status}\n${text}`;
      }
      return;
    }

    const data = await res.json();
    scoreboardData = data;

    // Show JSON if requested
    if (showJson && jsonOutput) {
      jsonOutput.textContent = JSON.stringify(data, null, 2);
    }

    // Extract league meta + effective week
    try {
      const leagueArr = data?.fantasy_content?.league;
      const leagueMeta = leagueArr?.[0];
      const scoreboard = leagueArr?.[1]?.scoreboard;

      leagueMetaCache = leagueMeta;

      const effectiveWeek =
        scoreboard?.week ?? leagueMeta?.matchup_week ?? leagueMeta?.current_week;

      // Update label
      if (weekLabel && effectiveWeek != null) {
        weekLabel.textContent = `Week ${effectiveWeek}`;
      }

      // Populate + sync dropdown
      if (leagueMeta) {
        populateWeekDropdown(leagueMeta, effectiveWeek);
      }
    } catch (e) {
      console.warn("Couldn't parse league meta or week:", e);
    }

    // Extract & render matchups
    if (reRenderMatchups) {
      const matchups = extractMatchups(data);
      if (!matchups || matchups.length === 0) {
        setStatus("No matchups found for this week.");
        if (matchupsContainer) matchupsContainer.innerHTML = "";
        return;
      }

      renderMatchupCards(matchups);
      setStatus(`Loaded ${matchups.length} matchups.`);
    } else {
      setStatus("Scoreboard JSON loaded successfully.");
    }
  } catch (err) {
    console.error("Error loading scoreboard:", err);
    setStatus("Error loading scoreboard.");
  }
}

// ----- AUTO LOAD SCOREBOARD + MATCHUPS -----

async function autoLoadOnStartup() {
  // On first load, we don't know the week yet; just let backend return default/current
  await loadScoreboardForWeek(null, { showJson: true, reRenderMatchups: true });
}

window.addEventListener("DOMContentLoaded", autoLoadOnStartup);
