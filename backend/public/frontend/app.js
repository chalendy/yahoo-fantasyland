const backend = "https://yh-fantasyland.onrender.com";

const authBtn = document.getElementById("authBtn");
const loadScoreboardBtn = document.getElementById("loadScoreboardBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const output = document.getElementById("output");
const matchupsContainer = document.getElementById("matchups");

// --- Sign in with Yahoo ---
authBtn.addEventListener("click", () => {
  window.location.href = `${backend}/auth/start`;
});

// --- Load raw scoreboard JSON (for debugging) ---
loadScoreboardBtn.addEventListener("click", async () => {
  output.textContent = "Loading scoreboard JSON...";
  matchupsContainer.innerHTML = "";

  try {
    const res = await fetch(`${backend}/scoreboard`);
    const text = await res.text();

    // Try to parse, but also show raw if it fails
    try {
      const data = JSON.parse(text);
      console.log("Scoreboard JSON:", data);
      output.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      console.error("Failed to parse JSON, raw text:", text);
      output.textContent = text;
    }
  } catch (err) {
    console.error("Error fetching scoreboard:", err);
    output.textContent = "Error fetching scoreboard. See console for details.";
  }
});

// --- Load matchups for the current week ---
loadMatchupsBtn.addEventListener("click", async () => {
  output.textContent = "";
  matchupsContainer.innerHTML = "Loading matchups...";

  try {
    const res = await fetch(`${backend}/scoreboard`);
    if (!res.ok) {
      const errText = await res.text();
      console.error("Scoreboard error:", res.status, errText);
      matchupsContainer.innerHTML = `Error: ${res.status}`;
      return;
    }

    const data = await res.json();
    console.log("Scoreboard JSON for matchups:", data);

    const matchups = extractMatchupsFromScoreboard(data);

    if (!matchups.length) {
      matchupsContainer.innerHTML = "<p>No matchups found in scoreboard data.</p>";
      return;
    }

    renderMatchups(matchups);
  } catch (err) {
    console.error("Error loading matchups:", err);
    matchupsContainer.innerHTML = "Error loading matchups. See console for details.";
  }
});

// --- Parse matchups from Yahoo scoreboard JSON ---
function extractMatchupsFromScoreboard(scoreboardJson) {
  const results = [];

  if (!scoreboardJson || !scoreboardJson.fantasy_content) {
    console.warn("No fantasy_content in JSON");
    return results;
  }

  const fantasy = scoreboardJson.fantasy_content;
  const leagueArr = fantasy.league;

  if (!Array.isArray(leagueArr)) {
    console.warn("league is not an array", leagueArr);
    return results;
  }

  // leagueArr looks like: [ {meta}, {scoreboard: {...}}, "count" ]
  const scoreboardEntry = leagueArr.find((item) => item && item.scoreboard);
  if (!scoreboardEntry) {
    console.warn("No scoreboard entry in league[]");
    return results;
  }

  const scoreboard = scoreboardEntry.scoreboard;

  // Typical structure: scoreboard["0"] = { matchups: {...}, week: ..., ... }
  const scoreboard0 = scoreboard["0"] || scoreboard[0];
  if (!scoreboard0 || !scoreboard0.matchups) {
    console.warn("No matchups object in scoreboard[0]", scoreboard0);
    return results;
  }

  const matchupsObj = scoreboard0.matchups;
  const matchupCount = parseInt(matchupsObj.count, 10) || 0;

  for (let i = 0; i < matchupCount; i++) {
    const key = String(i);
    const matchupWrapper = matchupsObj[key];
    if (!matchupWrapper || !matchupWrapper.matchup) continue;

    const matchup = matchupWrapper.matchup;
    const teamsObj = matchup.teams;
    const teamCount = parseInt(teamsObj.count, 10) || 0;

    const teams = [];

    for (let t = 0; t < teamCount; t++) {
      const tkey = String(t);
      const teamWrapper = teamsObj[tkey];
      if (!teamWrapper || !teamWrapper.team) continue;

      const teamArr = teamWrapper.team;
      const metaArr = Array.isArray(teamArr[0]) ? teamArr[0] : [];
      const statsObj = teamArr[1] || {};

      // Find the object with a "name" property in metaArr
      let teamName = "Unknown Team";
      for (const item of metaArr) {
        if (item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, "name")) {
          teamName = item.name;
          break;
        }
      }

      const teamPoints = statsObj.team_points?.total ?? "0.00";
      const projectedPoints = statsObj.team_projected_points?.total ?? "0.00";

      teams.push({
        name: teamName,
        points: teamPoints,
        projected: projectedPoints,
      });
    }

    if (teams.length === 2) {
      results.push({
        home: teams[0],
        away: teams[1],
      });
    }
  }

  return results;
}

// --- Render matchups into the DOM ---
function renderMatchups(matchups) {
  matchupsContainer.innerHTML = "";

  matchups.forEach((m, idx) => {
    const card = document.createElement("div");
    card.className = "matchup-card";

    card.innerHTML = `
      <div class="matchup-header">Matchup ${idx + 1}</div>
      <div class="matchup-body">
        <div class="team">
          <div class="team-name">${m.home.name}</div>
          <div class="team-points">
            <span class="actual">${m.home.points}</span>
            <span class="projected">(${m.home.projected})</span>
          </div>
        </div>
        <div class="vs">vs</div>
        <div class="team">
          <div class="team-name">${m.away.name}</div>
          <div class="team-points">
            <span class="actual">${m.away.points}</span>
            <span class="projected">(${m.away.projected})</span>
          </div>
        </div>
      </div>
    `;

    matchupsContainer.appendChild(card);
  });
}
