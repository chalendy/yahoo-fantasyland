// ---------------------- CONFIG ----------------------

const backendBase = ""; // same-origin backend

// ---------------------- UI ELEMENTS ----------------------

const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");

const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const standingsContainer = document.getElementById("standingsContainer");

const statusMessage = document.getElementById("statusMessage");

const weekSelect = document.getElementById("weekSelect");
const weekLabel = document.getElementById("weekLabel");

let scoreboardData = null;
let currentWeek = null;

// ---------------------- HELPERS ----------------------

function setStatus(msg) {
  if (statusMessage) statusMessage.textContent = msg;
}

function pluckField(objArray, key) {
  if (!Array.isArray(objArray)) return null;
  for (const item of objArray) {
    if (item && Object.prototype.hasOwnProperty.call(item, key)) {
      return item[key];
    }
  }
  return null;
}

// ---------------------- AUTH BUTTON ----------------------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ---------------------- LOAD SCOREBOARD ----------------------

async function loadScoreboardForWeek(week) {
  try {
    setStatus(`Loading scoreboard for Week ${week}...`);

    const res = await fetch(`${backendBase}/scoreboard?week=${week}`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      setStatus("Error loading scoreboard.");
      return;
    }

    const data = await res.json();
    scoreboardData = data;

    jsonOutput.textContent = JSON.stringify(data, null, 2);

    // extract current week / matchup_week
    const leagueArr = data?.fantasy_content?.league;
    const leagueMeta = leagueArr?.[0];
    const scoreboard = leagueArr?.[1]?.scoreboard;

    currentWeek = scoreboard?.week ?? leagueMeta?.current_week;
    if (weekLabel) weekLabel.textContent = `Week ${currentWeek}`;

    renderMatchups(extractMatchups(data));

  } catch (err) {
    console.error("loadScoreboard error:", err);
    setStatus("Failed loading scoreboard.");
  }
}

// ---------------------- PARSE MATCHUPS ----------------------

function extractMatchups(data) {
  try {
    const fc = data?.fantasy_content;
    const leagueArr = fc?.league;
    const scoreboard = leagueArr?.[1]?.scoreboard;
    const scoreboardRoot = scoreboard?.["0"] ?? {};
    const matchupsObj = scoreboardRoot.matchups;

    if (!matchupsObj) return [];

    return Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .map((key) => {
        const matchup = matchupsObj[key].matchup;
        const matchupInner = matchup["0"];
        const teamsObj = matchupInner.teams;

        const team0 = teamsObj["0"].team;
        const team1 = teamsObj["1"].team;

        const t0meta = team0[0];
        const t1meta = team1[0];

        const t0stats = team0[1];
        const t1stats = team1[1];

        const nameA = pluckField(t0meta, "name");
        const nameB = pluckField(t1meta, "name");

        const logoA =
          pluckField(t0meta, "team_logos")?.[0]?.team_logo?.url ?? null;
        const logoB =
          pluckField(t1meta, "team_logos")?.[0]?.team_logo?.url ?? null;

        const scoreA = t0stats?.team_points?.total ?? "0.00";
        const scoreB = t1stats?.team_points?.total ?? "0.00";

        const projA = t0stats?.team_projected_points?.total ?? "0.00";
        const projB = t1stats?.team_projected_points?.total ?? "0.00";

        const probA = t0stats?.win_probability ?? null;
        const probB = t1stats?.win_probability ?? null;

        const leagueMeta = leagueArr?.[0];
        const wk = scoreboard?.week ?? leagueMeta?.current_week;

        return {
          week: wk,
          teamA: { name: nameA, logo: logoA, score: scoreA, projected: projA, prob: probA },
          teamB: { name: nameB, logo: logoB, score: scoreB, projected: projB, prob: probB }
        };
      });
  } catch (err) {
    console.error("extractMatchups error:", err);
    return [];
  }
}

// ---------------------- RENDER MATCHUPS ----------------------

