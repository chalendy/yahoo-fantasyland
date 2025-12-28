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
let standingsData = null;
let isLoading = false;

// ------------- Helpers -------------

function setStatus(msg) {
  if (statusMessage) statusMessage.textContent = msg || "";
}

function safeText(v, fallback = "") {
  return v == null ? fallback : String(v);
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

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isTruthyOne(v) {
  // Yahoo likes "1" / 1
  return v === 1 || v === "1" || v === true;
}

function currentSelectedWeek() {
  if (!weekSelect) return null;
  const v = weekSelect.value;
  const n = toInt(v);
  return n;
}

// ------------- Auth button -------------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ------------- Data load functions -------------

async function fetchScoreboardForWeek(week) {
  const url = week ? `${backendBase}/scoreboard?week=${encodeURIComponent(week)}` : `${backendBase}/scoreboard`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Scoreboard ${res.status}: ${text}`);
  }
  return await res.json();
}

async function fetchStandings() {
  const res = await fetch(`${backendBase}/standings-raw`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Standings ${res.status}: ${text}`);
  }
  return await res.json();
}

// ------------- UI: week dropdown population -------------

function populateWeekDropdown(leagueMeta, preferredWeek) {
  if (!weekSelect) return;

  const startWeek = toInt(leagueMeta?.start_week) ?? 1;
  const endWeek = toInt(leagueMeta?.end_week) ?? (toInt(leagueMeta?.current_week) ?? 17);
  const currentWeek = toInt(leagueMeta?.current_week) ?? preferredWeek ?? startWeek;

  // Build options
  weekSelect.innerHTML = "";
  for (let w = startWeek; w <= endWeek; w++) {
    const opt = document.createElement("option");
    opt.value = String(w);
    opt.textContent = `Week ${w}`;
    weekSelect.appendChild(opt);
  }

  // Set selected
  const selectWeek = preferredWeek ?? currentWeek;
  weekSelect.value = String(selectWeek);
}

// ------------- Buttons -------------

if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    const w = currentSelectedWeek();
    await loadAll(w, { showJson: true, renderMatchups: true, renderStandings: true });
  });
}

if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", () => {
    if (!scoreboardData) {
      setStatus("No scoreboard loaded yet. Click 'Load Scoreboard JSON' first.");
      return;
    }
    const matchups = extractMatchups(scoreboardData);
    if (!matchups.length) {
      setStatus("No matchups found for this week.");
      if (matchupsContainer) matchupsContainer.innerHTML = "";
      return;
    }
    renderMatchupCards(matchups);
    setStatus(`Showing ${matchups.length} matchups.`);
  });
}

if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    const w = currentSelectedWeek();
    await loadAll(w, { showJson: false, renderMatchups: true, renderStandings: false });
  });
}

// ------------- Core load orchestrator -------------

async function loadAll(week, { showJson, renderMatchups, renderStandings }) {
  if (isLoading) return;
  isLoading = true;

  try {
    setStatus("Loading...");

    // Fetch scoreboard for selected week
    scoreboardData = await fetchScoreboardForWeek(week);

    // Update debug JSON if requested
    if (showJson && jsonOutput) {
      jsonOutput.textContent = JSON.stringify(scoreboardData, null, 2);
    }

    // Extract league meta to power week label + dropdown
    const leagueArr = scoreboardData?.fantasy_content?.league;
    const leagueMeta = Array.isArray(leagueArr) ? leagueArr[0] : null;
    const scoreboard = Array.isArray(leagueArr) ? leagueArr[1]?.scoreboard : null;

    // Determine active week (prefer the fetched scoreboard's week)
    const scoreboardWeek =
      toInt(scoreboard?.week) ??
      toInt(scoreboard?.["0"]?.matchups?.["0"]?.matchup?.week) ??
      toInt(leagueMeta?.current_week) ??
      week;

    // Update week label
    if (weekLabel && scoreboardWeek != null) {
      weekLabel.textContent = `Week ${scoreboardWeek}`;
    }

    // Ensure dropdown is populated (and consistent)
    populateWeekDropdown(leagueMeta, scoreboardWeek);

    // Render matchups
    if (renderMatchups) {
      const matchups = extractMatchups(scoreboardData);
      if (!matchups.length) {
        setStatus("No matchups found for this week.");
        if (matchupsContainer) matchupsContainer.innerHTML = "";
      } else {
        renderMatchupCards(matchups);
        setStatus(`Loaded ${matchups.length} matchups.`);
      }
    }

    // Fetch + render standings (optional)
    if (renderStandings) {
      try {
        standingsData = await fetchStandings();
        renderStandingsList(standingsData);
      } catch (e) {
        console.error("Standings load error:", e);
        setStatus("Loaded matchups, but standings failed.");
      }
    }
  } catch (err) {
    console.error("Load error:", err);
    const msg = String(err?.message || err);
    if (jsonOutput) jsonOutput.textContent = msg;
    setStatus(msg.includes("401") ? "Not authenticated. Click 'Sign In with Yahoo'." : "Failed to load data.");
  } finally {
    isLoading = false;
  }
}

