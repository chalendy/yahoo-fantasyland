// Same-origin backend
const backendBase = "";

// --- DOM ---
const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");

const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const statusMessage = document.getElementById("statusMessage");
const weekLabel = document.getElementById("weekLabel");

const weekSelect = document.getElementById("weekSelect");
const standingsContainer = document.getElementById("standingsContainer");

// --- State ---
let scoreboardData = null;
let standingsData = null;

let leagueMeta = null; // from scoreboard/standings meta
let currentWeek = null;

let standingsSort = "rank"; // "rank" | "record" | "pf"
let standingsSortDir = "asc"; // asc/desc

// ---------------- Helpers ----------------

function setStatus(msg) {
  if (statusMessage) statusMessage.textContent = msg || "";
}

function safeText(el, value) {
  if (el) el.textContent = value ?? "";
}

// Yahoo JSON uses arrays-of-objects for team meta.
// Example: teamMetaArray = [ {team_key...}, {team_id...}, {name...}, [], {url...}, ... ]
function pluckField(objArray, key) {
  if (!Array.isArray(objArray)) return null;
  for (const entry of objArray) {
    if (entry && Object.prototype.hasOwnProperty.call(entry, key)) return entry[key];
  }
  return null;
}

function getLeagueMetaFromFantasyContent(data) {
  try {
    const leagueArr = data?.fantasy_content?.league;
    if (!Array.isArray(leagueArr) || !leagueArr[0]) return null;
    return leagueArr[0];
  } catch {
    return null;
  }
}

function populateWeekDropdown(meta) {
  if (!weekSelect || !meta) return;

  const start = parseInt(meta.start_week ?? "1", 10);
  const end = parseInt(meta.end_week ?? meta.current_week ?? "17", 10);
  const cur = parseInt(meta.current_week ?? meta.matchup_week ?? "1", 10);

  // Build options once (or rebuild safely)
  weekSelect.innerHTML = "";
  for (let w = start; w <= end; w++) {
    const opt = document.createElement("option");
    opt.value = String(w);
    opt.textContent = `Week ${w}`;
    weekSelect.appendChild(opt);
  }

  // Select current week (or keep existing if still valid)
  weekSelect.value = String(cur);
}

function setWeekLabelFromData(data) {
  // Prefer scoreboard.week if present; fallback to league meta current_week
  try {
    const leagueArr = data?.fantasy_content?.league;
    const meta = leagueArr?.[0];
    const sb = leagueArr?.[1]?.scoreboard;

    const weekFromSb = sb?.week;
    const week = (weekFromSb != null ? weekFromSb : meta?.current_week);

    if (week != null) {
      currentWeek = parseInt(week, 10);
      safeText(weekLabel, `Week ${currentWeek}`);
    }
  } catch {
    // ignore
  }
}

function isPlayoffsFromMatchup(matchupInner) {
  // Yahoo returns is_playoffs as "1"/"0" sometimes at matchup level
  const flag = matchupInner?.is_playoffs ?? matchupInner?.is_playoffs === 1;
  return String(flag) === "1";
}

// ---------------- API loaders ----------------

async function fetchJSON(url) {
  const res = await fetch(url);
  const text = await res.text();

  // Try to parse JSON if possible
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  return { res, text, json: parsed };
}

async function loadStandings() {
  if (!standingsContainer) return;

  // Keep the container visible but show loading text
  standingsContainer.innerHTML = `<div class="standings-empty">Loading standings…</div>`;

  const { res, text, json } = await fetchJSON(`${backendBase}/standings-raw`);

  if (!res.ok) {
    console.error("Standings error:", res.status, text);
    standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
    return;
  }

  standingsData = json || null;
  const meta = getLeagueMetaFromFantasyContent(standingsData);
  if (meta) leagueMeta = meta;

  renderStandings();
}

