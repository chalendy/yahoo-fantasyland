const backend = window.location.origin;

// UI elements
const authBtn = document.getElementById("authBtn");
const reloadJsonBtn = document.getElementById("reloadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const weekSelect = document.getElementById("weekSelect");

const scoreboardJsonEl = document.getElementById("scoreboardJson");
const matchupsContainer = document.getElementById("matchupsContainer");
const matchupsMessage = document.getElementById("matchupsMessage");
const matchupsTitle = document.getElementById("matchupsTitle");

let cachedScoreboard = null;
let currentWeek = null;

/* ============================
   AUTH
============================ */

authBtn.addEventListener("click", () => {
  window.location.href = `${backend}/auth/start`;
});

/* ============================
   LOAD SCOREBOARD JSON
============================ */

async function loadScoreboardJson() {
  matchupsMessage.textContent = "Loading scoreboard…";

  try {
    const res = await fetch(`${backend}/api/scoreboard`);
    const data = await res.json();

    cachedScoreboard = data;
    scoreboardJsonEl.textContent = JSON.stringify(data, null, 2);

    currentWeek = extractCurrentWeek(data);
    populateWeekSelect(currentWeek);
    matchupsMessage.textContent = `Loaded scoreboard for Week ${currentWeek}.`;

    return data;
  } catch (err) {
    matchupsMessage.textContent = "Failed to load scoreboard JSON.";
    console.error(err);
  }
}

reloadJsonBtn.addEventListener("click", loadScoreboardJson);

/* ============================
   WEEK SELECTOR
============================ */

function populateWeekSelect(selectedWeek) {
  weekSelect.innerHTML = "";

  for (let w = 1; w <= 17; w++) {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = `Week ${w}`;
    if (w === selectedWeek) opt.selected = true;
    weekSelect.appendChild(opt);
  }
}

weekSelect.addEventListener("change", () => {
  renderMatchups(Number(weekSelect.value));
});

/* ============================
   EXTRACT CURRENT WEEK
============================ */

function extractCurrentWeek(scoreboard) {
  try {
    return scoreboard?.fantasy_content?.league?.[1]?.scoreboard?.week || 1;
  } catch {
    return 1;
  }
}

/* ============================
   EXTRACT MATCHUPS
============================ */

function extractMatchups(scoreboard, week) {
  try {
    const matchupsObj =
      scoreboard.fantasy_content.league[1].scoreboard["0"].matchups;

    const list = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchup = matchupsObj[key].matchup["0"].teams;

        const home = matchup["0"].team;
        const away = matchup["1"].team;

        const homeData = Array.isArray(home[0]) ? home[0] : home;
        const awayData = Array.isArray(away[0]) ? away[0] : away;

        const hName = homeData.find((x) => x.name)?.name || "Unknown";
        const hLogo =
          homeData.find((x) => x.team_logos)?.team_logos?.[0]?.team_logo?.url ||
          "";
        const hProj = home[1]?.team_projected_points?.total || "0.00";
        const hScore = home[1]?.team_points?.total || "0.00";
        const hWinProb = ((home[1]?.win_probability || 0) * 100).toFixed(0);

        const aName = awayData.find((x) => x.name)?.name || "Unknown";
        const aLogo =
          awayData.find((x) => x.team_logos)?.team_logos?.[0]?.team_logo?.url ||
          "";
        const aProj = away[1]?.team_projected_points?.total || "0.00";
        const aScore = away[1]?.team_points?.total || "0.00";
        const aWinProb = ((away[1]?.win_probability || 0) * 100).toFixed(0);

        list.push({
          home: {
            name: hName,
            logo: hLogo,
            projected: hProj,
            score: hScore,
            winprob: hWinProb
          },
          away: {
            name: aName,
            logo: aLogo,
            projected: aProj,
            score: aScore,
            winprob: aWinProb
          },
          week
        });
      });

    return list;
  } catch (err) {
    console.error("Extract matchups failed:", err);
    return [];
  }
}

/* ============================
   OLD MATCHUP CARD LAYOUT (RESTORED)
============================ */

function createMatchupCard(m, week) {
  return `
    <div class="matchup-card">

      <div class="team-col">
        <span class="week-label">Week ${week}</span>

        <div class="team-top">
          <img class="team-logo" src="${m.home.logo}" />
          <div>
            <div class="team-name">${m.home.name}</div>
          </div>
        </div>

        <div class="team-score">${m.home.score}</div>
        <div class="team-proj">Proj: ${m.home.projected}</div>
        <div class="team-winprob">Win: ${m.home.winprob}%</div>
      </div>

      <div class="matchup-center">
        <div class="vs-text">VS</div>
      </div>

      <div class="team-col">
        <span class="week-label" style="opacity: 0;">Week ${week}</span>

        <div class="team-top" style="justify-content: flex-end;">
          <div>
            <div class="team-name" style="text-align: right;">${m.away.name}</div>
          </div>
          <img class="team-logo" src="${m.away.logo}" />
        </div>

        <div class="team-score" style="text-align: right;">${m.away.score}</div>
        <div class="team-proj" style="text-align: right;">Proj: ${m.away.projected}</div>
        <div class="team-winprob" style="text-align: right;">Win: ${m.away.winprob}%</div>
      </div>

      <div class="playoff-pill">Playoffs</div>
    </div>
  `;
}

/* ============================
   RENDER MATCHUPS
============================ */

function renderMatchups(week) {
  if (!cachedScoreboard) {
    matchupsMessage.textContent =
      "No scoreboard loaded yet. Click 'Load Scoreboard JSON' first.";
    return;
  }

  const matchups = extractMatchups(cachedScoreboard, week);
  matchupsTitle.textContent = `Week ${week} Matchups`;

  if (!matchups.length) {
    matchupsContainer.innerHTML = `<p>No matchups found for Week ${week}.</p>`;
    return;
  }

  matchupsContainer.innerHTML = matchups
    .map((m) => createMatchupCard(m, week))
    .join("");
}

/* ============================
   BUTTON — LOAD MATCHUPS
============================ */

loadMatchupsBtn.addEventListener("click", () => {
  renderMatchups(Number(weekSelect.value));
});

/* ============================
   AUTO LOAD ON PAGE START
============================ */

(async function init() {
  await loadScoreboardJson();
  renderMatchups(currentWeek);
})();
