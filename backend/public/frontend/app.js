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

function getLeagueMetaFromScoreboard(data) {
  const leagueArr = data?.fantasy_content?.league;
  return Array.isArray(leagueArr) ? leagueArr[0] : null;
}

function getScoreboardRoot(data) {
  const leagueArr = data?.fantasy_content?.league;
  return leagueArr?.[1]?.scoreboard ?? null;
}

// ------------- Auth -------------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ------------- Week dropdown population -------------

function buildWeekOptions(leagueMeta) {
  if (!weekSelect || !leagueMeta) return;

  const startWeek = Number(leagueMeta.start_week ?? 1);
  const endWeek = Number(leagueMeta.end_week ?? leagueMeta.current_week ?? 17);
  const currentWeek = Number(leagueMeta.current_week ?? endWeek);

  weekSelect.innerHTML = "";

  for (let w = startWeek; w <= endWeek; w++) {
    const opt = document.createElement("option");
    opt.value = String(w);
    opt.textContent = `Week ${w}`;
    if (w === currentWeek) opt.selected = true;
    weekSelect.appendChild(opt);
  }
}

// ------------- Fetch functions -------------

async function fetchScoreboardForWeek(week) {
  const url = week ? `${backendBase}/scoreboard?week=${encodeURIComponent(week)}` : `${backendBase}/scoreboard`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Scoreboard error ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchStandings() {
  const res = await fetch(`${backendBase}/standings-raw`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Standings error ${res.status}: ${text}`);
  }
  return res.json();
}

// ------------- Button handlers -------------

if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    try {
      setStatus("Loading scoreboard JSON...");
      if (jsonOutput) jsonOutput.textContent = "Loading...";

      const selectedWeek = weekSelect?.value || null;
      const data = await fetchScoreboardForWeek(selectedWeek);

      scoreboardData = data;
      if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

      const leagueMeta = getLeagueMetaFromScoreboard(data);
      if (leagueMeta) {
        buildWeekOptions(leagueMeta);

        // Prefer selected week if user chose it; otherwise show current week
        const scoreboard = getScoreboardRoot(data);
        const displayedWeek = selectedWeek || scoreboard?.week || leagueMeta.current_week;
        if (weekLabel && displayedWeek) weekLabel.textContent = `Week ${displayedWeek}`;
      }

      // Render matchups automatically after loading JSON
      const matchups = extractMatchups(data);
      if (!matchups || matchups.length === 0) {
        setStatus("Scoreboard JSON loaded, but no matchups found.");
        if (matchupsContainer) matchupsContainer.innerHTML = "";
      } else {
        renderMatchupCards(matchups);
        setStatus(`Loaded ${matchups.length} matchups.`);
      }
    } catch (err) {
      console.error(err);
      if (jsonOutput) jsonOutput.textContent = String(err);
      setStatus("Failed to load scoreboard JSON.");
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
    setStatus(`Showing ${matchups.length} matchups.`);
  });
}

// Week selector: change week -> fetch scoreboard for that week -> render matchups
if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    try {
      const week = weekSelect.value;
      setStatus(`Loading Week ${week}...`);

      const data = await fetchScoreboardForWeek(week);
      scoreboardData = data;

      if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

      if (weekLabel) weekLabel.textContent = `Week ${week}`;

      const matchups = extractMatchups(data);
      if (!matchups || matchups.length === 0) {
        setStatus(`No matchups found for Week ${week}.`);
        if (matchupsContainer) matchupsContainer.innerHTML = "";
        return;
      }

      renderMatchupCards(matchups);
      setStatus(`Showing ${matchups.length} matchups for Week ${week}.`);
    } catch (err) {
      console.error(err);
      setStatus("Failed to load selected week.");
    }
  });
}

// ------------- Data parsing -------------

function extractMatchups(data) {
  try {
    const fc = data.fantasy_content;
    const leagueArray = fc.league;
    const leagueMeta = leagueArray[0];
    const scoreboard = leagueArray[1].scoreboard;

    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot.matchups;
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

        const teamALogo = teamALogoObj?.[0]?.team_logo?.url ?? null;
        const teamBLogo = teamBLogoObj?.[0]?.team_logo?.url ?? null;

        const teamAScore = team0Stats?.team_points?.total ?? "0.00";
        const teamBScore = team1Stats?.team_points?.total ?? "0.00";

        const teamAProj = team0Stats?.team_projected_points?.total ?? "0.00";
        const teamBProj = team1Stats?.team_projected_points?.total ?? "0.00";

        const teamAProb = team0Stats?.win_probability ?? null;
        const teamBProb = team1Stats?.win_probability ?? null;

        const isPlayoffs = matchupInner?.is_playoffs === "1";

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

// ------------- Rendering -------------

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

    const tagHTML = m.isPlayoffs
      ? `<span class="matchup-tag">Playoffs</span>`
      : ``;

    // ✅ Week label REMOVED from inside the card
    card.innerHTML = `
      <div class="matchup-header-row">
        <span></span>
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

// ------------- Standings (simple render + auto-load) -------------

function extractStandingsRows(data) {
  try {
    const leagueArr = data?.fantasy_content?.league;
    const standingsArr = leagueArr?.[1]?.standings;
    const teamsObj = standingsArr?.[0]?.teams;

    if (!teamsObj) return [];

    const rows = [];
    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const teamArr = teamsObj[k]?.team;
        const meta = teamArr?.[0];
        const points = teamArr?.[1]?.team_points?.total ?? "";
        const st = teamArr?.[2]?.team_standings;

        const name = pluckField(meta, "name") || "Unknown";
        const logos = pluckField(meta, "team_logos");
        const logo = logos?.[0]?.team_logo?.url ?? null;

        const managers = pluckField(meta, "managers");
        const managerName = managers?.[0]?.manager?.nickname ?? "";

        const rank = st?.rank ?? "";
        const wins = st?.outcome_totals?.wins ?? "";
        const losses = st?.outcome_totals?.losses ?? "";

        rows.push({
          rank: Number(rank) || 999,
          name,
          logo,
          managerName,
          record: wins && losses ? `${wins}-${losses}` : "",
          pointsFor: points,
        });
      });

    rows.sort((a, b) => a.rank - b.rank);
    return rows;
  } catch (e) {
    console.error("extractStandingsRows error:", e);
    return [];
  }
}

function renderStandings(rows) {
  if (!standingsContainer) return;

  if (!rows || rows.length === 0) {
    standingsContainer.innerHTML = `<div class="standings-empty">No standings data.</div>`;
    return;
  }

  standingsContainer.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:8px;">
      ${rows
        .map(
          (r) => `
        <div class="matchup-card" style="padding:10px 10px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div style="display:flex; align-items:center; gap:10px; min-width:0;">
              ${
                r.logo
                  ? `<img src="${r.logo}" alt="${r.name}" style="width:34px;height:34px;border-radius:999px;object-fit:cover;border:1px solid rgba(255,255,255,0.18);background:rgba(0,0,0,0.35);">`
                  : `<div class="team-logo placeholder-logo" style="width:34px;height:34px;">?</div>`
              }
              <div style="min-width:0;">
                <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                  <div style="font-weight:700; opacity:0.9;">#${r.rank}</div>
                  <div style="font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 220px;">
                    ${r.name}
                  </div>
                </div>
                <div style="font-size:0.76rem; color: rgba(255,255,255,0.65);">
                  ${r.record}${r.managerName ? ` · ${r.managerName}` : ""}
                </div>
              </div>
            </div>

            <div style="text-align:right;">
              <div style="font-weight:800; font-size:0.95rem;">${r.pointsFor}</div>
              <div style="font-size:0.7rem; color: rgba(255,255,255,0.6);">PF</div>
            </div>
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

async function autoLoadStandings() {
  try {
    const data = await fetchStandings();
    standingsData = data;
    const rows = extractStandingsRows(data);
    renderStandings(rows);
  } catch (err) {
    console.error(err);
    if (standingsContainer) standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
  }
}

// ----- AUTO LOAD SCOREBOARD + MATCHUPS -----

async function autoLoadEverything() {
  try {
    setStatus("Loading scoreboard...");

    // Try load current (server will return current week if week is not provided)
    const data = await fetchScoreboardForWeek(null);
    scoreboardData = data;

    if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

    const leagueMeta = getLeagueMetaFromScoreboard(data);
    const scoreboard = getScoreboardRoot(data);

    if (leagueMeta) {
      buildWeekOptions(leagueMeta);

      // Set label to server-returned week (scoreboard.week) if present, otherwise current_week
      const shownWeek = scoreboard?.week ?? leagueMeta.current_week;
      if (weekLabel && shownWeek) weekLabel.textContent = `Week ${shownWeek}`;

      // Keep dropdown synced with shownWeek (fixes “week 1 matchups but dropdown says week 15”)
      if (weekSelect && shownWeek != null) {
        weekSelect.value = String(shownWeek);
      }
    }

    const matchups = extractMatchups(data);
    if (!matchups || matchups.length === 0) {
      setStatus("No matchups found for this week.");
      if (matchupsContainer) matchupsContainer.innerHTML = "";
    } else {
      renderMatchupCards(matchups);
      setStatus(`Loaded ${matchups.length} matchups.`);
    }
  } catch (err) {
    console.error("Auto load error:", err);
    setStatus("Not authenticated. Click Sign In with Yahoo.");
  }
}

// Auto-start everything once the page finishes loading
window.addEventListener("DOMContentLoaded", () => {
  autoLoadEverything();
  autoLoadStandings();
});
