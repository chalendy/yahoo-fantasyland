// If frontend is served from the same origin as backend, we can use relative URLs
const backendBase = ""; // same origin

// UI elements
const authBtn = document.getElementById("authBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const matchupsContainer = document.getElementById("matchupsContainer");
const statusMessage = document.getElementById("statusMessage");
const weekLabel = document.getElementById("weekLabel");
const standingsContainer = document.getElementById("standingsContainer");

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

// ------------- Auth button -------------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ------------- Matchups button -------------

if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", async () => {
    try {
      setStatus("Refreshing this week's matchups...");
      if (!scoreboardData) {
        await loadScoreboardAndMatchups();
      } else {
        const matchups = extractMatchups(scoreboardData);
        if (!matchups || matchups.length === 0) {
          setStatus("No matchups found for this week.");
          if (matchupsContainer) matchupsContainer.innerHTML = "";
          return;
        }
        renderMatchupCards(matchups);
        setStatus(`Showing ${matchups.length} matchups for this week.`);
      }
    } catch (err) {
      console.error("Error on Load Matchups click:", err);
      setStatus("Error refreshing matchups.");
    }
  });
}

// ------------- Data parsing (scoreboard → matchups) -------------

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

// ------------- Standings parsing -------------

function extractStandings(data) {
  try {
    const fc = data.fantasy_content;
    const leagueArray = fc.league;
    const standings = leagueArray[1].standings;
    const teamsObj = standings.teams;

    const teams = [];

    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const teamArr = teamsObj[key].team;
        const metaArr = teamArr[0];
        const stand = teamArr[1]?.team_standings || {};

        const name = pluckField(metaArr, "name") || "Unknown Team";

        const managersObj = pluckField(metaArr, "managers");
        let managerName = "";
        if (Array.isArray(managersObj) && managersObj[0]?.manager?.nickname) {
          managerName = managersObj[0].manager.nickname;
        }

        const logoObj = pluckField(metaArr, "team_logos");
        const logo =
          logoObj && logoObj[0]?.team_logo?.url
            ? logoObj[0].team_logo.url
            : null;

        const outcomes = stand.outcome_totals || {};
        const wins = outcomes.wins ?? "0";
        const losses = outcomes.losses ?? "0";
        const ties = outcomes.ties ?? "0";

        const pf = stand.points_for ?? "0.00";
        const pa = stand.points_against ?? "0.00";
        const rank = stand.rank ?? "-";

        teams.push({
          rank,
          name,
          managerName,
          logo,
          wins,
          losses,
          ties,
          pf,
          pa,
        });
      });

    // Sort by rank if available
    teams.sort((a, b) => {
      const ra = parseInt(a.rank, 10);
      const rb = parseInt(b.rank, 10);
      if (Number.isNaN(ra) || Number.isNaN(rb)) return 0;
      return ra - rb;
    });

    return teams;
  } catch (err) {
    console.error("Error extracting standings:", err);
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

function renderStandings(teams) {
  if (!standingsContainer) return;

  if (!teams || teams.length === 0) {
    standingsContainer.innerHTML = `<p class="status-message">No standings data available.</p>`;
    return;
  }

  const table = document.createElement("table");
  table.className = "standings-table";

  table.innerHTML = `
    <thead>
      <tr>
        <th>Rank</th>
        <th>Team</th>
        <th>Mgr</th>
        <th>Record</th>
        <th>PF</th>
        <th>PA</th>
      </tr>
    </thead>
    <tbody>
      ${teams
        .map((t) => {
          const record = `${t.wins}-${t.losses}${
            t.ties && t.ties !== "0" ? `-${t.ties}` : ""
          }`;
          return `
          <tr>
            <td>${t.rank}</td>
            <td class="standings-team-cell">
              ${
                t.logo
                  ? `<img src="${t.logo}" class="standings-logo" alt="${t.name}" />`
                  : ""
              }
              <span>${t.name}</span>
            </td>
            <td>${t.managerName || ""}</td>
            <td>${record}</td>
            <td>${t.pf}</td>
            <td>${t.pa}</td>
          </tr>
        `;
        })
        .join("")}
    </tbody>
  `;

  standingsContainer.innerHTML = "";
  standingsContainer.appendChild(table);
}

// ------------- Loading functions -------------

async function loadScoreboardAndMatchups() {
  try {
    setStatus("Loading scoreboard and matchups...");

    const res = await fetch(`${backendBase}/scoreboard`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      setStatus("Failed to load scoreboard.");
      return;
    }

    const data = await res.json();
    scoreboardData = data;

    // Update week label
    try {
      const leagueArr = data?.fantasy_content?.league;
      const leagueMeta = leagueArr?.[0];
      const scoreboard = leagueArr?.[1]?.scoreboard;
      const week = scoreboard?.week ?? leagueMeta?.current_week;
      if (weekLabel && week != null) {
        weekLabel.textContent = `Week ${week}`;
      }
    } catch (e) {
      console.warn("Couldn't read week label:", e);
    }

    // Render matchups
    const matchups = extractMatchups(data);
    if (!matchups || matchups.length === 0) {
      setStatus("No matchups found for this week.");
      if (matchupsContainer) matchupsContainer.innerHTML = "";
      return;
    }

    renderMatchupCards(matchups);
    setStatus(`Loaded ${matchups.length} matchups.`);
  } catch (err) {
    console.error("Error loading scoreboard:", err);
    setStatus("Error loading scoreboard.");
  }
}

async function loadStandings() {
  if (!standingsContainer) return;

  standingsContainer.innerHTML = `<p class="status-message">Loading standings...</p>`;

  try {
    const res = await fetch(`${backendBase}/standings`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Standings error:", res.status, text);
      standingsContainer.innerHTML = `<p class="status-message">Failed to load standings.</p>`;
      return;
    }

    const data = await res.json();
    const teams = extractStandings(data);
    renderStandings(teams);
  } catch (err) {
    console.error("Error loading standings:", err);
    standingsContainer.innerHTML = `<p class="status-message">Error loading standings.</p>`;
  }
}

// ------------- Auto load on page ready -------------

async function autoLoadEverything() {
  await loadScoreboardAndMatchups();
  await loadStandings();
}

window.addEventListener("DOMContentLoaded", autoLoadEverything);
