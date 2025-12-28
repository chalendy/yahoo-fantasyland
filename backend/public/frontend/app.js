// Same-origin (Render serves frontend + backend together)
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

let scoreboardData = null;
let leagueMeta = null;

// ------------- Helpers -------------

function setStatus(msg) {
  if (statusMessage) statusMessage.textContent = msg || "";
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
  if (v === undefined || v === null) return fallback;
  return String(v);
}

function clearNode(el) {
  if (el) el.innerHTML = "";
}

// ------------- Auth -------------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    // Yahoo OAuth start (server handles redirect)
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ------------- Fetchers -------------

async function fetchScoreboardForWeek(week) {
  // Server may support ?week= (your dropdown worked before),
  // but we’ll also gracefully fall back.
  const url = week ? `${backendBase}/scoreboard?week=${encodeURIComponent(week)}` : `${backendBase}/scoreboard`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Scoreboard error ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchStandingsRaw() {
  const res = await fetch(`${backendBase}/standings-raw`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Standings error ${res.status}: ${text}`);
  }
  // standings-raw returns JSON as text; parse it
  const rawText = await res.text();
  return JSON.parse(rawText);
}

// ------------- Parsing: Matchups -------------

function extractMatchups(data) {
  try {
    const fc = data.fantasy_content;
    const leagueArray = fc.league;

    const meta = leagueArray[0];
    const scoreboard = leagueArray[1]?.scoreboard;

    // scoreboard["0"].matchups
    const scoreboardRoot = scoreboard?.["0"];
    const matchupsObj = scoreboardRoot?.matchups;

    if (!matchupsObj) return [];

    const weekNumber = scoreboard?.week ?? meta?.current_week;
    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchupWrapper = matchupsObj[key];
        const matchup = matchupWrapper.matchup;
        const matchupInner = matchup?.["0"];
        const teamsObj = matchupInner?.teams;

        if (!teamsObj || !teamsObj["0"] || !teamsObj["1"]) return;

        const team0 = teamsObj["0"].team;
        const team1 = teamsObj["1"].team;

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

        // Yahoo indicates playoffs with is_playoffs in matchup
        const isPlayoffs = safeText(matchup?.is_playoffs ?? matchupInner?.is_playoffs ?? "0") === "1";

        result.push({
          week: weekNumber,
          isPlayoffs,
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

// ------------- Rendering: Matchups -------------

function renderMatchupCards(matchups) {
  if (!matchupsContainer) return;
  clearNode(matchupsContainer);

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const teamAProbPct =
      m.teamA.winProbability != null ? Math.round(m.teamA.winProbability * 100) : null;
    const teamBProbPct =
      m.teamB.winProbability != null ? Math.round(m.teamB.winProbability * 100) : null;

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">Week ${m.week ?? "?"}</span>
        ${
          m.isPlayoffs
            ? `<span class="matchup-tag">Playoffs</span>`
            : ``
        }
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

// ------------- Parsing + Rendering: Standings -------------

function extractStandings(standingsJson) {
  try {
    const leagueArray = standingsJson?.fantasy_content?.league;
    const standingsBlock = leagueArray?.[1]?.standings?.[0];
    const teamsObj = standingsBlock?.teams;

    if (!teamsObj) return [];

    const teams = [];
    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const teamArr = teamsObj[k]?.team;
        const meta = teamArr?.[0];
        const points = teamArr?.[1]?.team_points?.total;
        const standings = teamArr?.[2]?.team_standings;

        const name = pluckField(meta, "name") || "Unknown Team";
        const logoObj = pluckField(meta, "team_logos");
        const logo = logoObj?.[0]?.team_logo?.url || null;

        const rank = standings?.rank ?? null;
        const wins = standings?.outcome_totals?.wins ?? "?";
        const losses = standings?.outcome_totals?.losses ?? "?";
        const ties = standings?.outcome_totals?.ties ?? 0;

        // Manager name (first manager nickname if present)
        const managers = pluckField(meta, "managers");
        const managerNickname = managers?.[0]?.manager?.nickname || "";

        const pf = points ?? standings?.points_for ?? "";

        teams.push({
          rank: rank ? Number(rank) : 999,
          rankText: safeText(rank, "?"),
          name,
          logo,
          record: `${wins}-${losses}${ties && Number(ties) > 0 ? `-${ties}` : ""}`,
          manager: managerNickname,
          pf: safeText(pf, ""),
        });
      });

    // Yahoo sorting = rank ascending
    teams.sort((a, b) => a.rank - b.rank);
    return teams;
  } catch (e) {
    console.error("extractStandings error:", e);
    return [];
  }
}

function renderStandings(teams) {
  if (!standingsContainer) return;
  clearNode(standingsContainer);

  if (!teams || teams.length === 0) {
    standingsContainer.innerHTML = `<div class="standings-empty">No standings found.</div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  teams.forEach((t) => {
    const row = document.createElement("div");
    row.className = "standings-row";

    row.innerHTML = `
      <div class="standings-left">
        ${
          t.logo
            ? `<img class="standings-logo" src="${t.logo}" alt="${t.name}">`
            : `<div class="standings-logo standings-logo--placeholder"></div>`
        }
        <div class="standings-text">
          <div class="standings-line1">
            <span class="standings-rank">#${t.rankText}</span>
            <span class="standings-team" title="${t.name}">${t.name}</span>
          </div>
          <div class="standings-line2">
            <span class="standings-record">${t.record}</span>
            ${t.manager ? `<span class="standings-manager"> · ${t.manager}</span>` : ``}
          </div>
        </div>
      </div>

      <div class="standings-right">
        <div class="standings-pf">${t.pf}</div>
        <div class="standings-pf-label">PF</div>
      </div>
    `;

    frag.appendChild(row);
  });

  standingsContainer.appendChild(frag);
}

// ------------- Week dropdown -------------

function populateWeekDropdown(meta) {
  if (!weekSelect || !meta) return;

  const startWeek = Number(meta.start_week ?? 1);
  const endWeek = Number(meta.end_week ?? meta.current_week ?? 17);
  const currentWeek = Number(meta.current_week ?? startWeek);

  // If already populated, don’t wipe if it’s correct
  weekSelect.innerHTML = "";

  for (let w = startWeek; w <= endWeek; w++) {
    const opt = document.createElement("option");
    opt.value = String(w);
    opt.textContent = `Week ${w}`;
    if (w === currentWeek) opt.selected = true;
    weekSelect.appendChild(opt);
  }

  if (weekLabel) weekLabel.textContent = `Week ${currentWeek}`;
}

async function loadMatchupsForSelectedWeek() {
  const selectedWeek = weekSelect?.value;
  if (!selectedWeek) return;

  setStatus(`Loading matchups for Week ${selectedWeek}...`);

  try {
    const data = await fetchScoreboardForWeek(selectedWeek);
    scoreboardData = data;

    // Update JSON debug panel (optional but helpful)
    if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

    // Update week label to the selected week (don’t trust response meta)
    if (weekLabel) weekLabel.textContent = `Week ${selectedWeek}`;

    const matchups = extractMatchups(data);
    if (!matchups || matchups.length === 0) {
      clearNode(matchupsContainer);
      setStatus("No matchups found for that week.");
      return;
    }

    renderMatchupCards(matchups);
    setStatus(`Showing ${matchups.length} matchups for Week ${selectedWeek}.`);
  } catch (err) {
    console.error("Week matchup load error:", err);
    setStatus("Error loading matchups for selected week.");
  }
}

// Hook dropdown changes
if (weekSelect) {
  weekSelect.addEventListener("change", () => {
    loadMatchupsForSelectedWeek();
  });
}

// ------------- Button handlers -------------

if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    try {
      setStatus("Loading scoreboard JSON...");
      if (jsonOutput) jsonOutput.textContent = "Loading...";

      // If a week is selected, load that week’s scoreboard
      const week = weekSelect?.value || null;
      const data = await fetchScoreboardForWeek(week);

      scoreboardData = data;

      if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);
      setStatus("Scoreboard JSON loaded successfully.");

      // Update league meta + week dropdown once
      const leagueArr = data?.fantasy_content?.league;
      leagueMeta = leagueArr?.[0] || null;
      if (leagueMeta) populateWeekDropdown(leagueMeta);

      // Also render matchups immediately after JSON load (nice UX)
      const matchups = extractMatchups(data);
      if (matchups.length) renderMatchupCards(matchups);
    } catch (err) {
      console.error("Load JSON error:", err);
      if (jsonOutput) jsonOutput.textContent = "Error fetching scoreboard. See console.";
      setStatus("Error fetching scoreboard JSON (are you signed in?).");
    }
  });
}

