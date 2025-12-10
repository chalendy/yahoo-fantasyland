const backend = "https://yh-fantasyland.onrender.com";

const authBtn = document.getElementById("authBtn");
const loadScoreboardBtn = document.getElementById("loadScoreboardBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const output = document.getElementById("output");
const matchupsContainer = document.getElementById("matchupsContainer");

// ---------- SIGN IN WITH YAHOO ----------
authBtn.addEventListener("click", () => {
  window.location.href = `${backend}/auth/start`;
});

// ---------- LOAD RAW SCOREBOARD JSON ----------
loadScoreboardBtn.addEventListener("click", async () => {
  output.textContent = "Loading scoreboard...";
  matchupsContainer.innerHTML = "";

  try {
    const res = await fetch(`${backend}/scoreboard`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      output.textContent = `Error fetching scoreboard: ${res.status}`;
      return;
    }

    const data = await res.json();
    output.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    console.error("Fetch error:", err);
    output.textContent = "Error fetching scoreboard. See console for details.";
  }
});

// ---------- LOAD / RENDER THIS WEEK'S MATCHUPS ----------
loadMatchupsBtn.addEventListener("click", async () => {
  output.textContent = "";
  matchupsContainer.innerHTML = "Loading matchups...";

  try {
    const res = await fetch(`${backend}/scoreboard`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      matchupsContainer.textContent = `Error fetching scoreboard: ${res.status}`;
      return;
    }

    const data = await res.json();
    const matchups = extractMatchupsFromScoreboard(data);

    if (!matchups.length) {
      matchupsContainer.textContent = "No matchups found.";
      return;
    }

    // Render matchups
    matchupsContainer.innerHTML = "";
    matchups.forEach((m) => {
      const card = document.createElement("div");
      card.className = "matchup-card";
      card.innerHTML = `
        <div class="team">
          <div class="team-name">${m.teamA.name}</div>
          <div class="team-points">${m.teamA.points} pts</div>
          ${
            m.teamA.projected
              ? `<div class="team-projected">Proj: ${m.teamA.projected}</div>`
              : ""
          }
        </div>
        <div class="vs">vs</div>
        <div class="team">
          <div class="team-name">${m.teamB.name}</div>
          <div class="team-points">${m.teamB.points} pts</div>
          ${
            m.teamB.projected
              ? `<div class="team-projected">Proj: ${m.teamB.projected}</div>`
              : ""
          }
        </div>
      `;
      matchupsContainer.appendChild(card);
    });
  } catch (err) {
    console.error("Matchups fetch/parsing error:", err);
    matchupsContainer.textContent = "Error loading matchups. See console.";
  }
});

// ---------- HELPERS TO PARSE YAHOO JSON ----------

function extractMatchupsFromScoreboard(data) {
  try {
    const fc = data.fantasy_content;
    if (!fc || !fc.league) return [];

    const league = fc.league[1]; // index 0 is meta, 1 is content
    const scoreboard = league.scoreboard[1];
    const matchupsObj = scoreboard.matchups;
    const count = Number(matchupsObj.count || 0);

    const result = [];

    for (let i = 0; i < count; i++) {
      const key = String(i);
      const matchupWrapper = matchupsObj[key];
      if (!matchupWrapper || !matchupWrapper.matchup) continue;

      const matchup = matchupWrapper.matchup;
      // structure: { "0": { teams: {...} }, week: "...", ... }
      const firstKey = "0";
      const teamsObj = matchup[firstKey]?.teams;
      if (!teamsObj) continue;

      const team0 = teamsObj["0"]?.team;
      const team1 = teamsObj["1"]?.team;
      if (!team0 || !team1) continue;

      const parsedA = parseYahooTeamNode(team0);
      const parsedB = parseYahooTeamNode(team1);

      result.push({
        teamA: parsedA,
        teamB: parsedB,
      });
    }

    return result;
  } catch (e) {
    console.error("Error parsing matchups:", e);
    return [];
  }
}

function parseYahooTeamNode(teamNode) {
  // teamNode is an array: [ [ meta objects... ], { team_points, team_projected_points, ... } ]
  const metaArray = teamNode[0] || [];
  const scoring = teamNode[1] || {};

  const nameObj = metaArray.find((item) => item && item.name);
  const name = nameObj?.name || "Unknown Team";

  const teamPoints = scoring.team_points?.total ?? "0.00";
  const projected = scoring.team_projected_points?.total ?? null;

  return {
    name,
    points: teamPoints,
    projected,
  };
}
