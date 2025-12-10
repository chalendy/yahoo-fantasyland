// Using same origin (Render serves frontend + backend together)
const authBtn = document.getElementById("authBtn");
const weekSelect = document.getElementById("weekSelect");
const matchupsContainer = document.getElementById("matchupsContainer");
const matchupsMessage = document.getElementById("matchupsMessage");
const scoreboardJsonEl = document.getElementById("scoreboardJson");
const leagueNameEl = document.getElementById("leagueName");
const matchupsTitleEl = document.getElementById("matchupsTitle");
const reloadJsonBtn = document.getElementById("reloadJsonBtn");
const playoffBadge = document.getElementById("playoffBadge");

let weeksInitialized = false;

// -------------------------
//  AUTH
// -------------------------
authBtn.addEventListener("click", () => {
  window.location.href = "/auth/start";
});

// -------------------------
//  DATA PARSING HELPERS
// -------------------------
function extractLeagueMeta(data) {
  const fantasy = data?.fantasy_content;
  if (!fantasy) return {};

  const leagueArr = fantasy.league;
  const leagueMeta = leagueArr?.[0] || {};
  const leagueName = leagueMeta.name || "Yahoo Fantasy League";
  const currentWeek = Number(leagueMeta.current_week || fantasy.current_week || 1);
  const startWeek = Number(leagueMeta.start_week || 1);
  const endWeek = Number(leagueMeta.end_week || 17);

  return { leagueName, currentWeek, startWeek, endWeek };
}

function extractMatchups(data) {
  const fantasy = data?.fantasy_content;
  if (!fantasy) return { matchups: [], isPlayoffs: false, week: null };

  const leagueArr = fantasy.league;
  const scoreboardWrapper = leagueArr?.[1]?.scoreboard;
  const scoreboardCore =
    scoreboardWrapper?.[0] || scoreboardWrapper?.["0"] || scoreboardWrapper;
  const matchupsObj = scoreboardCore?.matchups;
  const scoreboardWeek = scoreboardWrapper?.week ?? leagueArr?.[1]?.scoreboard?.week ?? null;

  if (!matchupsObj) return { matchups: [], isPlayoffs: false, week: scoreboardWeek };

  const matchups = [];
  let isPlayoffs = false;

  for (const key of Object.keys(matchupsObj)) {
    if (key === "count") continue;
    const wrapper = matchupsObj[key];
    const matchupContainer = wrapper.matchup;
    const matchup =
      matchupContainer?.["0"] || matchupContainer?.[0] || matchupContainer;

    if (!matchup) continue;

    if (matchup.is_playoffs === "1") {
      isPlayoffs = true;
    }

    const teamsObj = matchup.teams;
    if (!teamsObj) continue;

    const teams = [];

    for (const tKey of ["0", "1"]) {
      const tWrapper = teamsObj[tKey];
      if (!tWrapper) continue;
      const tArr = tWrapper.team;
      const metaArr = tArr?.[0] || [];
      const statsObj = tArr?.[1] || {};

      const nameObj = metaArr.find(
        (it) => it && typeof it === "object" && "name" in it
      );
      const logoHolder = metaArr.find(
        (it) => it && typeof it === "object" && it.team_logos
      );
      const teamName = nameObj?.name || "Unknown Team";
      const logoUrl =
        logoHolder?.team_logos?.[0]?.team_logo?.url ||
        "https://s.yimg.com/ag/images/default_user_profile_pic_64sq.jpg";

      const points = Number(statsObj.team_points?.total ?? 0);
      const proj = Number(statsObj.team_projected_points?.total ?? 0);
      const winProb = statsObj.win_probability ?? null;

      teams.push({
        name: teamName,
        logoUrl,
        points: points.toFixed(2),
        projected: proj.toFixed(2),
        winProb,
      });
    }

    if (teams.length === 2) {
      matchups.push({
        home: teams[0],
        away: teams[1],
      });
    }
  }

  return { matchups, isPlayoffs, week: scoreboardWeek };
}

// -------------------------
//  RENDER HELPERS
// -------------------------
function buildWeekOptions({ startWeek, endWeek, currentWeek }) {
  weekSelect.innerHTML = "";

  for (let w = startWeek; w <= endWeek; w++) {
    const opt = document.createElement("option");
    opt.value = String(w);
    opt.textContent = `Week ${w}`;
    if (w === currentWeek) opt.selected = true;
    weekSelect.appendChild(opt);
  }

  weeksInitialized = true;
}

