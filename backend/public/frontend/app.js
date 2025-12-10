const backend = "https://yh-fantasyland.onrender.com";

const authBtn = document.getElementById("authBtn");
const loadScoreboardBtn = document.getElementById("loadScoreboardBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const output = document.getElementById("output");
const matchupsContainer = document.getElementById("matchups");

let lastScoreboard = null;

// ---------- Helpers ----------

// Safely get the "name" field from Yahoo's crazy team array
function getTeamName(teamNode) {
  // teamNode looks like: [ [ {team_key}, {team_id}, {name: "X"}, ... ], { team_points, ... } ]
  if (!Array.isArray(teamNode) || teamNode.length === 0) return "Unknown Team";
  const metaArray = teamNode[0]; // first element is an array of meta objects
  if (!Array.isArray(metaArray)) return "Unknown Team";

  const nameObj = metaArray.find((item) => item && item.name);
  return nameObj?.name || "Unknown Team";
}

function getTeamLogo(teamNode) {
  if (!Array.isArray(teamNode) || teamNode.length === 0) return null;
  const metaArray = teamNode[0];
  if (!Array.isArray(metaArray)) return null;

  const logosObj = metaArray.find((item) => item && item.team_logos);
  const logoUrl =
    logosObj?.team_logos?.[0]?.team_logo?.url || null;
  return logoUrl;
}

function getTeamPoints(teamNode) {
  if (!Array.isArray(teamNode) || teamNode.length < 2) return { total: "0.00", projected: "0.00" };
  const stats = teamNode[1]; // second element: { win_probability, team_points, team_projected_points }

  const total = stats?.team_points?.total ?? "0.00";
  const projected = stats?.team_projected_points?.total ?? "0.00";

  return { total, projected };
}

// Extract matchups from Yahoo JSON
function extractMatchups(scoreboardJson) {
  try {
    const fc = scoreboardJson.fantasy_content;
    if (!fc || !Array.isArray(fc.league) || fc.league.length < 2) return [];

    const leagueMeta = fc.league[0];
    const scoreboardWrapper = fc.league[1].scoreboard;
    const currentWeek = scoreboardWrapper.week;
    const scoreboardData = scoreboardWrapper["0"];
    const matchupsObj = scoreboardData.matchups;

    const matchups = [];

    Object.keys(matchupsObj).forEach((key) => {
      if (key === "count") return;

      const matchupNode = matchupsObj[key].matchup;
      const matchup0 = matchupNode["0"]; // actual matchup container
      const teamsObj = matchup0.teams;

      const team0Node = teamsObj["0"]?.team;
      const team1Node = teamsObj["1"]?.team;

      const teamAName = getTeamName(team0Node);
      const teamALogo = getTeamLogo(team0Node);
      const teamAPoints = getTeamPoints(team0Node);

      const teamBName = getTeamName(team1Node);
      const teamBLogo = getTeamLogo(team1Node);
      const teamBPoints = getTeamPoints(team1Node);

      matchups.push({
        week: matchup0.week || currentWeek,
        teamA: {
          name: teamAName,
          logo: teamALogo,
          points: teamAPoints.total,
          projected: teamAPoints.projected,
        },
        teamB: {
          name: teamBName,
          logo: teamBLogo,
          points: teamBPoints.total,
          projected: teamBPoints.projected,
        },
      });
    });

    return matchups;
  } catch (e) {
    console.error("Error extracting matchups:", e);
    return [];
  }
}

function renderMatchups(matchups) {
  if (!matchupsContainer) return;

  if (!matchups || matchups.length === 0) {
    matchupsContainer.innerHTML = `<p>No matchups found for this week.</p>`;
    return;
  }

  matchupsContainer.innerHTML = matchups
    .map((m) => {
      return `
        <div class="matchup-card">
          <div class="matchup-week">Week ${m.week}</div>
          <div class="matchup-teams">
            <div class="team">
              ${m.teamA.logo ? `<img src="${m.teamA.logo}" alt="${m.teamA.name}" class="team-logo" />` : ""}
              <div class="team-name">${m.teamA.name}</div>
              <div class="team-score">
                <span class="actual">${m.teamA.points}</span>
                <span class="projected">(${m.teamA.projected} proj)</span>
              </div>
            </div>
            <div class="vs">vs</div>
            <div class="team">
              ${m.teamB.logo ? `<img src="${m.teamB.logo}" alt="${m.teamB.name}" class="team-logo" />` : ""}
              <div class="team-name">${m.teamB.name}</div>
              <div class="team-score">
                <span class="actual">${m.teamB.points}</span>
                <span class="projected">(${m.teamB.projected} proj)</span>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

// ---------- Button handlers ----------

authBtn?.addEventListener("click", () => {
  window.location.href = `${backend}/auth/start`;
});

loadScoreboardBtn?.addEventListener("click", async () => {
  output.textContent = "Loading scoreboard JSON...";
  matchupsContainer.innerHTML = ""; // clear matchups when loading raw JSON

  try {
    const res = await fetch(`${backend}/scoreboard`);
    const data = await res.json();
    lastScoreboard = data;
    output.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    console.error(err);
    output.textContent = "Error fetching scoreboard. See console for details.";
  }
});

loadMatchupsBtn?.addEventListener("click", () => {
  if (!lastScoreboard) {
    output.textContent = "No scoreboard loaded yet. Click 'Load Scoreboard JSON' first.";
    return;
  }
  const matchups = extractMatchups(lastScoreboard);
  renderMatchups(matchups);
});
