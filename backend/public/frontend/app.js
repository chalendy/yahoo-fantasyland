// If frontend is served from the same origin as backend, we can use relative URLs
const backendBase = ""; // same origin

// UI elements
const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const weekSelect = document.getElementById("weekSelect");

const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const standingsContainer = document.getElementById("standingsContainer");
const statusMessage = document.getElementById("statusMessage");
const weekLabel = document.getElementById("weekLabel");

let scoreboardData = null;
let leagueMeta = null;

// ------------- Helpers -------------

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

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Figure out playoff round label based on week numbers
function getPlayoffRoundLabel(matchupWeek, leagueMetaObj) {
  // If Yahoo says not playoffs, return null
  if (!matchupWeek || !leagueMetaObj) return null;

  const endWeek = String(leagueMetaObj.end_week || "").trim();
  const w = safeNum(matchupWeek, 0);
  const ew = safeNum(endWeek, 0);

  if (!w || !ew) return null;

  // Your league: playoffs start at week 15 (per your note)
  // Week 15 = Quarterfinal, 16 = Semifinal, 17 = Final
  // We'll compute offset from endWeek to be robust:
  // endWeek-2 => Quarterfinal, endWeek-1 => Semifinal, endWeek => Final
  if (w === ew) return "Final";
  if (w === ew - 1) return "Semifinal";
  if (w === ew - 2) return "Quarterfinal";

  // If somehow earlier playoff weeks exist, fall back:
  if (w < ew - 2) return "Playoffs";

  return null;
}

// ------------- Auth button -------------
if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ------------- Load Scoreboard JSON button -------------
if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    const selectedWeek = weekSelect?.value ? String(weekSelect.value) : null;
    await loadScoreboardForWeek(selectedWeek);
  });
}

// ------------- Load Matchups button -------------
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
    setStatus(`Showing ${matchups.length} matchups.`);
  });
}

// ------------- Week dropdown -------------
if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    const week = String(weekSelect.value || "");
    if (!week) return;

    await loadScoreboardForWeek(week);
    const matchups = extractMatchups(scoreboardData);
    renderMatchupCards(matchups);
  });
}

// ------------- Data fetchers -------------

async function loadScoreboardForWeek(weekStrOrNull) {
  try {
    setStatus("Loading scoreboard...");
    if (jsonOutput) jsonOutput.textContent = "Loading...";

    const url =
      weekStrOrNull && String(weekStrOrNull).trim()
        ? `${backendBase}/scoreboard?week=${encodeURIComponent(String(weekStrOrNull).trim())}`
        : `${backendBase}/scoreboard`;

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      if (jsonOutput) jsonOutput.textContent = `Error: ${res.status}\n${text}`;
      setStatus("Failed to load scoreboard.");
      return;
    }

    const data = await res.json();
    scoreboardData = data;

    // Cache league meta
    const leagueArr = data?.fantasy_content?.league;
    leagueMeta = Array.isArray(leagueArr) ? leagueArr[0] : null;

    if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

    const currentWeek =
      data?.fantasy_content?.league?.[1]?.scoreboard?.week ??
      leagueMeta?.current_week;

    if (weekLabel && currentWeek != null) {
      weekLabel.textContent = `Week ${currentWeek}`;
    }

    // Populate week dropdown once we know start/end weeks
    populateWeekDropdown(leagueMeta, String(currentWeek ?? ""));

    setStatus("Scoreboard loaded.");
  } catch (err) {
    console.error("Fetch error:", err);
    if (jsonOutput) jsonOutput.textContent = "Error fetching scoreboard. See console.";
    setStatus("Error fetching scoreboard.");
  }
}

// You already have standings working via /standings-raw
async function loadStandings() {
  if (!standingsContainer) return;

  try {
    standingsContainer.innerHTML = `<div class="standings-empty">Loading standings…</div>`;

    const res = await fetch(`${backendBase}/standings-raw`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Standings error:", res.status, text);
      standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
      return;
    }

    const data = await res.json();
    const teams = extractStandingsTeams(data);
    renderStandingsUltraCompact(teams);
  } catch (e) {
    console.error("Standings fetch error:", e);
    standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
  }
}

// ------------- Dropdown population -------------

function populateWeekDropdown(meta, selectedWeekStr) {
  if (!weekSelect || !meta) return;

  const start = safeNum(meta.start_week, 1);
  const end = safeNum(meta.end_week, start);

  // Only build once (or if blank)
  if (weekSelect.options.length === 0) {
    for (let w = start; w <= end; w++) {
      const opt = document.createElement("option");
      opt.value = String(w);
      opt.textContent = `Week ${w}`;
      weekSelect.appendChild(opt);
    }
  }

  // Select the correct week
  if (selectedWeekStr) {
    weekSelect.value = selectedWeekStr;
  } else if (meta.current_week != null) {
    weekSelect.value = String(meta.current_week);
  }
}

// ------------- Parsing matchups -------------

