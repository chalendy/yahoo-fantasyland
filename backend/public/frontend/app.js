const backend = "https://yh-fantasyland.onrender.com";

const authBtn = document.getElementById("authBtn");
const loadBtn = document.getElementById("loadBtn");
const output = document.getElementById("output");
const matchupsContainer = document.getElementById("matchups");

// --- Sign in with Yahoo ---
authBtn.addEventListener("click", () => {
  window.location.href = `${backend}/auth/start`;
});

// --- Load scoreboard & show matchups ---
loadBtn.addEventListener("click", async () => {
  matchupsContainer.innerHTML = "";
  output.textContent = "Loading scoreboard...";

  try {
    const res = await fetch(`${backend}/scoreboard`);

    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      output.textContent = `Error fetching scoreboard: ${res.status}`;
      return;
    }

    const data = await res.json();
    console.log("Scoreboard JSON:", data);

    // Show raw JSON for debugging
    output.textContent = JSON.stringify(data, null, 2);

    // Render nice matchup list
    renderMatchups(data);
  } catch (err) {
    console.error("Fetch error:", err);
    output.textContent = "Error fetching scoreboard. See console for details.";
  }
});

// --- Helper: safely get matchups & render them ---
function renderMatchups(data) {
  matchupsContainer.innerHTML = "";

  try {
    // Yahoo JSON is deeply nested. The usual structure for league scoreboard is:
    // data.fantasy_content.league[1].scoreboard[0].matchups
    const fantasy = data.fantasy_content;
    const league = fantasy.league;
    const leagueMeta = league[0]; // contains name, etc.
    const leagueData = league[1]; // contains scoreboard, settings, etc.

    const scoreboard = leagueData.scoreboard[0];
    const week = scoreboard.week ?? scoreboard.week_start ?? "Current";

    const matchupsObj = scoreboard.matchups;

    const matchupKeys = Object.keys(matchupsObj).filter((k) => k !== "count");

    if (matchupKeys.length === 0) {
      matchupsContainer.innerHTML = "<p>No matchups found.</p>";
      return;
    }

    const title = document.createElement("h3");
    title.textContent = `Week ${week} Matchups`;
    matchupsContainer.appendChild(title);

    const list = document.createElement("div");
    list.className = "matchup-list";
    matchupsContainer.appendChild(list);

    matchupKeys.forEach((key) => {
      const matchupWrapper = matchupsObj[key];
      const matchup = matchupWrapper.matchup;

      // In Yahoo JSON, matchup.teams is usually on matchup[0] or directly on matchup. 
      const teamsObj = matchup[0]?.teams || matchup.teams;
      if (!teamsObj) return;

      const teamKeys = Object.keys(teamsObj).filter((k) => k !== "count");
      if (teamKeys.length < 2) return;

      const teamA = teamsObj[teamKeys[0]].team;
      const teamB = teamsObj[teamKeys[1]].team;

      const teamAInfo = extractTeamInfo(teamA);
      const teamBInfo = extractTeamInfo(teamB);

      const card = document.createElement("div");
      card.className = "matchup-card";
      card.innerHTML = `
        <div class="matchup-row">
          <div class="team">
            <div class="team-name">${teamAInfo.name}</div>
            <div class="team-score">${teamAInfo.points}</div>
          </div>
          <div class="vs">vs</div>
          <div class="team">
            <div class="team-name">${teamBInfo.name}</div>
            <div class="team-score">${teamBInfo.points}</div>
          </div>
        </div>
      `;

      list.appendChild(card);
    });
  } catch (err) {
    console.error("Error parsing matchups:", err);
    matchupsContainer.innerHTML =
      "<p>Could not parse matchups from scoreboard. Check console for details.</p>";
  }
}

// Extracts name + points from a Yahoo "team" array
function extractTeamInfo(teamArray) {
  // teamArray is an array of objects, e.g. [{team_key...}, {team_points...}, ...]
  let name = "Unknown Team";
  let points = "-";

  if (!Array.isArray(teamArray)) {
    return { name, points };
  }

  for (const block of teamArray) {
    if (block.name) {
      name = block.name;
    }
    if (block.team_points) {
      // team_points may be an object with total, or an array
      if (typeof block.team_points.total !== "undefined") {
        points = block.team_points.total;
      } else if (Array.isArray(block.team_points) && block.team_points[0]?.total) {
        points = block.team_points[0].total;
      }
    }
  }

  return { name, points };
}
