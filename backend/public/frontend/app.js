// Same-origin backend
const backendBase = "";

// UI elements
const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const standingsContainer = document.getElementById("standingsContainer");
const statusMessage = document.getElementById("statusMessage");
const weekLabel = document.getElementById("weekLabel");
const weekSelect = document.getElementById("weekSelect");
const standingsSort = document.getElementById("standingsSort"); // optional if you add it

let scoreboardData = null;
let lastLoadedWeek = null;
let standingsData = null;
let standingsSortMode = "yahoo"; // default

// ---------------- Helpers ----------------

function setStatus(msg) {
  if (statusMessage) statusMessage.textContent = msg;
}

function safeText(el, text) {
  if (el) el.textContent = text;
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

function parseLeagueMeta(data) {
  const leagueArray = data?.fantasy_content?.league;
  if (!Array.isArray(leagueArray) || !leagueArray[0]) return null;
  return leagueArray[0];
}

function getWeekRangeFromLeagueMeta(leagueMeta) {
  const start = Number(leagueMeta?.start_week ?? 1);
  const end = Number(leagueMeta?.end_week ?? 17);
  const current = Number(leagueMeta?.current_week ?? leagueMeta?.matchup_week ?? start);
  return { start, end, current };
}

function fillWeekDropdown({ start, end, current }, preferWeek) {
  if (!weekSelect) return;

  const selectedWeek =
    preferWeek != null ? Number(preferWeek) : (Number(current) || Number(start) || 1);

  // Rebuild only if empty or range changed
  const existingOptions = weekSelect.querySelectorAll("option");
  const shouldRebuild = existingOptions.length !== (end - start + 1);

  if (shouldRebuild) {
    weekSelect.innerHTML = "";
    for (let w = start; w <= end; w++) {
      const opt = document.createElement("option");
      opt.value = String(w);
      opt.textContent = `Week ${w}`;
      weekSelect.appendChild(opt);
    }
  }

  weekSelect.value = String(selectedWeek);
}

function getSelectedWeek() {
  if (!weekSelect) return null;
  const val = Number(weekSelect.value);
  return Number.isFinite(val) ? val : null;
}

// ---------------- Auth ----------------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ---------------- Fetching ----------------

async function fetchScoreboardForWeek(week) {
  // IMPORTANT: this assumes your server supports `?week=`.
  // If it doesn't yet, you must add it server-side in /scoreboard.
  const url = week != null
    ? `${backendBase}/scoreboard?week=${encodeURIComponent(week)}`
    : `${backendBase}/scoreboard`;

  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    // keep text for debugging
    const err = new Error(`Scoreboard fetch failed (${res.status})`);
    err.status = res.status;
    err.body = text;
    throw err;
  }

  return JSON.parse(text);
}

async function fetchStandingsRaw() {
  const res = await fetch(`${backendBase}/standings-raw`);
  const text = await res.text();

  if (!res.ok) {
    const err = new Error(`Standings fetch failed (${res.status})`);
    err.status = res.status;
    err.body = text;
    throw err;
  }

  // standings-raw returns JSON string body
  return JSON.parse(text);
}

// ---------------- Parsing: Matchups ----------------

function extractMatchups(data) {
  try {
    const leagueArray = data?.fantasy_content?.league;
    const leagueMeta = leagueArray?.[0];
    const scoreboard = leagueArray?.[1]?.scoreboard;

    const scoreboardRoot = scoreboard?.["0"];
    const matchupsObj = scoreboardRoot?.matchups;
    if (!matchupsObj) return [];

    const weekNumber = scoreboard?.week ?? leagueMeta?.current_week ?? null;

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchupWrapper = matchupsObj[key];
        const matchup = matchupWrapper?.matchup;
        const matchupInner = matchup?.["0"];
        const teamsObj = matchupInner?.teams;

        if (!teamsObj?.["0"]?.team || !teamsObj?.["1"]?.team) return;

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

        // Hide "Playoffs" unless this matchup says playoffs = "1"
        const isPlayoffs = matchupWrapper?.matchup?.is_playoffs === "1"
          || matchupWrapper?.matchup?.is_playoffs === 1
          || matchup?.is_playoffs === "1"
          || matchup?.is_playoffs === 1
          || matchupInner?.is_playoffs === "1"
          || matchupInner?.is_playoffs === 1
          || matchupWrapper?.matchup?.["0"]?.is_playoffs === "1"; // just in case

        // In your JSON snippet, is_playoffs is inside matchup object (same level as week_start/week_end)
        // Example: matchup: { "0": {...teams...}, "week":"15", "is_playoffs":"1", ... }
        const matchupMeta = matchupWrapper?.matchup;
        const isPlayoffsFromMeta = matchupMeta?.is_playoffs === "1" || matchupMeta?.is_playoffs === 1;

        result.push({
          week: weekNumber,
          playoffs: Boolean(isPlayoffs || isPlayoffsFromMeta),
          teamA: { name: teamAName, logo: teamALogo, score: teamAScore, projected: teamAProj, winProbability: teamAProb },
          teamB: { name: teamBName, logo: teamBLogo, score: teamBScore, projected: teamBProj, winProbability: teamBProb },
        });
      });

    return result;
  } catch (err) {
    console.error("Error extracting matchups:", err);
    return [];
  }
}