async function loadScoreboardForWeek(week) {
  // This expects your server supports ?week=xx
  const url =
    week != null
      ? `${backendBase}/scoreboard?week=${encodeURIComponent(week)}`
      : `${backendBase}/scoreboard`;

  // UI
  setStatus("Loading scoreboard…");
  if (jsonOutput) jsonOutput.textContent = "Loading…";

  const { res, text, json } = await fetchJSON(url);

  if (!res.ok) {
    console.error("Scoreboard error:", res.status, text);
    if (jsonOutput) jsonOutput.textContent = `Error: ${res.status}\n${text}`;
    setStatus("Not authenticated yet — click Sign In with Yahoo.");
    return null;
  }

  scoreboardData = json;
  if (jsonOutput) jsonOutput.textContent = JSON.stringify(json, null, 2);

  const meta = getLeagueMetaFromFantasyContent(scoreboardData);
  if (meta) {
    leagueMeta = meta;
    populateWeekDropdown(meta);
    // If caller asked for a week, reflect it in dropdown
    if (weekSelect && week != null) weekSelect.value = String(week);
  }

  setWeekLabelFromData(scoreboardData);
  setStatus("Scoreboard loaded.");

  return scoreboardData;
}

// ---------------- Matchups parsing/rendering ----------------

function extractMatchups(data) {
  try {
    const fc = data?.fantasy_content;
    const leagueArr = fc?.league;
    const meta = leagueArr?.[0];
    const scoreboard = leagueArr?.[1]?.scoreboard;

    if (!scoreboard) return [];

    // scoreboard["0"].matchups
    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot?.matchups;
    if (!matchupsObj) return [];

    const weekNumber =
      scoreboard?.week != null ? scoreboard.week : (meta?.current_week ?? null);

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchupWrapper = matchupsObj[key];
        const matchup = matchupWrapper?.matchup;
        const matchupInner = matchup?.["0"];
        const teamsObj = matchupInner?.teams;
        if (!teamsObj) return;

        const team0 = teamsObj["0"]?.team;
        const team1 = teamsObj["1"]?.team;
        if (!team0 || !team1) return;

        const team0Meta = team0[0];
        const team0Stats = team0[1];
        const team1Meta = team1[0];
        const team1Stats = team1[1];

        const teamAName = pluckField(team0Meta, "name") || "Unknown Team";
        const teamBName = pluckField(team1Meta, "name") || "Unknown Team";

        const teamALogoObj = pluckField(team0Meta, "team_logos");
        const teamBLogoObj = pluckField(team1Meta, "team_logos");

        const teamALogo = teamALogoObj?.[0]?.team_logo?.url || null;
        const teamBLogo = teamBLogoObj?.[0]?.team_logo?.url || null;

        const teamAScore = team0Stats?.team_points?.total ?? "0.00";
        const teamBScore = team1Stats?.team_points?.total ?? "0.00";

        const teamAProj = team0Stats?.team_projected_points?.total ?? "0.00";
        const teamBProj = team1Stats?.team_projected_points?.total ?? "0.00";

        const teamAProb = team0Stats?.win_probability ?? null;
        const teamBProb = team1Stats?.win_probability ?? null;

        const playoffs = isPlayoffsFromMatchup(matchupInner);

        result.push({
          week: weekNumber,
          playoffs,
          teamA: {
            name: teamAName,
            logo: teamALogo,
            score: teamAScore,
            projected: teamAProj,
            winProbability: teamAProb,
          },
          teamB: {
            name: teamBName,
            logo: teamBLogo,
            score: teamBScore,
            projected: teamBProj,
            winProbability: teamBProb,
          },
        });
      });

    return result;
  } catch (err) {
    console.error("Error extracting matchups:", err);
    return [];
  }
}

