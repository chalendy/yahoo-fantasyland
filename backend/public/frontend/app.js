// If frontend is served from the same origin as backend, we can use relative URLs
const backendBase = ""; // same origin

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

// Sorting controls (if present in your HTML)
const standingsSort = document.getElementById("standingsSort"); // optional

let scoreboardData = null;
let standingsData = null;

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

function safeText(v, fallback = "") {
  return v == null ? fallback : String(v);
}

function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Determine playoff round label based on league end_week.
// Typical: end_week 17 => 15 QF, 16 SF, 17 Final.
function getPlayoffRoundLabel(leagueMeta, matchupWeek) {
  const endWeek = numOrNull(leagueMeta?.end_week);
  const w = numOrNull(matchupWeek);

  if (!endWeek || !w) return "Playoffs";

  const finalWeek = endWeek;
  const semiWeek = endWeek - 1;
  const quarterWeek = endWeek - 2;

  if (w === finalWeek) return "Final";
  if (w === semiWeek) return "Semifinal";
  if (w === quarterWeek) return "Quarterfinal";
  return "Playoffs";
}

// ------------- Auth -------------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ------------- Load Scoreboard JSON (manual button) -------------

if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    const selectedWeek = weekSelect?.value ? Number(weekSelect.value) : null;
    await loadScoreboardForWeek(selectedWeek, { showJson: true, renderMatchups: true });
  });
}

// ------------- Load Matchups (manual button) -------------

if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", () => {
    if (!scoreboardData) {
      setStatus("No scoreboard loaded yet. Click 'Load Scoreboard JSON' first.");
      return;
    }

    const parsed = parseScoreboard(scoreboardData);
    if (!parsed || parsed.matchups.length === 0) {
      setStatus("No matchups found for this week.");
      if (matchupsContainer) matchupsContainer.innerHTML = "";
      return;
    }

    renderMatchupCards(parsed);
    setStatus(`Showing ${parsed.matchups.length} matchups.`);
  });
}

// ------------- Week dropdown wiring -------------

function populateWeekDropdown(leagueMeta) {
  if (!weekSelect) return;

  const startWeek = numOrNull(leagueMeta?.start_week) ?? 1;
  const endWeek = numOrNull(leagueMeta?.end_week) ?? 17;
  const currentWeek = numOrNull(leagueMeta?.current_week) ?? endWeek;

  // Only build options if empty (or if previously missing)
  if (weekSelect.options.length === 0) {
    for (let w = startWeek; w <= endWeek; w++) {
      const opt = document.createElement("option");
      opt.value = String(w);
      opt.textContent = `Week ${w}`;
      weekSelect.appendChild(opt);
    }
  }

  // Default selection: current week
  if (!weekSelect.value) {
    weekSelect.value = String(currentWeek);
  }
}

if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    const w = Number(weekSelect.value);
    await loadScoreboardForWeek(w, { showJson: false, renderMatchups: true });
  });
}

// ------------- Fetchers -------------

async function loadScoreboardForWeek(week, { showJson, renderMatchups }) {
  try {
    const qs = week ? `?week=${encodeURIComponent(week)}` : "";
    setStatus(`Loading scoreboard${week ? ` (Week ${week})` : ""}...`);

    const res = await fetch(`${backendBase}/scoreboard${qs}`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      setStatus("Failed to load scoreboard. Are you signed in?");
      if (showJson && jsonOutput) jsonOutput.textContent = `Error: ${res.status}\n${text}`;
      return;
    }

    const data = await res.json();
    scoreboardData = data;

    const parsed = parseScoreboard(data);

    // Populate week selector as soon as we have league meta
    populateWeekDropdown(parsed.leagueMeta);

    // Keep top label in sync with selected week (or parsed week)
    if (weekLabel) {
      const labelWeek = parsed.week ?? week ?? parsed.leagueMeta?.current_week;
      if (labelWeek != null) weekLabel.textContent = `Week ${labelWeek}`;
    }

    if (showJson && jsonOutput) {
      jsonOutput.textContent = JSON.stringify(data, null, 2);
    }

    if (renderMatchups) {
      if (!parsed.matchups || parsed.matchups.length === 0) {
        setStatus("No matchups found for this week.");
        if (matchupsContainer) matchupsContainer.innerHTML = "";
      } else {
        renderMatchupCards(parsed);
        setStatus(`Loaded ${parsed.matchups.length} matchups.`);
      }
    }
  } catch (err) {
    console.error("loadScoreboardForWeek error:", err);
    setStatus("Error loading scoreboard.");
  }
}

async function loadStandings({ showErrorToStatus = true } = {}) {
  if (!standingsContainer) return;

  try {
    const res = await fetch(`${backendBase}/standings-raw`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Standings error:", res.status, text);
      if (showErrorToStatus) setStatus("Error loading standings.");
      standingsContainer.innerHTML = "";
      return;
    }

    const data = await res.json();
    standingsData = data;

    const teams = extractStandingsTeams(data);
    renderStandingsUltraCompact(teams);
  } catch (err) {
    console.error("Standings fetch error:", err);
    if (showErrorToStatus) setStatus("Error loading standings.");
    standingsContainer.innerHTML = "";
  }
}

