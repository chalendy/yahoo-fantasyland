// If frontend is served from the same origin as backend, we can use relative URLs
const backendBase = ""; // same origin

// UI elements
const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const statusMessage = document.getElementById("statusMessage");
const weekLabel = document.getElementById("weekLabel");
const weekSelect = document.getElementById("weekSelect");
const standingsContainer = document.getElementById("standingsContainer");

let scoreboardData = null;

// standings state
let standingsRows = [];
let standingsSortKey = "rank";
let standingsSortDir = "asc";

// ---------- Helpers ----------
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

function safeText(v, fallback = "") {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ---------- Auth ----------
if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ---------- Scoreboard Fetch (supports ?week=) ----------
async function loadScoreboardForWeek(week) {
  const url = week ? `${backendBase}/scoreboard?week=${encodeURIComponent(week)}` : `${backendBase}/scoreboard`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    console.error("Scoreboard error:", res.status, text);
    throw new Error(`Scoreboard error ${res.status}`);
  }
  return await res.json();
}

// ---------- Standings Fetch ----------
async function loadStandingsRaw() {
  const res = await fetch(`${backendBase}/standings-raw`);
  if (!res.ok) {
    const text = await res.text();
    console.error("Standings error:", res.status, text);
    throw new Error(`Standings error ${res.status}`);
  }
  return await res.json();
}

// ---------- UI: Week Dropdown ----------
function populateWeekDropdown(leagueMeta, selectedWeek) {
  if (!weekSelect) return;

  const startWeek = num(leagueMeta?.start_week, 1);
  const endWeek = num(leagueMeta?.end_week, leagueMeta?.current_week || 17);
  const currentWeek = num(leagueMeta?.current_week, endWeek);

  const desired = selectedWeek ? num(selectedWeek, currentWeek) : currentWeek;

  weekSelect.innerHTML = "";

  for (let w = startWeek; w <= endWeek; w++) {
    const opt = document.createElement("option");
    opt.value = String(w);
    opt.textContent = `Week ${w}`;
    if (w === desired) opt.selected = true;
    weekSelect.appendChild(opt);
  }
}