if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", async () => {
    // Prefer loading matchups for selected week directly
    if (weekSelect?.value) {
      await loadMatchupsForSelectedWeek();
      return;
    }

    // Fallback: if no dropdown populated yet, use cached scoreboardData
    if (!scoreboardData) {
      setStatus("No scoreboard loaded yet. Click 'Load Scoreboard JSON' first.");
      return;
    }

    const matchups = extractMatchups(scoreboardData);
    if (!matchups || matchups.length === 0) {
      setStatus("No matchups found for this week.");
      clearNode(matchupsContainer);
      return;
    }

    renderMatchupCards(matchups);
    setStatus(`Showing ${matchups.length} matchups for this week.`);
  });
}

// ------------- Auto load everything -------------

async function autoLoadEverything() {
  setStatus("Loading scoreboard + standings...");

  // 1) Load standings (independent)
  try {
    const standingsJson = await fetchStandingsRaw();
    const teams = extractStandings(standingsJson);
    renderStandings(teams);
  } catch (err) {
    console.error("Standings load error:", err);
    if (standingsContainer) {
      standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings (sign in first).</div>`;
    }
  }

  // 2) Load scoreboard (may 401 if not signed in)
  try {
    const data = await fetchScoreboardForWeek(null);
    scoreboardData = data;

    // debug
    if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

    // meta + dropdown
    const leagueArr = data?.fantasy_content?.league;
    leagueMeta = leagueArr?.[0] || null;
    if (leagueMeta) populateWeekDropdown(leagueMeta);

    // render matchups for current selected week (or current_week)
    if (weekSelect?.value) {
      // Load scoreboard for selected week to ensure matchups match dropdown
      await loadMatchupsForSelectedWeek();
    } else {
      const matchups = extractMatchups(data);
      if (matchups.length) renderMatchupCards(matchups);
      setStatus(`Loaded ${matchups.length || 0} matchups.`);
    }
  } catch (err) {
    console.error("Auto scoreboard load error:", err);
    setStatus("Not signed in. Click 'Sign In with Yahoo' first.");
  }
}

window.addEventListener("DOMContentLoaded", autoLoadEverything);