function renderMatchups({ matchups, week, isPlayoffs }) {
  matchupsContainer.innerHTML = "";

  if (!matchups.length) {
    matchupsMessage.textContent = "No matchups found for this week.";
    playoffBadge.hidden = true;
    return;
  }

  matchupsMessage.textContent = "";
  matchupsTitleEl.textContent = `Week ${week} Matchups`;

  playoffBadge.hidden = !isPlayoffs;

  matchups.forEach((m) => {
    const card = document.createElement("div");
    card.className = "matchup-card";

    const home = createTeamColumn(m.home, "Home");
    const away = createTeamColumn(m.away, "Away");

    const center = document.createElement("div");
    center.className = "matchup-card__center";
    const vsLabel = document.createElement("div");
    vsLabel.className = "matchup-card__vs";
    vsLabel.textContent = "VS";
    const weekLabel = document.createElement("div");
    weekLabel.className = "matchup-card__week";
    weekLabel.textContent = `Week ${week}`;

    center.appendChild(vsLabel);
    center.appendChild(weekLabel);

    card.appendChild(home);
    card.appendChild(center);
    card.appendChild(away);

    matchupsContainer.appendChild(card);
  });
}

function createTeamColumn(team, sideLabel) {
  const col = document.createElement("div");
  col.className = "team-column";

  const side = document.createElement("div");
  side.className = "team-column__side";
  side.textContent = sideLabel;

  const topRow = document.createElement("div");
  topRow.className = "team-column__top";

  const logo = document.createElement("img");
  logo.className = "team-logo";
  logo.src = team.logoUrl;
  logo.alt = team.name;

  const name = document.createElement("div");
  name.className = "team-name";
  name.textContent = team.name;

  topRow.appendChild(logo);
  topRow.appendChild(name);

  const stats = document.createElement("div");
  stats.className = "team-stats";

  const scoreEl = document.createElement("div");
  scoreEl.className = "team-score";
  scoreEl.textContent = `${team.points}`;

  const projEl = document.createElement("div");
  projEl.className = "team-proj";
  projEl.textContent = `Proj: ${team.projected}`;

  stats.appendChild(scoreEl);
  stats.appendChild(projEl);

  if (team.winProb != null) {
    const wp = document.createElement("div");
    wp.className = "team-winprob";
    wp.textContent = `Win: ${(team.winProb * 100).toFixed(0)}%`;
    stats.appendChild(wp);
  }

  col.appendChild(side);
  col.appendChild(topRow);
  col.appendChild(stats);

  return col;
}

// -------------------------
//  LOAD SCOREBOARD + MATCHUPS
// -------------------------
async function loadScoreboard(weekOverride) {
  try {
    const params = new URLSearchParams();
    if (weekOverride) params.set("week", weekOverride);

    const url = `/scoreboard${params.toString() ? "?" + params.toString() : ""}`;

    matchupsMessage.textContent = "Loading...";
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      matchupsMessage.textContent = `Error loading scoreboard: ${res.status}`;
      return;
    }

    const data = await res.json();
    // Show raw JSON in debug panel
    if (scoreboardJsonEl) {
      scoreboardJsonEl.textContent = JSON.stringify(data, null, 2);
    }

    const meta = extractLeagueMeta(data);
    const { leagueName, currentWeek, startWeek, endWeek } = meta;
    const { matchups, isPlayoffs, week } = extractMatchups(data);

    if (leagueNameEl) leagueNameEl.textContent = leagueName || "Yahoo Fantasy League";

    const effectiveWeek = Number(weekOverride || week || currentWeek || 1);

    // Initialize week dropdown once, from league data
    if (!weeksInitialized) {
      buildWeekOptions({
        startWeek,
        endWeek,
        currentWeek: effectiveWeek,
      });
    }

    // Keep dropdown in sync with loaded week
    if (weekSelect && String(weekSelect.value) !== String(effectiveWeek)) {
      weekSelect.value = String(effectiveWeek);
    }

    renderMatchups({ matchups, week: effectiveWeek, isPlayoffs });
  } catch (err) {
    console.error("loadScoreboard error:", err);
    matchupsMessage.textContent = "Failed to load scoreboard.";
  }
}

// Reload button just reloads the currently selected week
reloadJsonBtn.addEventListener("click", () => {
  const wk = weekSelect.value || undefined;
  loadScoreboard(wk);
});

// When week dropdown changes, reload that week
weekSelect.addEventListener("change", () => {
  const wk = weekSelect.value;
  loadScoreboard(wk);
});

// Auto-load current week on page load
document.addEventListener("DOMContentLoaded", () => {
  loadScoreboard();
});

