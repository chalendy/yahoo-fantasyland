// If frontend is served from the same origin as backend, we can use relative URLs
const backendBase = "";

// UI elements
const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const statusMessage = document.getElementById("statusMessage");
const weekLabel = document.getElementById("weekLabel");
const weekDropdown = document.getElementById("weekDropdown");
const standingsContainer = document.getElementById("standingsContainer");

let scoreboardData = null;
let leagueMetaCache = null;

// ------------------------- Helpers -------------------------

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

// ------------------------- AUTH BUTTON -------------------------
if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ------------------------- LOAD WEEKLY SCOREBOARD -------------------------

async function loadScoreboardForWeek(week) {
  try {
    setStatus(`Loading scoreboard for Week ${week}...`);

    const res = await fetch(`${backendBase}/scoreboard?week=${week}`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      setStatus("Failed to load scoreboard.");
      return null;
    }

    const data = await res.json();
    scoreboardData = data;

    const leagueArr = data?.fantasy_content?.league;
    leagueMetaCache = leagueArr?.[0];

    return data;
  } catch (err) {
    console.error("Fetch error:", err);
    setStatus("Error loading scoreboard.");
    return null;
  }
}

// ------------------------- WEEK DROPDOWN -------------------------

function populateWeekDropdown(startWeek, endWeek, currentWeek) {
  if (!weekDropdown) return;

  weekDropdown.innerHTML = "";

  for (let w = startWeek; w <= endWeek; w++) {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = `Week ${w}`;
    if (w === currentWeek) opt.selected = true;
    weekDropdown.appendChild(opt);
  }
}

// ------------------------- STANDINGS -------------------------

function extractStandings(data) {
  try {
    const league = data.fantasy_content.league;
    const standings = league[1]?.standings;

    if (!standings) return [];

    const teamsObj = standings?.teams;
    const result = [];

    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const t = teamsObj[key].team;

        const meta = t[0];
        const stats = t[1];

        const name = pluckField(meta, "name") || "Unknown Team";
        const logoObj = pluckField(meta, "team_logos");
        const logo = logoObj?.[0]?.team_logo?.url || null;

        const rank = stats?.team_standings?.rank ?? "?";
        const wins = stats?.team_standings?.outcome_totals?.wins ?? 0;
        const losses = stats?.team_standings?.outcome_totals?.losses ?? 0;
        const ties = stats?.team_standings?.outcome_totals?.ties ?? 0;

        result.push({ name, logo, rank, wins, losses, ties });
      });

    // Yahoo already returns these in sorted order
    return result;
  } catch (err) {
    console.error("Extract standings error:", err);
    return [];
  }
}

function renderStandings(standings) {
  if (!standingsContainer) return;

  standingsContainer.innerHTML = `
    <table class="standings-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Team</th>
          <th>W</th>
          <th>L</th>
          <th>T</th>
        </tr>
      </thead>
      <tbody>
        ${standings
          .map(
            (t) => `
          <tr>
            <td>${t.rank}</td>
            <td class="team-col">
              ${
                t.logo
                  ? `<img src="${t.logo}" class="standings-logo" />`
                  : `<div class="standings-logo placeholder-small">?</div>`
              }
              ${t.name}
            </td>
            <td>${t.wins}</td>
            <td>${t.losses}</td>
            <td>${t.ties}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// ------------------------- MATCHUPS -------------------------

function extractMatchups(data) {
  try {
    const leagueArr = data.fantasy_content.league;
    const leagueMeta = leagueArr[0];
    const scoreboard = leagueArr[1].scoreboard;

    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot.matchups;

    const weekNumber = scoreboard.week ?? leagueMeta.current_week;
    const inPlayoffs = scoreboardRoot?.is_playoffs === "1";

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const wrapper = matchupsObj[key].matchup;
        const inner = wrapper["0"];
        const teamsObj = inner.teams;

        const t0 = teamsObj["0"].team;
        const t1 = teamsObj["1"].team;

        const t0meta = t0[0];
        const t0stats = t0[1];

        const t1meta = t1[0];
        const t1stats = t1[1];

        const t0name = pluckField(t0meta, "name") || "Unknown Team";
        const t1name = pluckField(t1meta, "name") || "Unknown Team";

        const t0logoObj = pluckField(t0meta, "team_logos");
        const t1logoObj = pluckField(t1meta, "team_logos");

        const t0logo = t0logoObj?.[0]?.team_logo?.url || null;
        const t1logo = t1logoObj?.[0]?.team_logo?.url || null;

        const t0score = t0stats?.team_points?.total ?? "0.00";
        const t1score = t1stats?.team_points?.total ?? "0.00";

        const t0proj = t0stats?.team_projected_points?.total ?? "0.00";
        const t1proj = t1stats?.team_projected_points?.total ?? "0.00";

        const t0prob = t0stats?.win_probability ?? null;
        const t1prob = t1stats?.win_probability ?? null;

        result.push({
          week: weekNumber,
          playoffs: inPlayoffs,
          teamA: { name: t0name, logo: t0logo, score: t0score, projected: t0proj, winProbability: t0prob },
          teamB: { name: t1name, logo: t1logo, score: t1score, projected: t1proj, winProbability: t1prob }
        });
      });

    return result;
  } catch (err) {
    console.error("Matchup extract error:", err);
    return [];
  }
}

