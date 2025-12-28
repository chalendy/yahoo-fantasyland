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

// Standings
const standingsContainer = document.getElementById("standingsContainer");

let scoreboardData = null;

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

function toInt(v) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

// Determines "Quarterfinal / Semifinal / Final" based on league end_week
function getPlayoffRoundLabel({ week, leagueEndWeek }) {
  const w = toInt(week);
  const end = toInt(leagueEndWeek);
  if (w == null || end == null) return "Playoffs";

  if (w === end - 2) return "Quarterfinal";
  if (w === end - 1) return "Semifinal";
  if (w === end) return "Final";

  return "Playoffs";
}

// ------------- Button handlers -------------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    const selectedWeek = weekSelect?.value ? Number(weekSelect.value) : null;
    await loadScoreboardForWeek(selectedWeek);
  });
}

if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", () => {
    if (!scoreboardData) {
      setStatus("No scoreboard loaded yet. Click 'Load Scoreboard JSON' first.");
      return;
    }

    const parsed = parseScoreboard(scoreboardData);
    if (!parsed.matchups.length) {
      setStatus("No matchups found for this week.");
      if (matchupsContainer) matchupsContainer.innerHTML = "";
      return;
    }

    renderMatchupCards(parsed.matchups, parsed.leagueMeta);
    setStatus(`Showing ${parsed.matchups.length} matchups.`);
  });
}

// ------------- Data loading -------------

async function loadScoreboardForWeek(week) {
  try {
    setStatus("Loading scoreboard JSON...");
    if (jsonOutput) jsonOutput.textContent = "Loading...";

    const url =
      week && Number.isFinite(week)
        ? `${backendBase}/scoreboard?week=${encodeURIComponent(week)}`
        : `${backendBase}/scoreboard`;

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      if (jsonOutput) jsonOutput.textContent = `Error: ${res.status}\n${text}`;
      setStatus("Failed to load scoreboard JSON.");
      return null;
    }

    const data = await res.json();
    scoreboardData = data;

    if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

    const parsed = parseScoreboard(data);

    // Update the header week label (top right of matchups panel)
    if (weekLabel) weekLabel.textContent = `Week ${parsed.week ?? "?"}`;

    // Ensure week dropdown is populated & synced
    populateWeekDropdown(parsed.leagueMeta, parsed.week);

    // Render matchups automatically
    if (parsed.matchups.length) {
      renderMatchupCards(parsed.matchups, parsed.leagueMeta);
      setStatus(`Loaded ${parsed.matchups.length} matchups.`);
    } else {
      if (matchupsContainer) matchupsContainer.innerHTML = "";
      setStatus("No matchups found for this week.");
    }

    // Load standings automatically (if route exists)
    await loadStandings();

    return data;
  } catch (err) {
    console.error("Fetch error:", err);
    if (jsonOutput) jsonOutput.textContent = "Error fetching scoreboard. See console.";
    setStatus("Error fetching scoreboard JSON.");
    return null;
  }
}

// ------------- Week dropdown -------------

function populateWeekDropdown(leagueMeta, selectedWeek) {
  if (!weekSelect || !leagueMeta) return;

  const startWeek = toInt(leagueMeta.start_week) ?? 1;
  const endWeek = toInt(leagueMeta.end_week) ?? (toInt(leagueMeta.current_week) ?? 17);

  const current = toInt(selectedWeek) ?? toInt(leagueMeta.current_week) ?? endWeek;

  // Only rebuild if empty
  if (weekSelect.options.length === 0) {
    for (let w = startWeek; w <= endWeek; w++) {
      const opt = document.createElement("option");
      opt.value = String(w);
      opt.textContent = `Week ${w}`;
      weekSelect.appendChild(opt);
    }

    weekSelect.addEventListener("change", async () => {
      const w = Number(weekSelect.value);
      await loadScoreboardForWeek(w);
    });
  }

  weekSelect.value = String(current);
}