// ------------- Parsing: Matchups -------------

function extractMatchups(data) {
  try {
    const fc = data?.fantasy_content;
    const leagueArray = fc?.league;
    if (!Array.isArray(leagueArray) || leagueArray.length < 2) return [];

    const leagueMeta = leagueArray[0];
    const scoreboard = leagueArray[1]?.scoreboard;
    if (!scoreboard) return [];

    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot?.matchups;
    if (!matchupsObj) return [];

    const weekNumber = toInt(scoreboard.week) ?? toInt(leagueMeta?.current_week) ?? null;

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchupWrapper = matchupsObj[key];
        const matchup = matchupWrapper?.matchup;
        const matchupInner = matchup?.["0"]; // contains teams + flags
        if (!matchupInner) return;

        const teamsObj = matchupInner?.teams;
        const team0 = teamsObj?.["0"]?.team;
        const team1 = teamsObj?.["1"]?.team;
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

        // ✅ PLAYOFF FLAGS LIVE HERE
        const isPlayoffs = isTruthyOne(matchupInner?.is_playoffs);
        const matchupWeek = toInt(matchupInner?.week) ?? weekNumber;

        result.push({
          week: matchupWeek,
          isPlayoffs,
          weekStart: matchupInner?.week_start || null,
          weekEnd: matchupInner?.week_end || null,
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

// ------------- Playoff label logic -------------

function playoffLabelForWeek(week, leagueMeta) {
  // If you want truly accurate labels, we need league settings / playoff weeks.
  // For now, we infer based on common 12-team formats + what you said: playoffs started week 15.
  if (week == null) return "Playoffs";

  if (week === 15) return "Quarterfinal";
  if (week === 16) return "Semifinal";
  if (week === 17) return "Final";
  return "Playoffs";
}

// ------------- Rendering: Matchups -------------

function renderMatchupCards(matchups) {
  if (!matchupsContainer) return;
  matchupsContainer.innerHTML = "";

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const teamAProbPct =
      m.teamA.winProbability != null
        ? Math.round(m.teamA.winProbability * 100)
        : null;
    const teamBProbPct =
      m.teamB.winProbability != null
        ? Math.round(m.teamB.winProbability * 100)
        : null;

    // ✅ Only show playoff tag when playoffs
    const tagHtml = m.isPlayoffs
      ? `<span class="matchup-tag">${playoffLabelForWeek(m.week)}</span>`
      : "";

    // ✅ remove redundant "Week X" line inside the card (you still have Week up top in header)
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
                ? `<img src="${m.teamA.logo}" alt="${safeText(m.teamA.name)}" class="team-logo" />`
                : `<div class="team-logo placeholder-logo">A</div>`
            }
            <div>
              <div class="team-name">${safeText(m.teamA.name)}</div>
              <div class="team-metadata">
                Proj: ${safeText(m.teamA.projected)}
                ${teamAProbPct != null ? ` · Win%: ${teamAProbPct}%` : ""}
              </div>
            </div>
          </div>
          <div class="team-score">${safeText(m.teamA.score)}</div>
        </div>

        <div class="vs-column">
          <span class="vs-pill">VS</span>
        </div>

        <div class="team-column">
          <div class="team-info team-info-right">
            <div>
              <div class="team-name">${safeText(m.teamB.name)}</div>
              <div class="team-metadata">
                Proj: ${safeText(m.teamB.projected)}
                ${teamBProbPct != null ? ` · Win%: ${teamBProbPct}%` : ""}
              </div>
            </div>
            ${
              m.teamB.logo
                ? `<img src="${m.teamB.logo}" alt="${safeText(m.teamB.name)}" class="team-logo" />`
                : `<div class="team-logo placeholder-logo">B</div>`
            }
          </div>
          <div class="team-score">${safeText(m.teamB.score)}</div>
        </div>
      </div>
    `;

    matchupsContainer.appendChild(card);
  });
}

// ------------- Standings rendering (ultra-compact) -------------

function extractStandings(standingsJson) {
  try {
    const leagueArr = standingsJson?.fantasy_content?.league;
    const standingsBlock = Array.isArray(leagueArr) ? leagueArr[1]?.standings?.[0] : null;
    const teamsObj = standingsBlock?.teams;
    if (!teamsObj) return [];

    const teams = [];

    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const t = teamsObj[k]?.team;
        if (!t) return;

        const meta = t[0];
        const points = t[1]?.team_points?.total ?? null;
        const st = t[2]?.team_standings;

        const rank = toInt(st?.rank);
        const wins = toInt(st?.outcome_totals?.wins) ?? 0;
        const losses = toInt(st?.outcome_totals?.losses) ?? 0;
        const ties = toInt(st?.outcome_totals?.ties) ?? 0;
        const managerNick =
          pluckField(meta, "managers")?.[0]?.manager?.nickname ??
          "";

        const name = pluckField(meta, "name") ?? "Unknown";
        const logo = pluckField(meta, "team_logos")?.[0]?.team_logo?.url ?? null;

        teams.push({
          rank: rank ?? 999,
          name,
          manager: managerNick,
          record: `${wins}-${losses}${ties ? `-${ties}` : ""}`,
          pf: points ? Number(points).toFixed(2) : "",
          logo,
        });
      });

    // Yahoo sorting: rank asc
    teams.sort((a, b) => a.rank - b.rank);
    return teams;
  } catch (e) {
    console.error("extractStandings error:", e);
    return [];
  }
}

function renderStandingsList(standingsJson) {
  if (!standingsContainer) return;

  const teams = extractStandings(standingsJson);
  if (!teams.length) {
    standingsContainer.innerHTML = `<div class="standings-empty">No standings found.</div>`;
    return;
  }

  const rows = teams
    .map((t) => {
      return `
        <div class="standings-row">
          <div class="standings-left">
            ${
              t.logo
                ? `<img class="standings-logo" src="${t.logo}" alt="${safeText(t.name)}" />`
                : `<div class="standings-logo standings-logo--placeholder"></div>`
            }
            <div class="standings-namewrap">
              <div class="standings-line1">
                <span class="standings-rank">#${t.rank}</span>
                <span class="standings-name" title="${safeText(t.name)}">${safeText(t.name)}</span>
              </div>
              <div class="standings-line2">${safeText(t.record)} · ${safeText(t.manager)}</div>
            </div>
          </div>
          <div class="standings-right">
            <div class="standings-pf">${safeText(t.pf)}</div>
            <div class="standings-pf-label">PF</div>
          </div>
        </div>
      `;
    })
    .join("");

  standingsContainer.innerHTML = `<div class="standings-rows">${rows}</div>`;
}

// ------------- Auto-load on startup -------------

window.addEventListener("DOMContentLoaded", async () => {
  // Try to load current week automatically (will 401 if not signed in yet)
  const w = currentSelectedWeek(); // maybe null on first load
  await loadAll(w, { showJson: false, renderMatchups: true, renderStandings: true });
});