function renderMatchupCards(matchups) {
  if (!matchupsContainer) return;

  matchupsContainer.innerHTML = "";

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const tAprob = m.teamA.winProbability != null ? Math.round(m.teamA.winProbability * 100) : null;
    const tBprob = m.teamB.winProbability != null ? Math.round(m.teamB.winProbability * 100) : null;

    // Hide playoff tag unless in playoffs
    const tagHtml = m.playoffs
      ? `<span class="matchup-tag">Playoffs</span>`
      : `<span class="matchup-tag" style="visibility:hidden;">&nbsp;</span>`;

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">Week ${m.week}</span>
        ${tagHtml}
      </div>

      <div class="matchup-body">
        <div class="team-column">
          <div class="team-info">
            ${
              m.teamA.logo
                ? `<img src="${m.teamA.logo}" class="team-logo" />`
                : `<div class="team-logo placeholder-logo">A</div>`
            }
            <div>
              <div class="team-name">${m.teamA.name}</div>
              <div class="team-metadata">Proj: ${m.teamA.projected}${
                tAprob != null ? ` · Win%: ${tAprob}%` : ""
              }</div>
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
              <div class="team-metadata">Proj: ${m.teamB.projected}${
                tBprob != null ? ` · Win%: ${tBprob}%` : ""
              }</div>
            </div>
            ${
              m.teamB.logo
                ? `<img src="${m.teamB.logo}" class="team-logo" />`
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

// ------------------------- AUTO LOAD -------------------------

async function autoLoad() {
  const firstLoad = await fetch(`${backendBase}/scoreboard`);
  if (!firstLoad.ok) return;

  const json = await firstLoad.json();
  scoreboardData = json;

  const league = json.fantasy_content.league;
  const meta = league[0];

  const startWeek = Number(meta.start_week);
  const endWeek = Number(meta.end_week);
  const currentWeek = Number(meta.current_week);

  populateWeekDropdown(startWeek, endWeek, currentWeek);

  loadScoreboardForWeek(currentWeek).then((data) => {
    if (!data) return;

    const matchups = extractMatchups(data);
    renderMatchupCards(matchups);

    // Load standings
    const standings = extractStandings(json);
    renderStandings(standings);

    weekLabel.textContent = `Week ${currentWeek}`;
  });
}

// ------------------------- WEEK CHANGE -------------------------

if (weekDropdown) {
  weekDropdown.addEventListener("change", async () => {
    const week = Number(weekDropdown.value);
    if (!week) return;

    const data = await loadScoreboardForWeek(week);
    if (!data) return;

    const matchups = extractMatchups(data);
    renderMatchupCards(matchups);

    weekLabel.textContent = `Week ${week}`;
  });
}

// ------------------------- INITIALIZE -------------------------

window.addEventListener("DOMContentLoaded", autoLoad);