// ------------- Parsing scoreboard -------------

function parseScoreboard(data) {
  const fc = data?.fantasy_content;
  const leagueArray = fc?.league;

  const leagueMeta = Array.isArray(leagueArray) ? leagueArray[0] : null;
  const scoreboard = Array.isArray(leagueArray) ? leagueArray[1]?.scoreboard : null;

  const weekFromScoreboard = scoreboard?.week ?? scoreboard?.["week"];
  const week = toInt(weekFromScoreboard) ?? toInt(leagueMeta?.current_week);

  const matchups = extractMatchups(data);

  return { leagueMeta, scoreboard, week, matchups };
}

function extractMatchups(data) {
  try {
    const fc = data.fantasy_content;
    const leagueArray = fc.league;
    const leagueMeta = leagueArray[0];
    const scoreboard = leagueArray[1].scoreboard;

    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot?.matchups;
    if (!matchupsObj) return [];

    const weekNumber = scoreboard.week ?? leagueMeta.current_week;

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

        const teamALogo =
          teamALogoObj && teamALogoObj[0]?.team_logo?.url ? teamALogoObj[0].team_logo.url : null;
        const teamBLogo =
          teamBLogoObj && teamBLogoObj[0]?.team_logo?.url ? teamBLogoObj[0].team_logo.url : null;

        const teamAScore = team0Stats?.team_points?.total ?? "0.00";
        const teamBScore = team1Stats?.team_points?.total ?? "0.00";

        const teamAProj = team0Stats?.team_projected_points?.total ?? "0.00";
        const teamBProj = team1Stats?.team_projected_points?.total ?? "0.00";

        const teamAProb = team0Stats?.win_probability ?? null;
        const teamBProb = team1Stats?.win_probability ?? null;

        // Important: playoff flag is inside matchupInner (your JSON)
        const isPlayoffs = matchupInner?.is_playoffs === "1" || matchupInner?.is_playoffs === 1;

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

// ------------- Rendering matchups -------------

function renderMatchupCards(matchups, leagueMeta) {
  if (!matchupsContainer) return;
  matchupsContainer.innerHTML = "";

  const leagueEndWeek = leagueMeta?.end_week;

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const teamAProbPct =
      m.teamA.winProbability != null ? Math.round(m.teamA.winProbability * 100) : null;
    const teamBProbPct =
      m.teamB.winProbability != null ? Math.round(m.teamB.winProbability * 100) : null;

    const showPlayoffTag = !!m.isPlayoffs;
    const playoffLabel = showPlayoffTag
      ? getPlayoffRoundLabel({ week: m.week, leagueEndWeek })
      : "";

    // ✅ Removed "Week X" label INSIDE the card (requested)
    card.innerHTML = `
      <div class="matchup-header-row">
        <span></span>
        ${
          showPlayoffTag
            ? `<span class="matchup-tag">${playoffLabel}</span>`
            : ""
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

// ------------- Standings (kept simple, uses your /standings-raw route) -------------

let standingsData = null;
let standingsSort = "rank"; // default

async function loadStandings() {
  if (!standingsContainer) return;

  try {
    const res = await fetch(`${backendBase}/standings-raw`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Standings error:", res.status, text);
      standingsContainer.innerHTML = `<div style="color: rgba(255,255,255,0.7); font-size: 0.85rem;">Error loading standings.</div>`;
      return;
    }

    const data = await res.json();
    standingsData = data;

    const teams = extractStandingsTeams(data);
    renderStandings(teams);
  } catch (err) {
    console.error("Standings fetch error:", err);
    standingsContainer.innerHTML = `<div style="color: rgba(255,255,255,0.7); font-size: 0.85rem;">Error loading standings.</div>`;
  }
}

function extractStandingsTeams(data) {
  try {
    const leagueArray = data?.fantasy_content?.league;
    const standingsObj = leagueArray?.[1]?.standings?.[0]?.teams;

    if (!standingsObj) return [];

    const teams = [];
    Object.keys(standingsObj)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const teamArr = standingsObj[k]?.team;
        if (!teamArr) return;

        const meta = teamArr[0];
        const pointsObj = teamArr[1];
        const standings = teamArr[2]?.team_standings;

        const name = pluckField(meta, "name") || "Unknown Team";
        const logos = pluckField(meta, "team_logos");
        const logo = logos?.[0]?.team_logo?.url || null;

        const managersObj = pluckField(meta, "managers");
        const managerName = managersObj?.[0]?.manager?.nickname || "";

        const rank = standings?.rank ? Number(standings.rank) : null;
        const wins = standings?.outcome_totals?.wins ?? "";
        const losses = standings?.outcome_totals?.losses ?? "";
        const pf = standings?.points_for ?? pointsObj?.team_points?.total ?? "";

        teams.push({
          rank,
          name,
          logo,
          managerName,
          record: `${wins}-${losses}`,
          pf: pf ? Number(pf) : null,
        });
      });

    return teams;
  } catch (e) {
    console.error("extractStandingsTeams error:", e);
    return [];
  }
}

function sortStandings(teams) {
  const copy = [...teams];

  if (standingsSort === "pf") {
    copy.sort((a, b) => (b.pf ?? -Infinity) - (a.pf ?? -Infinity));
    return copy;
  }

  // default: rank
  copy.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  return copy;
}

function renderStandings(teams) {
  if (!standingsContainer) return;

  const sorted = sortStandings(teams);

  standingsContainer.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;">
      <div style="font-size:0.78rem; color: rgba(255,255,255,0.7);">Sort</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button data-sort="rank" class="btn btn-secondary" style="padding:6px 12px; font-size:0.78rem;">Yahoo (Rank)</button>
        <button data-sort="pf" class="btn btn-secondary" style="padding:6px 12px; font-size:0.78rem;">Points For</button>
      </div>
    </div>

    <div style="display:flex; flex-direction:column; gap:8px;">
      ${sorted.map(renderStandingsRow).join("")}
    </div>
  `;

  standingsContainer.querySelectorAll("button[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      standingsSort = btn.getAttribute("data-sort") || "rank";
      renderStandings(teams);
    });
  });
}

