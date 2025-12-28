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
const weekSelect = document.getElementById("weekSelect"); // if you have it

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

// ------------- Auth -------------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ------------- Scoreboard JSON button -------------

if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    await loadScoreboardAndRender();
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

// ------------- Standings -------------

async function loadStandings() {
  if (!standingsContainer) return;

  try {
    standingsContainer.innerHTML = `<div class="standings-empty">Loading standings...</div>`;

    const res = await fetch(`${backendBase}/standings-raw`);
    if (!res.ok) {
      const t = await res.text();
      console.error("Standings error:", res.status, t);
      standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
      return;
    }

    const raw = await res.text();
    const data = JSON.parse(raw);

    const rows = extractStandingsRows(data);
    if (!rows.length) {
      standingsContainer.innerHTML = `<div class="standings-empty">No standings found.</div>`;
      return;
    }

    renderStandings(rows);
  } catch (e) {
    console.error("Standings load exception:", e);
    standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
  }
}

function extractStandingsRows(data) {
  try {
    const leagueArr = data?.fantasy_content?.league;
    const standingsBlock = leagueArr?.[1]?.standings?.[0];
    const teamsObj = standingsBlock?.teams;

    if (!teamsObj) return [];

    const rows = [];
    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const teamArr = teamsObj[k]?.team;
        if (!Array.isArray(teamArr)) return;

        const meta = teamArr[0];
        const pointsSeason = teamArr[1]?.team_points?.total ?? "";
        const st = teamArr[2]?.team_standings;

        const rank = st?.rank ?? "";
        const wins = st?.outcome_totals?.wins ?? "";
        const losses = st?.outcome_totals?.losses ?? "";
        const manager =
          meta?.find?.((x) => x?.managers)?.managers?.[0]?.manager?.nickname ||
          meta?.find?.((x) => x?.managers)?.managers?.[0]?.manager?.guid ||
          "";

        const name = pluckField(meta, "name") || "Unknown Team";
        const logos = pluckField(meta, "team_logos");
        const logo = logos?.[0]?.team_logo?.url || "";

        rows.push({
          rank: Number(rank) || 999,
          name,
          logo,
          record: wins && losses ? `${wins}-${losses}` : "",
          manager,
          pointsFor: pointsSeason || st?.points_for || "",
        });
      });

    // Yahoo sorting = rank
    rows.sort((a, b) => a.rank - b.rank);
    return rows;
  } catch (e) {
    console.error("extractStandingsRows error:", e);
    return [];
  }
}

function renderStandings(rows) {
  if (!standingsContainer) return;

  // IMPORTANT: no inline styles — all styling controlled by CSS classes
  standingsContainer.innerHTML = `
    <div class="standings-grid">
      ${rows
        .map((r) => {
          const safeName = escapeHtml(r.name);
          const safeManager = escapeHtml(r.manager || "");
          return `
            <div class="standings-card">
              <div class="standings-left">
                <img class="standings-logo" src="${r.logo}" alt="${safeName}" />
                <div class="standings-text">
                  <div class="standings-topline">
                    <span class="standings-rank">#${r.rank}</span>
                    <span class="standings-team" title="${safeName}">${safeName}</span>
                  </div>
                  <div class="standings-subline">
                    <span class="standings-record">${r.record}</span>
                    ${safeManager ? `<span class="standings-dot">·</span><span class="standings-manager">${safeManager}</span>` : ""}
                  </div>
                </div>
              </div>

              <div class="standings-right">
                <div class="standings-pf">${Number(r.pointsFor).toFixed ? Number(r.pointsFor).toFixed(2) : r.pointsFor}</div>
                <div class="standings-pf-label">PF</div>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ------------- Existing matchups code (unchanged) -------------

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

        const teamALogo = teamALogoObj?.[0]?.team_logo?.url || null;
        const teamBLogo = teamBLogoObj?.[0]?.team_logo?.url || null;

        const teamAScore = team0Stats?.team_points?.total ?? "0.00";
        const teamBScore = team1Stats?.team_points?.total ?? "0.00";

        const teamAProj = team0Stats?.team_projected_points?.total ?? "0.00";
        const teamBProj = team1Stats?.team_projected_points?.total ?? "0.00";

        const teamAProb = team0Stats?.win_probability ?? null;
        const teamBProb = team1Stats?.win_probability ?? null;

        result.push({
          week: weekNumber,
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

function renderMatchupCards(matchups) {
  if (!matchupsContainer) return;
  matchupsContainer.innerHTML = "";

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const teamAProbPct = m.teamA.winProbability != null ? Math.round(m.teamA.winProbability * 100) : null;
    const teamBProbPct = m.teamB.winProbability != null ? Math.round(m.teamB.winProbability * 100) : null;

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">Week ${m.week ?? "?"}</span>
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
              <div class="team-metadata">Proj: ${m.teamA.projected}${teamAProbPct != null ? ` · Win%: ${teamAProbPct}%` : ""}</div>
            </div>
          </div>
          <div class="team-score">${m.teamA.score}</div>
        </div>

        <div class="vs-column"><span class="vs-pill">VS</span></div>

        <div class="team-column">
          <div class="team-info team-info-right">
            <div>
              <div class="team-name">${m.teamB.name}</div>
              <div class="team-metadata">Proj: ${m.teamB.projected}${teamBProbPct != null ? ` · Win%: ${teamBProbPct}%` : ""}</div>
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

// ----- AUTO LOAD SCOREBOARD + MATCHUPS + STANDINGS -----

async function loadScoreboardAndRender() {
  try {
    setStatus("Loading scoreboard...");

    const res = await fetch(`${backendBase}/scoreboard`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      if (jsonOutput) jsonOutput.textContent = `Error: ${res.status}\n${text}`;
      setStatus("Failed to load scoreboard.");
      return;
    }

    const data = await res.json();
    scoreboardData = data;

    if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

    // Populate week label / dropdown if present
    try {
      const leagueArr = data?.fantasy_content?.league;
      const leagueMeta = leagueArr?.[0];
      const scoreboard = leagueArr?.[1]?.scoreboard;
      const currentWeek = scoreboard?.week ?? leagueMeta?.current_week;

      if (weekLabel && currentWeek != null) weekLabel.textContent = `Week ${currentWeek}`;

      if (weekSelect && leagueMeta?.start_week && leagueMeta?.end_week) {
        const start = Number(leagueMeta.start_week);
        const end = Number(leagueMeta.end_week);
        weekSelect.innerHTML = "";
        for (let w = start; w <= end; w++) {
          const opt = document.createElement("option");
          opt.value = String(w);
          opt.textContent = `Week ${w}`;
          if (String(w) === String(currentWeek)) opt.selected = true;
          weekSelect.appendChild(opt);
        }
      }
    } catch (e) {
      console.warn("Unable to set week UI:", e);
    }

    const matchups = extractMatchups(data);
    if (matchups?.length) renderMatchupCards(matchups);

    setStatus(`Loaded ${matchups?.length ?? 0} matchups.`);
  } catch (err) {
    console.error("Load error:", err);
    setStatus("Error loading scoreboard.");
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  await loadScoreboardAndRender();
  await loadStandings();
});