function extractMatchups(data) {
  try {
    const fc = data.fantasy_content;
    const leagueArray = fc.league;
    const meta = leagueArray[0];
    const scoreboard = leagueArray[1].scoreboard;

    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot.matchups;

    const weekNumber = scoreboard.week ?? meta.current_week;

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchupWrapper = matchupsObj[key];
        const matchup = matchupWrapper.matchup;
        const matchupInner = matchup["0"];

        const teamsObj = matchupInner.teams;
        const team0 = teamsObj["0"].team;
        const team1 = teamsObj["1"].team;

        const team0Meta = team0[0];
        const team0Stats = team0[1];
        const team1Meta = team1[0];
        const team1Stats = team1[1];

        const teamAName = pluckField(team0Meta, "name") || "Unknown Team";
        const teamBName = pluckField(team1Meta, "name") || "Unknown Team";

        const teamALogoObj = pluckField(team0Meta, "team_logos");
        const teamBLogoObj = pluckField(team1Meta, "team_logos");

        const teamALogo = teamALogoObj?.[0]?.team_logo?.url ?? null;
        const teamBLogo = teamBLogoObj?.[0]?.team_logo?.url ?? null;

        const teamAScore = team0Stats?.team_points?.total ?? "0.00";
        const teamBScore = team1Stats?.team_points?.total ?? "0.00";

        const teamAProj = team0Stats?.team_projected_points?.total ?? "0.00";
        const teamBProj = team1Stats?.team_projected_points?.total ?? "0.00";

        const teamAProb = team0Stats?.win_probability ?? null;
        const teamBProb = team1Stats?.win_probability ?? null;

        // Playoff flags live here
        const isPlayoffs = String(matchupInner?.is_playoffs ?? "0") === "1";
        const matchupWeek = matchupInner?.week ?? weekNumber;

        const playoffRound = isPlayoffs ? getPlayoffRoundLabel(matchupWeek, meta) : null;

        result.push({
          week: matchupWeek ?? weekNumber,
          playoffRound, // null unless playoffs
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

// ------------- Rendering matchups -------------

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

    // IMPORTANT CHANGE:
    // - No "Week X" inside each card (redundant)
    // - Show playoff tag ONLY if we have a round label
    const playoffTagHtml = m.playoffRound
      ? `<span class="matchup-tag">${m.playoffRound}</span>`
      : "";

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label"></span>
        ${playoffTagHtml}
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

// ------------- Standings extraction + render -------------

function extractStandingsTeams(data) {
  try {
    const leagueArr = data?.fantasy_content?.league;
    const standingsRoot = leagueArr?.[1]?.standings?.[0]?.teams;
    if (!standingsRoot) return [];

    const teams = [];
    Object.keys(standingsRoot)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const teamArr = standingsRoot[k]?.team;
        const meta = teamArr?.[0];
        const standings = teamArr?.[2]?.team_standings;
        const pointsFor = standings?.points_for ?? teamArr?.[1]?.team_points?.total ?? "0";

        const name = pluckField(meta, "name") || "Unknown";
        const logos = pluckField(meta, "team_logos");
        const logo = logos?.[0]?.team_logo?.url ?? null;

        const managers = pluckField(meta, "managers");
        const managerName = managers?.[0]?.manager?.nickname ?? "";

        const rank = standings?.rank ?? "";
        const wins = standings?.outcome_totals?.wins ?? "0";
        const losses = standings?.outcome_totals?.losses ?? "0";

        teams.push({
          rank: safeNum(rank, 999),
          name,
          logo,
          managerName,
          record: `${wins}-${losses}`,
          pointsFor: safeNum(pointsFor, 0),
        });
      });

    // Yahoo sort: by rank ascending
    teams.sort((a, b) => a.rank - b.rank);
    return teams;
  } catch (e) {
    console.error("extractStandingsTeams error:", e);
    return [];
  }
}

function renderStandingsUltraCompact(teams) {
  if (!standingsContainer) return;

  if (!teams || teams.length === 0) {
    standingsContainer.innerHTML = `<div class="standings-empty">No standings found.</div>`;
    return;
  }

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "8px";

  teams.forEach((t) => {
    const row = document.createElement("div");
    row.className = "matchup-card";
    row.style.padding = "8px 10px";

    row.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="display:flex; align-items:center; gap:8px; min-width:0;">
          ${
            t.logo
              ? `<img src="${t.logo}" alt="${t.name}" style="width:28px;height:28px;border-radius:999px;object-fit:cover;border:1px solid rgba(255,255,255,0.18);background:rgba(0,0,0,0.35);" />`
              : `<div style="width:28px;height:28px;border-radius:999px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:0.75rem;">?</div>`
          }
          <div style="min-width:0;">
            <div style="display:flex; align-items:baseline; gap:8px;">
              <div style="font-weight:800; font-size:0.8rem; opacity:0.9;">#${t.rank}</div>
              <div style="font-weight:700; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 220px;">
                ${t.name}
              </div>
            </div>
            <div style="font-size:0.72rem; color: rgba(255,255,255,0.65);">
              ${t.record}${t.managerName ? ` · ${t.managerName}` : ""}
            </div>
          </div>
        </div>

        <div style="text-align:right; flex:0 0 auto;">
          <div style="font-weight:900; font-size:0.9rem; line-height:1;">${t.pointsFor.toFixed(2)}</div>
          <div style="font-size:0.68rem; color: rgba(255,255,255,0.6);">PF</div>
        </div>
      </div>
    `;

    wrap.appendChild(row);
  });

  standingsContainer.innerHTML = "";
  standingsContainer.appendChild(wrap);
}

// ------------- Auto-load -------------
async function autoLoadEverything() {
  // Try to load standings regardless (will 401 until you authenticate)
  loadStandings();

  // Load current week scoreboard + render matchups
  await loadScoreboardForWeek(null);

  if (!scoreboardData) return;

  const matchups = extractMatchups(scoreboardData);
  if (!matchups || matchups.length === 0) {
    setStatus("No matchups found for this week.");
    if (matchupsContainer) matchupsContainer.innerHTML = "";
    return;
  }

  renderMatchupCards(matchups);
  setStatus(`Loaded ${matchups.length} matchups.`);
}

window.addEventListener("DOMContentLoaded", autoLoadEverything);
