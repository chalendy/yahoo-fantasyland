// If frontend is served from the same origin as backend, we can use relative URLs
const backendBase = ""; // same origin

const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const statusMessage = document.getElementById("statusMessage");
const weekLabel = document.getElementById("weekLabel");

let scoreboardData = null;

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

// ------------- Button handlers -------------

// Sign in with Yahoo
if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// Load raw scoreboard JSON
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

      // Try to show the week in the UI
      try {
        const leagueArray = data?.fantasy_content?.league;
        if (Array.isArray(leagueArray)) {
          const leagueMeta = leagueArray[0];
          const scoreboard = leagueArray[1]?.scoreboard;
          const week = scoreboard?.week ?? leagueMeta?.current_week;
          if (weekLabel && week != null) {
            weekLabel.textContent = `Week ${week}`;
          }
        }
      } catch (e) {
        console.warn("Unable to parse week from JSON:", e);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      jsonOutput.textContent = "Error fetching scoreboard. See console.";
      setStatus("Error fetching scoreboard JSON.");
    }
  });
}

// Render this week's matchups
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

// ------------- Data parsing -------------

function extractMatchups(data) {
  try {
    const fc = data.fantasy_content;
    const leagueArray = fc.league;
    const leagueMeta = leagueArray[0];
    const scoreboard = leagueArray[1].scoreboard;

    // Example: scoreboard["0"].matchups
    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot.matchups;
    const weekNumber = scoreboard.week ?? leagueMeta.current_week;

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchupWrapper = matchupsObj[key];
        const matchup = matchupWrapper.matchup;
        const matchupInner = matchup["0"]; // the one containing "teams"
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

        result.push({
          week: weekNumber,
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

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">
          Week ${m.week ?? "?"}
        </span>
        <span class="matchup-tag">Playoffs</span>
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
