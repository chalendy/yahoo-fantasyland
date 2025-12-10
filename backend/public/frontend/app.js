// Use same origin as backend (Render serves frontend + backend together)
const backend = window.location.origin;

// DOM elements
const authBtn = document.getElementById("authBtn");
const loadScoreboardBtn = document.getElementById("loadScoreboardBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");

let lastScoreboard = null;

// ---------------
// Button handlers
// ---------------

// Sign in with Yahoo
authBtn.addEventListener("click", () => {
  window.location.href = `${backend}/auth/start`;
});

// Load full raw scoreboard JSON
loadScoreboardBtn.addEventListener("click", async () => {
  jsonOutput.textContent = "Loading scoreboard JSON...";
  matchupsContainer.innerHTML = "";

  try {
    const res = await fetch(`${backend}/scoreboard`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      jsonOutput.textContent = `Error fetching scoreboard: ${res.status}`;
      return;
    }

    const data = await res.json();
    lastScoreboard = data;

    jsonOutput.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    console.error("Scoreboard fetch error:", err);
    jsonOutput.textContent = "Error fetching scoreboard. See console for details.";
  }
});

// Render this week's matchups as pretty cards
loadMatchupsBtn.addEventListener("click", () => {
  if (!lastScoreboard) {
    matchupsContainer.innerHTML =
      `<p class="matchups-message">No scoreboard loaded yet. Click "Load Scoreboard JSON" first.</p>`;
    return;
  }

  renderMatchups(lastScoreboard);
});

// ------------------
// Parsing helpers
// ------------------

function renderMatchups(scoreboardJson) {
  matchupsContainer.innerHTML = "";

  const fantasy = scoreboardJson?.fantasy_content;
  if (!fantasy || !fantasy.league || !Array.isArray(fantasy.league)) {
    matchupsContainer.innerHTML =
      `<p class="matchups-message">Could not find league data in JSON.</p>`;
    return;
  }

  const leagueMeta = fantasy.league[0];
  const scoreboardWrapper = fantasy.league[1]?.scoreboard;
  const weekNumber = scoreboardWrapper?.week ?? leagueMeta?.current_week ?? "?";

  const scoreboardRoot = scoreboardWrapper?.["0"];
  const matchupsObj = scoreboardRoot?.matchups;

  if (!matchupsObj) {
    matchupsContainer.innerHTML =
      `<p class="matchups-message">No matchups found in scoreboard.</p>`;
    return;
  }

  const matchupKeys = Object.keys(matchupsObj).filter((k) => k !== "count");

  if (matchupKeys.length === 0) {
    matchupsContainer.innerHTML =
      `<p class="matchups-message">No matchups found for this week.</p>`;
    return;
  }

  matchupKeys.forEach((key, index) => {
    const matchupWrapper = matchupsObj[key]?.matchup;
    if (!matchupWrapper) return;

    const matchupCore = matchupWrapper["0"];
    const meta = matchupWrapper;
    const week = meta.week ?? weekNumber;
    const status = normalizeStatus(meta.status);
    const teamsObj = matchupCore?.teams;

    if (!teamsObj) return;

    const teamKeys = Object.keys(teamsObj).filter((k) => k !== "count");
    if (teamKeys.length < 2) return;

    const teamA = extractTeamInfo(teamsObj[teamKeys[0]]);
    const teamB = extractTeamInfo(teamsObj[teamKeys[1]]);

    const card = buildMatchupCard(teamA, teamB, week, status, index + 1);
    matchupsContainer.appendChild(card);
  });
}

function normalizeStatus(status) {
  if (!status) return "Upcoming";
  if (status === "postevent") return "Final";
  if (status === "midevent") return "Live";
  return status;
}

function extractTeamInfo(teamWrapper) {
  // In Yahoo JSON, teamWrapper.team is an array:
  // [ [meta objects...], statsObject ]
  const teamArray = teamWrapper?.team;
  if (!Array.isArray(teamArray) || teamArray.length < 2) {
    return {
      name: "Unknown Team",
      logo: "",
      points: "0.00",
      projected: "0.00",
      winProb: null,
    };
  }

  const metaArray = Array.isArray(teamArray[0]) ? teamArray[0] : [];
  const stats = teamArray[1] || {};

  const name =
    findInMeta(metaArray, "name") ??
    "Unknown Team";

  const logo =
    findInMeta(metaArray, "team_logos", true) ??
    "";

  const managerNickname = findManagerNickname(metaArray);

  const points = stats?.team_points?.total ?? "0.00";
  const projected = stats?.team_projected_points?.total ?? "0.00";

  let winProb = stats?.win_probability;
  if (typeof winProb === "number") {
    winProb = Math.round(winProb * 100);
  } else {
    winProb = null;
  }

  return {
    name,
    logo,
    managerNickname,
    points,
    projected,
    winProb,
  };
}

function findInMeta(metaArray, key, isLogo = false) {
  for (const item of metaArray) {
    if (!item) continue;
    if (Object.prototype.hasOwnProperty.call(item, key)) {
      if (isLogo) {
        try {
          return item.team_logos?.[0]?.team_logo?.url || "";
        } catch {
          return "";
        }
      }
      return item[key];
    }
  }
  return null;
}

function findManagerNickname(metaArray) {
  for (const item of metaArray) {
    if (!item) continue;
    if (item.managers && Array.isArray(item.managers)) {
      const manager = item.managers[0]?.manager;
      if (manager?.nickname) return manager.nickname;
    }
  }
  return null;
}

// ------------------
// UI builder
// ------------------

function buildMatchupCard(teamA, teamB, week, status, index) {
  const card = document.createElement("div");
  card.className = "match-card";

  // Header
  const header = document.createElement("div");
  header.className = "match-card-header";
  header.innerHTML = `
    <div class="match-week">Week ${week}</div>
    <div class="match-status ${status.toLowerCase()}">${status}</div>
  `;
  card.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "match-card-body";

  const left = createTeamColumn(teamA, "left");
  const center = document.createElement("div");
  center.className = "match-vs-pill";
  center.textContent = "VS";

  const right = createTeamColumn(teamB, "right");

  body.appendChild(left);
  body.appendChild(center);
  body.appendChild(right);

  card.appendChild(body);

  return card;
}

function createTeamColumn(team, side) {
  const col = document.createElement("div");
  col.className = `match-team match-team-${side}`;

  const avatar = document.createElement("div");
  avatar.className = "team-avatar";
  if (team.logo) {
    avatar.style.backgroundImage = `url(${team.logo})`;
  } else {
    avatar.textContent = team.name.charAt(0).toUpperCase();
  }

  const name = document.createElement("div");
  name.className = "team-name";
  name.textContent = team.name;

  const manager = document.createElement("div");
  manager.className = "team-manager";
  if (team.managerNickname) {
    manager.textContent = `Manager: ${team.managerNickname}`;
  }

  const scoreRow = document.createElement("div");
  scoreRow.className = "team-score-row";
  scoreRow.innerHTML = `
    <div class="team-points">${team.points}</div>
    <div class="team-projected">Proj: ${team.projected}</div>
  `;

  const winRow = document.createElement("div");
  winRow.className = "team-win-row";
  winRow.textContent =
    team.winProb !== null ? `${team.winProb}% win chance` : "Win% N/A";

  col.appendChild(avatar);
  col.appendChild(name);
  if (team.managerNickname) col.appendChild(manager);
  col.appendChild(scoreRow);
  col.appendChild(winRow);

  return col;
}