// ---------------- Rendering: Matchups ----------------

function renderMatchupCards(matchups) {
  if (!matchupsContainer) return;
  matchupsContainer.innerHTML = "";

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const teamAProbPct = m.teamA.winProbability != null ? Math.round(m.teamA.winProbability * 100) : null;
    const teamBProbPct = m.teamB.winProbability != null ? Math.round(m.teamB.winProbability * 100) : null;

    const tagHtml = m.playoffs
      ? `<span class="matchup-tag">Playoffs</span>`
      : "";

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
                Proj: ${m.teamA.projected}${teamAProbPct != null ? ` · Win%: ${teamAProbPct}%` : ""}
              </div>
            </div>
          </div>
          <div class="team-score">${m.teamA.score}</div>
        </div>

        <div class="vs-column"><span class="vs-pill">VS</span></div>

        <div class="team-column">
          <div class="team-info team-info-right">
            <div>
              <div class="team-name">${m.teamB.name}</div>
              <div class="team-metadata">
                Proj: ${m.teamB.projected}${teamBProbPct != null ? ` · Win%: ${teamBProbPct}%` : ""}
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

// ---------------- Parsing + Rendering: Standings ----------------

function extractStandings(data) {
  try {
    const leagueArray = data?.fantasy_content?.league;
    const standingsBlock = leagueArray?.[1]?.standings?.[0]?.teams;
    if (!standingsBlock) return [];

    const teams = [];
    Object.keys(standingsBlock)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const team = standingsBlock[k]?.team;
        if (!team) return;

        const meta = team[0];
        const pointsBlock = team[1];
        const standings = team[2]?.team_standings;

        const name = pluckField(meta, "name") || "Unknown Team";
        const logos = pluckField(meta, "team_logos");
        const logo = logos?.[0]?.team_logo?.url ?? null;

        const managers = pluckField(meta, "managers");
        const managerNickname = managers?.[0]?.manager?.nickname ?? "";

        const rank = Number(standings?.rank ?? 999);
        const wins = Number(standings?.outcome_totals?.wins ?? 0);
        const losses = Number(standings?.outcome_totals?.losses ?? 0);
        const ties = Number(standings?.outcome_totals?.ties ?? 0);

        const pf = Number(standings?.points_for ?? pointsBlock?.team_points?.total ?? 0);
        const pa = Number(standings?.points_against ?? 0);

        teams.push({
          rank,
          name,
          manager: managerNickname,
          logo,
          record: { wins, losses, ties },
          pf,
          pa,
        });
      });

    return teams;
  } catch (e) {
    console.error("extractStandings error:", e);
    return [];
  }
}

function sortStandings(list, mode) {
  const arr = [...list];

  if (mode === "pf") {
    arr.sort((a, b) => (b.pf - a.pf) || (a.rank - b.rank));
    return arr;
  }

  if (mode === "record") {
    // Sort by wins desc, losses asc, ties desc, then PF desc
    arr.sort((a, b) => {
      if (b.record.wins !== a.record.wins) return b.record.wins - a.record.wins;
      if (a.record.losses !== b.record.losses) return a.record.losses - b.record.losses;
      if (b.record.ties !== a.record.ties) return b.record.ties - a.record.ties;
      if (b.pf !== a.pf) return b.pf - a.pf;
      return a.rank - b.rank;
    });
    return arr;
  }

  // yahoo rank default
  arr.sort((a, b) => a.rank - b.rank);
  return arr;
}