function renderStandingsRow(t) {
  const safeName = escapeHtml(t.name);
  const safeMgr = escapeHtml(t.managerName);

  return `
    <div class="matchup-card" style="padding:10px 12px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
          ${
            t.logo
              ? `<img src="${t.logo}" alt="${safeName}" style="width:34px;height:34px;border-radius:999px;object-fit:cover;border:1px solid rgba(255,255,255,0.18);background:rgba(0,0,0,0.35);">`
              : `<div class="team-logo placeholder-logo" style="width:34px;height:34px;">•</div>`
          }
          <div style="min-width:0;">
            <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
              <div style="font-weight:700; opacity:0.9;">#${t.rank ?? "-"}</div>
              <div style="font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 260px;">
                ${safeName}
              </div>
            </div>
            <div style="font-size:0.74rem; color: rgba(255,255,255,0.65);">
              ${escapeHtml(t.record)} · ${safeMgr}
            </div>
          </div>
        </div>

        <div style="text-align:right;">
          <div style="font-weight:800; font-size:0.98rem;">${t.pf != null ? t.pf.toFixed(2) : "--"}</div>
          <div style="font-size:0.72rem; color: rgba(255,255,255,0.6);">PF</div>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ----- AUTO LOAD SCOREBOARD + MATCHUPS + STANDINGS -----

async function autoLoadEverything() {
  // Try to load the current week scoreboard first.
  // If not authenticated, the status will tell user to sign in.
  await loadScoreboardForWeek(null);
}

window.addEventListener("DOMContentLoaded", autoLoadEverything);
