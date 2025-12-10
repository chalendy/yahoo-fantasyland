// Same-origin backend (Render serves frontend + backend together)
const backendBase = "";

// Elements
const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const weekLabel = document.getElementById("weekLabel");

// --- Helpers to safely walk Yahoo's nested JSON ---

function getMatchupsFromScoreboard(data) {
  try {
    // fantasy_content.league[1].scoreboard[1]
    const league = data?.fantasy_content?.league;
    if (!Array.isArray(league) || league.length < 2) return { week: null, matchups: [] };

    const scoreboardWrapper = league[1]?.scoreboard;
    if (!Array.isArray(scoreboardWrapper) || scoreboardWrapper.length < 2) {
      return { week: null, matchups: [] };
    }

    const scoreboard = scoreboardWrapper[1];
    const week = scoreboard?.week || scoreboardWrapper[0]?.week || null;

    const matchupsNode = scoreboard?.matchups?.matchup;
    if (!matchupsNode) return { week, matchups: [] };

    let matchupList = [];

    if (Array.isArray(matchupsNode)) {
      matchupList = matchupsNode;
    } else if (typeof matchupsNode === "object") {
      // When matchup is an object keyed by "0", "1", ..., plus extra fields
      Object.keys(matchupsNode).forEach((key) => {
        if (!Number.isNaN(Number(key))) {
          matchupList.push(matchupsNode[key]);
        }
      });
    }

    return { week, matchups: matchupList };
  } catch (e) {
    console.error("Error parsing matchups:", e);
    return { week: null, matchups: [] };
  }
}

function extractTeamInfo(teamWrapper) {
  // teamWrapper looks like: { team: [ metaArray, statsObj ] }
  const teamArray = teamWrapper?.team;
  if (!Array.isArray(teamArray) || teamArray.length < 2) {
    return {
      name: "Unknown Team",
      score: "0.00",
      projected: "",
    };
  }

  const metaArray = teamArray[0];
  const statsObj = teamArray[1];

  let name = "Unknown Team";

  if (Array.isArray(metaArray)) {
    const nameObj = metaArray.find((item) => item && typeof item === "object" && item.name);
    if (nameObj && nameObj.name) {
      name = nameObj.name;
    }
  }

  const score = statsObj?.team_points?.total ?? "0.00";
  const projected = statsObj?.team_projected_points?.total ?? "";

  return { name, score, projected };
}

function renderMatchups(matchInfo) {
  const { week, matchups } = matchInfo;

  matchupsContainer.innerHTML = "";
  weekLabel.textContent = week ? `Week ${week}` : "";

  if (!matchups || matchups.length === 0) {
    matchupsContainer.innerHTML = `<p>No matchups found for this week.</p>`;
    return;
  }

  matchups.forEach((matchup, index) => {
    const teamsNode = matchup?.teams;
    if (!teamsNode) return;

    let teamWrappers = [];

    if (Array.isArray(teamsNode)) {
      teamWrappers = teamsNode;
    } else if (typeof teamsNode === "object") {
      Object.keys(teamsNode).forEach((key) => {
        if (!Number.isNaN(Number(key))) {
          teamWrappers.push(teamsNode[key]);
        }
      });
    }

    if (teamWrappers.length < 2) return;

    const teamA = extractTeamInfo(teamWrappers[0]);
    const teamB = extractTeamInfo(teamWrappers[1]);

    const card = document.createElement("div");
    card.className = "matchup-card";
    card.innerHTML = `
      <div class="matchup-header">
        <div class="matchup-label">Matchup ${index + 1}</div>
        <div class="matchup-meta">vs</div>
      </div>
      <div class="team-row">
        <div class="team-name">${teamA.name}</div>
        <div class="team-points">
          <div class="team-score">${teamA.score}</div>
          <div class="team-proj">Proj: ${teamA.projected}</div>
        </div>
      </div>
      <div class="team-row">
        <div class="team-name">${teamB.name}</div>
        <div class="team-points">
          <div class="team-score">${teamB.score}</div>
          <div class="team-proj">Proj: ${teamB.projected}</div>
        </div>
      </div>
    `;

    matchupsContainer.appendChild(card);
  });
}

// --- Button wiring ---

authBtn?.addEventListener("click", () => {
  window.location.href = `${backendBase}/auth/start`;
});

loadJsonBtn?.addEventListener("click", async () => {
  jsonOutput.textContent = "Loading...";
  try {
    const res = await fetch(`${backendBase}/scoreboard`);
    if (!res.ok) {
      const txt = await res.text();
      jsonOutput.textContent = `Error ${res.status}:\n${txt}`;
      return;
    }
    const data = await res.json();
    jsonOutput.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    console.error(err);
    jsonOutput.textContent = "Error fetching JSON. See console.";
  }
});

loadMatchupsBtn?.addEventListener("click", async () => {
  matchupsContainer.innerHTML = "<p>Loading matchups...</p>";
  try {
    const res = await fetch(`${backendBase}/scoreboard`);
    if (!res.ok) {
      const txt = await res.text();
      matchupsContainer.innerHTML = `<p>Error ${res.status}: ${txt}</p>`;
      return;
    }
    const data = await res.json();
    const matchInfo = getMatchupsFromScoreboard(data);
    renderMatchups(matchInfo);
  } catch (err) {
    console.error("Error loading matchups:", err);
    matchupsContainer.innerHTML = "<p>Error loading matchups. See console.</p>";
  }
});