function renderMatchupCards(matchups) {
  if (!matchupsContainer) return;
  matchupsContainer.innerHTML = "";

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const teamAProbPct =
      m.teamA.winProbability != null ? Math.round(m.teamA.winProbability * 100) : null;
    const teamBProbPct =
      m.teamB.winProbability != null ? Math.round(m.teamB.winProbability * 100) : null;

    const tagHtml = m.playoffs ? `<span class="matchup-tag">Playoffs</span>` : "";

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">Week ${m.week ?? "?"}</span>
        ${tagHtml}
      </div>

      <div class="matchup-body">
        <div class="team-column">
          <div class="team-info">
            ${
              m.teamA.logo
                ? `<img src="${m.teamA.logo}" alt="${m.teamA.name}" class="team-logo" />`
                : `<div class="team-logo placeholder-logo">A</div>`
            }
            <div>
              <div class="team-name">${m.teamA.name}</div>
              <div class="team-metadata">
                Proj: ${m.teamA.projected}
                ${teamAProbPct != null ? ` · Win%: ${teamAProbPct}%` : ""}
              </div>
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
              <div class="team-metadata">
                Proj: ${m.teamB.projected}
                ${teamBProbPct != null ? ` · Win%: ${teamBProbPct}%` : ""}
              </div>
            </div>
            ${
              m.teamB.logo
                ? `<img src="${m.teamB.logo}" alt="${m.teamB.name}" class="team-logo" />`
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

function renderMatchupsFromScoreboard() {
  if (!scoreboardData) {
    setStatus("No scoreboard loaded yet. Click 'Load Scoreboard JSON' first.");
    return;
  }

  const matchups = extractMatchups(scoreboardData);
  if (!matchups || matchups.length === 0) {
    setStatus("No matchups found for this week.");
    if (matchupsContainer) matchupsContainer.innerHTML = "";
    return;
  }

  renderMatchupCards(matchups);
  setStatus(`Showing ${matchups.length} matchups.`);
}

// ---------------- Standings parsing/rendering ----------------

function parseStandingsTeams(data) {
  try {
    const leagueArr = data?.fantasy_content?.league;
    const standingsBlock = leagueArr?.[1]?.standings?.[0]?.teams;
    if (!standingsBlock) return [];

    const teams = [];

    Object.keys(standingsBlock)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const teamArr = standingsBlock[k]?.team;
        if (!teamArr) return;

        const metaArr = teamArr[0];
        const ptsObj = teamArr[1]?.team_points;
        const standingsObj = teamArr[2]?.team_standings;

        const name = pluckField(metaArr, "name") || "Unknown";
        const logos = pluckField(metaArr, "team_logos");
        const logo = logos?.[0]?.team_logo?.url || null;

        const managers = pluckField(metaArr, "managers");
        const managerName = managers?.[0]?.manager?.nickname || "";

        const rank = parseInt(standingsObj?.rank ?? "999", 10);
        const wins = parseInt(standingsObj?.outcome_totals?.wins ?? "0", 10);
        const losses = parseInt(standingsObj?.outcome_totals?.losses ?? "0", 10);

        const pf = parseFloat(standingsObj?.points_for ?? ptsObj?.total ?? "0");

        teams.push({
          rank,
          name,
          managerName,
          wins,
          losses,
          pf,
          logo,
        });
      });

    return teams;
  } catch (e) {
    console.error("Standings parse error:", e);
    return [];
  }
}

function sortStandingsRows(rows) {
  const dir = standingsSortDir === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    if (standingsSort === "pf") return dir * ((a.pf || 0) - (b.pf || 0));
    if (standingsSort === "record") {
      // wins desc, losses asc
      if (a.wins !== b.wins) return dir * (a.wins - b.wins);
      return dir * (b.losses - a.losses);
    }
    // rank
    return dir * ((a.rank || 999) - (b.rank || 999));
  });
}