function renderStandings(list) {
  if (!standingsContainer) return;
  standingsContainer.innerHTML = "";

  if (!list || list.length === 0) {
    standingsContainer.innerHTML = `<div class="standings-empty">No standings found.</div>`;
    return;
  }

  const sorted = sortStandings(list, standingsSortMode);

  const wrap = document.createElement("div");
  wrap.className = "standings-wrap";

  for (const t of sorted) {
    const record = `${t.record.wins}-${t.record.losses}${t.record.ties ? `-${t.record.ties}` : ""}`;

    const row = document.createElement("div");
    row.className = "standings-row";

    row.innerHTML = `
      <div class="standings-left">
        ${
          t.logo
            ? `<img class="standings-logo" src="${t.logo}" alt="${t.name}">`
            : `<div class="standings-logo standings-logo--placeholder">•</div>`
        }
        <div class="standings-meta">
          <div class="standings-topline">
            <span class="standings-rank">#${t.rank}</span>
            <span class="standings-name" title="${t.name}">${t.name}</span>
          </div>
          <div class="standings-subline">
            <span class="standings-record">${record}</span>
            ${t.manager ? `<span class="standings-dot">·</span><span class="standings-manager">${t.manager}</span>` : ""}
          </div>
        </div>
      </div>

      <div class="standings-right">
        <div class="standings-pf">${Number.isFinite(t.pf) ? t.pf.toFixed(2) : "0.00"}</div>
        <div class="standings-pf-label">PF</div>
      </div>
    `;

    wrap.appendChild(row);
  }

  standingsContainer.appendChild(wrap);
}

// ---------------- Main flows ----------------

async function loadStandings() {
  try {
    setStatus("Loading standings...");
    standingsData = await fetchStandingsRaw();
    const teams = extractStandings(standingsData);
    renderStandings(teams);
    setStatus("Standings loaded.");
  } catch (err) {
    console.error("Standings error:", err);
    if (err?.status === 401) {
      setStatus("Standings: not authenticated. Click 'Sign In with Yahoo'.");
    } else {
      setStatus("Error loading standings.");
    }
  }
}

async function loadScoreboardForWeek(week, { renderMatchups = true, updateJson = true } = {}) {
  try {
    setStatus(week ? `Loading scoreboard for week ${week}...` : "Loading scoreboard...");
    const data = await fetchScoreboardForWeek(week);

    // IMPORTANT: replace global state so the UI is not stuck on week 15
    scoreboardData = data;
    lastLoadedWeek = week ?? null;

    if (updateJson && jsonOutput) {
      jsonOutput.textContent = JSON.stringify(data, null, 2);
    }

    const leagueMeta = parseLeagueMeta(data);
    if (leagueMeta) {
      const range = getWeekRangeFromLeagueMeta(leagueMeta);

      // Prefer the week we requested; otherwise use meta current_week
      fillWeekDropdown(range, week ?? range.current);

      const effectiveWeek = week ?? range.current;
      safeText(weekLabel, effectiveWeek != null ? `Week ${effectiveWeek}` : "");
    }

    if (renderMatchups) {
      const matchups = extractMatchups(data);
      if (!matchups || matchups.length === 0) {
        if (matchupsContainer) matchupsContainer.innerHTML = "";
        setStatus("No matchups found for this week.");
      } else {
        renderMatchupCards(matchups);
        setStatus(`Loaded ${matchups.length} matchups.`);
      }
    } else {
      setStatus("Scoreboard loaded.");
    }
  } catch (err) {
    console.error("Scoreboard error:", err);

    if (err?.status === 401) {
      setStatus("Not authenticated. Click 'Sign In with Yahoo'.");
      if (jsonOutput) jsonOutput.textContent = `401 Unauthorized\n${err.body ?? ""}`;
      if (matchupsContainer) matchupsContainer.innerHTML = "";
      return;
    }

    setStatus("Failed to load scoreboard.");
    if (jsonOutput) jsonOutput.textContent = `Error\n${err?.body ?? err?.message ?? "Unknown error"}`;
  }
}

// ---------------- Button Handlers ----------------

if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    // load for currently selected week, or default
    const week = getSelectedWeek();
    await loadScoreboardForWeek(week, { renderMatchups: false, updateJson: true });
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
    setStatus(`Showing ${matchups.length} matchups.`);
  });
}

// Week dropdown changes should actually load a NEW scoreboard payload
if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    const selectedWeek = getSelectedWeek();
    if (!selectedWeek) return;

    // This is the key fix:
    // Always fetch a new scoreboard for that week and re-render matchups.
    await loadScoreboardForWeek(selectedWeek, { renderMatchups: true, updateJson: false });
  });
}

// Standings sort (optional — if you add a select in HTML)
if (standingsSort) {
  standingsSort.addEventListener("change", () => {
    standingsSortMode = standingsSort.value || "yahoo";
    const teams = extractStandings(standingsData);
    renderStandings(teams);
  });
}

// ---------------- Auto boot ----------------

window.addEventListener("DOMContentLoaded", async () => {
  // Pre-fill dropdown with something reasonable even before auth
  if (weekSelect && weekSelect.options.length === 0) {
    const fallback = { start: 1, end: 17, current: 1 };
    fillWeekDropdown(fallback, 1);
  }

  // Try to load scoreboard + matchups (will show 401 status if not authed)
  await loadScoreboardForWeek(getSelectedWeek(), { renderMatchups: true, updateJson: true });

  // Try standings (also shows auth status if 401)
  await loadStandings();
});