// ------------- Parsing: Scoreboard -> Matchups -------------

function parseScoreboard(data) {
  const leagueArray = data?.fantasy_content?.league;
  const leagueMeta = leagueArray?.[0] ?? {};
  const scoreboard = leagueArray?.[1]?.scoreboard;

  const scoreboardRoot = scoreboard?.["0"];
  const matchupsObj = scoreboardRoot?.matchups ?? {};

  // Yahoo has: leagueMeta.current_week, and also scoreboard.week sometimes
  const weekNumber = scoreboard?.week ?? leagueMeta?.current_week ?? null;

  const matchups = [];

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

      const matchupWeek = matchupInner?.week ?? weekNumber ?? null;
      const isPlayoffs = safeText(matchupInner?.is_playoffs, "0") === "1";

      matchups.push({
        week: matchupWeek,
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

  return { leagueMeta, week: weekNumber, matchups };
}

// ------------- Rendering: Matchups -------------

function renderMatchupCards(parsed) {
  if (!matchupsContainer) return;
  matchupsContainer.innerHTML = "";

  const { leagueMeta, matchups } = parsed;

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const teamAProbPct =
      m.teamA.winProbability != null ? Math.round(m.teamA.winProbability * 100) : null;
    const teamBProbPct =
      m.teamB.winProbability != null ? Math.round(m.teamB.winProbability * 100) : null;

    // ✅ Only show tag if playoffs
    let tagHTML = "";
    if (m.isPlayoffs) {
      const label = getPlayoffRoundLabel(leagueMeta, m.week);
      tagHTML = `<span class="matchup-tag">${label}</span>`;
    }

    // ✅ Removed "Week X" from inside each matchup card (redundant)
    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label"></span>
        ${tagHTML}
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

// ------------- Standings parsing + rendering -------------

function extractStandingsTeams(data) {
  try {
    const leagueArr = data?.fantasy_content?.league;
    const standingsBlock = leagueArr?.[1]?.standings?.[0];
    const teamsObj = standingsBlock?.teams ?? {};

    const out = [];
    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const t = teamsObj[k]?.team;
        if (!Array.isArray(t)) return;

        const meta = t[0];
        const pointsBlock = t[1];
        const standings = t[2]?.team_standings;

        const name = pluckField(meta, "name") ?? "Unknown";
        const logoObj = pluckField(meta, "team_logos");
        const logo = logoObj?.[0]?.team_logo?.url ?? null;

        const managersObj = pluckField(meta, "managers");
        const managerNickname = managersObj?.[0]?.manager?.nickname ?? "";

        const rank = standings?.rank ? Number(standings.rank) : null;
        const wins = standings?.outcome_totals?.wins ?? "";
        const losses = standings?.outcome_totals?.losses ?? "";
        const ties = standings?.outcome_totals?.ties ?? 0;

        const pf = standings?.points_for ?? pointsBlock?.team_points?.total ?? "";

        const record = `${wins}-${losses}${Number(ties) ? `-${ties}` : ""}`;

        out.push({
          rank,
          name,
          logo,
          manager: managerNickname,
          record,
          pf: pf ? Number(pf).toFixed(2) : "",
        });
      });

    return out;
  } catch (e) {
    console.error("extractStandingsTeams error:", e);
    return [];
  }
}

// Ultra compact standings renderer (uses existing matchup-card styling)
function renderStandingsUltraCompact(teams) {
  if (!standingsContainer) return;
  standingsContainer.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "8px";

  teams
    .slice()
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .forEach((t) => {
      const card = document.createElement("div");
      card.className = "matchup-card standings-card-ultra";

      card.innerHTML = `
        <div class="standings-row">
          <div class="standings-left">
            ${
              t.logo
                ? `<img src="${t.logo}" alt="${t.name}" class="standings-logo" />`
                : `<div class="standings-logo placeholder-logo">•</div>`
            }
            <div class="standings-text">
              <div class="standings-line1">
                <span class="standings-rank">#${t.rank ?? "-"}</span>
                <span class="standings-team">${t.name}</span>
              </div>
              <div class="standings-line2">${t.record}${t.manager ? ` · ${t.manager}` : ""}</div>
            </div>
          </div>

          <div class="standings-right">
            <div class="standings-pf">${t.pf}</div>
            <div class="standings-pf-label">PF</div>
          </div>
        </div>
      `;

      wrap.appendChild(card);
    });

  standingsContainer.appendChild(wrap);
}

// ------------- AUTO LOAD (on first page load) -------------

async function autoLoadEverything() {
  // Try to populate standings and scoreboard on load
  // If not signed in yet, scoreboard/standings will 401 and status will say so.
  const week = weekSelect?.value ? Number(weekSelect.value) : null;

  await loadScoreboardForWeek(week, { showJson: false, renderMatchups: true });
  await loadStandings({ showErrorToStatus: false });
}

window.addEventListener("DOMContentLoaded", autoLoadEverything);