// ---------- Parsing: Matchups ----------
function extractMatchups(data) {
  try {
    const fc = data?.fantasy_content;
    const leagueArray = fc?.league;

    const leagueMeta = leagueArray?.[0];
    const scoreboard = leagueArray?.[1]?.scoreboard;

    // scoreboard["0"].matchups
    const scoreboardRoot = scoreboard?.["0"];
    const matchupsObj = scoreboardRoot?.matchups;
    const weekNumber = scoreboard?.week ?? leagueMeta?.current_week;

    if (!matchupsObj) return [];

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchupWrapper = matchupsObj[key];
        const matchup = matchupWrapper?.matchup;
        const matchupInner = matchup?.["0"];
        const teamsObj = matchupInner?.teams;

        const team0 = teamsObj?.["0"]?.team;
        const team1 = teamsObj?.["1"]?.team;

        const team0Meta = team0?.[0];
        const team0Stats = team0?.[1];
        const team1Meta = team1?.[0];
        const team1Stats = team1?.[1];

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

        // ✅ this is where Playoffs info lives (in your snippet)
        const isPlayoffs = safeText(matchup?.is_playoffs, "0") === "1";
        const isConsolation = safeText(matchup?.is_consolation, "0") === "1";

        result.push({
          week: weekNumber,
          isPlayoffs,
          isConsolation,
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

// ---------- Rendering: Matchups ----------
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

    // ✅ Only show Playoffs/Consolation tags when applicable
    let tagHtml = "";
    if (m.isPlayoffs) tagHtml = `<span class="matchup-tag">Playoffs</span>`;
    else if (m.isConsolation) tagHtml = `<span class="matchup-tag">Consolation</span>`;

    // ✅ Remove Week label inside each card (per your request)
    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label"></span>
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

// ---------- Parsing: Standings ----------
function extractStandingsRows(data) {
  try {
    const leagueArr = data?.fantasy_content?.league;
    const standings = leagueArr?.[1]?.standings?.[0]?.teams;

    if (!standings) return [];

    const rows = [];
    Object.keys(standings)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const teamArr = standings[k]?.team;
        const meta = teamArr?.[0];
        const points = teamArr?.[1]?.team_points?.total;
        const st = teamArr?.[2]?.team_standings;

        const name = pluckField(meta, "name") || "Unknown";
        const logos = pluckField(meta, "team_logos");
        const logo = logos?.[0]?.team_logo?.url || null;

        const managerObj = pluckField(meta, "managers");
        const managerName = managerObj?.[0]?.manager?.nickname || "";

        const rank = num(st?.rank, 999);
        const wins = num(st?.outcome_totals?.wins, 0);
        const losses = num(st?.outcome_totals?.losses, 0);

        rows.push({
          rank,
          name,
          managerName,
          logo,
          record: `${wins}-${losses}`,
          pointsFor: num(points, 0),
        });
      });

    return rows;
  } catch (e) {
    console.error("extractStandingsRows failed:", e);
    return [];
  }
}

// ---------- Rendering: Standings (ultra-compact, no style changes needed) ----------
function renderStandings(rows) {
  if (!standingsContainer) return;

  standingsContainer.innerHTML = "";

  if (!rows || rows.length === 0) {
    standingsContainer.innerHTML = `<div class="standings-empty">No standings found.</div>`;
    return;
  }

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "8px";

  rows.forEach((r) => {
    const card = document.createElement("div");
    card.className = "matchup-card";
    card.style.padding = "8px 10px";

    card.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="display:flex; align-items:center; gap:8px; min-width:0;">
          ${
            r.logo
              ? `<img src="${r.logo}" alt="${r.name}" style="width:28px;height:28px;border-radius:999px;object-fit:cover;border:1px solid rgba(255,255,255,0.18);background:rgba(0,0,0,0.35);">`
              : `<div style="width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:0.75rem;opacity:0.7;">?</div>`
          }
          <div style="min-width:0;">
            <div style="display:flex; align-items:baseline; gap:6px;">
              <div style="font-weight:800; font-size:0.82rem; opacity:0.95;">#${r.rank}</div>
              <div style="font-weight:700; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 220px;">
                ${r.name}
              </div>
            </div>
            <div style="font-size:0.72rem; color: rgba(255,255,255,0.65);">
              ${r.record}${r.managerName ? ` · ${r.managerName}` : ""}
            </div>
          </div>
        </div>

        <div style="text-align:right;">
          <div style="font-weight:900; font-size:0.92rem; line-height:1;">${r.pointsFor.toFixed(2)}</div>
          <div style="font-size:0.68rem; color: rgba(255,255,255,0.6);">PF</div>
        </div>
      </div>
    `;

    wrap.appendChild(card);
  });

  standingsContainer.appendChild(wrap);
}

// ---------- Sorting: Standings ----------
function sortStandingsRows(rows) {
  const dir = standingsSortDir === "asc" ? 1 : -1;

  const sorted = [...rows].sort((a, b) => {
    if (standingsSortKey === "rank") return (a.rank - b.rank) * dir;
    if (standingsSortKey === "pf") return (a.pointsFor - b.pointsFor) * dir;
    if (standingsSortKey === "name") return a.name.localeCompare(b.name) * dir;
    if (standingsSortKey === "record") return a.record.localeCompare(b.record) * dir;
    return 0;
  });

  return sorted;
}

function attachStandingsSortHandlers() {
  // Minimal: click the "League Standings" header to toggle PF sort
  // (keeps visuals unchanged since no new UI elements)
  const standingsHeader = document.querySelector(".standings-header h2");
  if (!standingsHeader) return;

  standingsHeader.style.cursor = "pointer";
  standingsHeader.title = "Click to sort by Points For";

  standingsHeader.addEventListener("click", () => {
    // toggle PF asc/desc
    if (standingsSortKey !== "pf") {
      standingsSortKey = "pf";
      standingsSortDir = "desc";
    } else {
      standingsSortDir = standingsSortDir === "desc" ? "asc" : "desc";
    }
    renderStandings(sortStandingsRows(standingsRows));
  });
}

// ---------- Button handlers ----------
if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    try {
      setStatus("Loading scoreboard JSON...");
      if (jsonOutput) jsonOutput.textContent = "Loading...";

      const selectedWeek = weekSelect?.value;
      const data = await loadScoreboardForWeek(selectedWeek);

      scoreboardData = data;

      if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);
      setStatus("Scoreboard JSON loaded successfully.");

      const leagueArray = data?.fantasy_content?.league;
      const leagueMeta = leagueArray?.[0];
      const scoreboard = leagueArray?.[1]?.scoreboard;
      const week = scoreboard?.week ?? leagueMeta?.current_week;

      if (weekLabel && week != null) weekLabel.textContent = `Week ${week}`;
      populateWeekDropdown(leagueMeta, week);
    } catch (err) {
      console.error("Fetch error:", err);
      if (jsonOutput) jsonOutput.textContent = "Error fetching scoreboard. See console.";
      setStatus("Error fetching scoreboard JSON.");
    }
  });
}

if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", () => {
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
    setStatus(`Showing ${matchups.length} matchups for this week.`);
  });
}

// Week change: fetch scoreboard for that week and re-render matchups
if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    const week = weekSelect.value;
    try {
      setStatus(`Loading Week ${week}...`);
      const data = await loadScoreboardForWeek(week);
      scoreboardData = data;

      if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

      const matchups = extractMatchups(data);
      renderMatchupCards(matchups);

      // update label from response
      const leagueArray = data?.fantasy_content?.league;
      const leagueMeta = leagueArray?.[0];
      const scoreboard = leagueArray?.[1]?.scoreboard;
      const wk = scoreboard?.week ?? leagueMeta?.current_week;
      if (weekLabel && wk != null) weekLabel.textContent = `Week ${wk}`;

      setStatus(`Loaded Week ${week}.`);
    } catch (e) {
      console.error(e);
      setStatus(`Failed to load Week ${week}.`);
    }
  });
}

// ---------- Auto load (scoreboard + matchups + standings) ----------
async function autoLoadEverything() {
  try {
    setStatus("Loading scoreboard + matchups...");

    // 1) load standings (independent)
    try {
      const standingsJson = await loadStandingsRaw();
      standingsRows = extractStandingsRows(standingsJson);
      renderStandings(sortStandingsRows(standingsRows));
      attachStandingsSortHandlers();
    } catch (e) {
      console.error("Standings load failed:", e);
      if (standingsContainer) standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
    }

    // 2) load scoreboard (default to league current week)
    const data = await loadScoreboardForWeek();
    scoreboardData = data;

    if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

    const leagueArr = data?.fantasy_content?.league;
    const leagueMeta = leagueArr?.[0];
    const scoreboard = leagueArr?.[1]?.scoreboard;

    const wk = scoreboard?.week ?? leagueMeta?.current_week;
    if (weekLabel && wk != null) weekLabel.textContent = `Week ${wk}`;
    populateWeekDropdown(leagueMeta, wk);

    const matchups = extractMatchups(data);
    if (!matchups || matchups.length === 0) {
      setStatus("No matchups found for this week.");
      if (matchupsContainer) matchupsContainer.innerHTML = "";
      return;
    }

    renderMatchupCards(matchups);
    setStatus(`Loaded ${matchups.length} matchups.`);
  } catch (err) {
    console.error("Auto load error:", err);
    setStatus("Not authenticated. Click 'Sign In with Yahoo' first.");
  }
}

window.addEventListener("DOMContentLoaded", autoLoadEverything);