function renderMatchups(matchups) {
  matchupsContainer.innerHTML = "";

  const isPlayoffs = currentWeek >= 15; // hide tag before week 15

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const probA = m.teamA.prob != null ? Math.round(m.teamA.prob * 100) : null;
    const probB = m.teamB.prob != null ? Math.round(m.teamB.prob * 100) : null;

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">Week ${m.week}</span>
        ${
          isPlayoffs
            ? `<span class="matchup-tag">Playoffs</span>`
            : ``
        }
      </div>

      <div class="matchup-body">
        <div class="team-column">
          <div class="team-info">
            ${
              m.teamA.logo
                ? `<img src="${m.teamA.logo}" class="team-logo">`
                : `<div class="team-logo placeholder-logo">A</div>`
            }
            <div>
              <div class="team-name">${m.teamA.name}</div>
              <div class="team-metadata">Proj: ${m.teamA.projected}${
                probA != null ? ` · Win%: ${probA}%` : ""
              }</div>
            </div>
          </div>
          <div class="team-score">${m.teamA.score}</div>
        </div>

        <div class="vs-column"><span class="vs-pill">VS</span></div>

        <div class="team-column">
          <div class="team-info team-info-right">
            <div>
              <div class="team-name">${m.teamB.name}</div>
              <div class="team-metadata">Proj: ${m.teamB.projected}${
                probB != null ? ` · Win%: ${probB}%` : ""
              }</div>
            </div>
            ${
              m.teamB.logo
                ? `<img src="${m.teamB.logo}" class="team-logo">`
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

// ---------------------- STANDINGS ----------------------

async function loadStandings() {
  try {
    const res = await fetch(`${backendBase}/standings`);
    if (!res.ok) {
      standingsContainer.innerHTML = "<p>Error loading standings.</p>";
      return;
    }

    const data = await res.json();

    const teamsObj =
      data?.fantasy_content?.league?.[1]?.standings?.[0]?.teams;

    if (!teamsObj) {
      standingsContainer.innerHTML = "<p>No standings available.</p>";
      return;
    }

    const teams = [];

    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const arr = teamsObj[key].team;

        const meta = arr[0];
        const points = arr[1]?.team_points?.total ?? "0";
        const standings = arr[2]?.team_standings;

        const name = pluckField(meta, "name");
        const logo =
          pluckField(meta, "team_logos")?.[0]?.team_logo?.url ?? null;

        teams.push({
          name,
          logo,
          rank: Number(standings?.rank ?? 99),
          wins: standings?.outcome_totals?.wins ?? 0,
          losses: standings?.outcome_totals?.losses ?? 0,
          pct: standings?.outcome_totals?.percentage ?? "0",
          pointsFor: standings?.points_for ?? "0",
        });
      });

    teams.sort((a, b) => a.rank - b.rank);

    renderStandings(teams);

  } catch (err) {
    console.error("standings error", err);
    standingsContainer.innerHTML = "<p>Error loading standings.</p>";
  }
}

function renderStandings(list) {
  standingsContainer.innerHTML = "";

  list.forEach((t) => {
    const row = document.createElement("div");
    row.className = "standing-row";

    row.innerHTML = `
      <div class="standing-team">
        ${
          t.logo
            ? `<img src="${t.logo}" class="standing-logo">`
            : `<div class="standing-logo placeholder-logo">T</div>`
        }
        <span>${t.rank}. ${t.name}</span>
      </div>
      <div class="standing-record">${t.wins}-${t.losses}</div>
      <div class="standing-points">${t.pointsFor} pts</div>
    `;

    standingsContainer.appendChild(row);
  });
}

// ---------------------- WEEK SELECT ----------------------

weekSelect?.addEventListener("change", () => {
  const wk = Number(weekSelect.value);
  if (!wk) return;
  loadScoreboardForWeek(wk);
});

// ---------------------- AUTO INITIAL LOAD ----------------------

async function init() {
  try {
    const res = await fetch(`${backendBase}/scoreboard`);
    if (!res.ok) return;

    const data = await res.json();
    scoreboardData = data;

    const leagueArr = data?.fantasy_content?.league;
    const meta = leagueArr?.[0];

    const start = Number(meta?.start_week ?? 1);
    const end = Number(meta?.end_week ?? 17);
    const curr = Number(meta?.current_week ?? start);

    weekSelect.innerHTML = "";

    for (let i = start; i <= end; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `Week ${i}`;
      if (i === curr) opt.selected = true;
      weekSelect.appendChild(opt);
    }

    await loadScoreboardForWeek(curr);
    await loadStandings();

  } catch (err) {
    console.error("init error", err);
  }
}

window.addEventListener("DOMContentLoaded", init);