function ensureStandingsControls() {
  // Inject a small sort control into the standings header without changing your HTML file.
  const header = document.querySelector(".standings-header");
  if (!header) return;

  if (header.querySelector("#standingsSortSelect")) return;

  const wrap = document.createElement("div");
  wrap.className = "standings-sort-wrap";
  wrap.innerHTML = `
    <label class="standings-sort-label" for="standingsSortSelect">Sort</label>
    <select id="standingsSortSelect" class="standings-sort-select">
      <option value="rank">Yahoo Rank</option>
      <option value="record">Record</option>
      <option value="pf">Points For</option>
    </select>
    <button id="standingsSortDirBtn" class="standings-sort-dir" type="button" title="Toggle sort direction">
      ↑
    </button>
  `;

  header.appendChild(wrap);

  const sortSelect = wrap.querySelector("#standingsSortSelect");
  const dirBtn = wrap.querySelector("#standingsSortDirBtn");

  sortSelect.value = standingsSort;

  sortSelect.addEventListener("change", () => {
    standingsSort = sortSelect.value;
    renderStandings();
  });

  dirBtn.addEventListener("click", () => {
    standingsSortDir = standingsSortDir === "asc" ? "desc" : "asc";
    dirBtn.textContent = standingsSortDir === "asc" ? "↑" : "↓";
    renderStandings();
  });
}

function renderStandings() {
  if (!standingsContainer) return;

  ensureStandingsControls();

  if (!standingsData) {
    standingsContainer.innerHTML = `<div class="standings-empty">Standings not loaded yet.</div>`;
    return;
  }

  const teams = parseStandingsTeams(standingsData);
  if (!teams.length) {
    standingsContainer.innerHTML = `<div class="standings-empty">No standings found.</div>`;
    return;
  }

  const sorted = sortStandingsRows(teams);

  standingsContainer.innerHTML = `
    <div class="standings-rows">
      ${sorted
        .map((t) => {
          const record = `${t.wins}-${t.losses}`;
          const manager = t.managerName ? ` · ${t.managerName}` : "";
          const pf = (t.pf != null && !Number.isNaN(t.pf)) ? t.pf.toFixed(2) : "0.00";

          return `
            <div class="standings-card">
              <div class="standings-left">
                ${
                  t.logo
                    ? `<img class="standings-logo" src="${t.logo}" alt="${t.name}">`
                    : `<div class="standings-logo placeholder-logo">•</div>`
                }
                <div class="standings-meta">
                  <div class="standings-topline">
                    <span class="standings-rank">#${t.rank}</span>
                    <span class="standings-name" title="${t.name}">${t.name}</span>
                  </div>
                  <div class="standings-subline">${record}${manager}</div>
                </div>
              </div>
              <div class="standings-right">
                <div class="standings-pf">${pf}</div>
                <div class="standings-pf-label">PF</div>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

// ---------------- Events / bootstrap ----------------

// Sign in with Yahoo
if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    // use dropdown-selected week if present
    const week = weekSelect?.value ? parseInt(weekSelect.value, 10) : null;
    const data = await loadScoreboardForWeek(week);
    if (data) renderMatchupsFromScoreboard();
  });
}

if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", () => {
    renderMatchupsFromScoreboard();
  });
}

// Week select -> fetch that week and redraw
if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    const week = parseInt(weekSelect.value, 10);
    const data = await loadScoreboardForWeek(week);
    if (data) renderMatchupsFromScoreboard();
  });
}

async function autoLoad() {
  try {
    // Always attempt standings (will show friendly error if not authed yet)
    await loadStandings();

    // Scoreboard auto-load (may 401 until signed in)
    const data = await loadScoreboardForWeek(null);
    if (data) {
      renderMatchupsFromScoreboard();
      // ensure dropdown has something selected
      if (weekSelect && currentWeek != null) weekSelect.value = String(currentWeek);
    }
  } catch (e) {
    console.error("Auto load error:", e);
    setStatus("Ready. Click Sign In with Yahoo.");
  }
}

window.addEventListener("DOMContentLoaded", autoLoad);
