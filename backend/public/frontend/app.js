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

// Week dropdown (if present in your HTML)
const weekSelect = document.getElementById("weekSelect");

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

function safeText(v, fallback = "") {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

// ------------- Button handlers -------------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

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
    const week = getSelectedWeekOrCurrent(scoreboardData);
    const matchups = extractMatchups(scoreboardData, week);

    if (!matchups || matchups.length === 0) {
      setStatus("No matchups found for this week.");
      if (matchupsContainer) matchupsContainer.innerHTML = "";
      return;
    }

    renderMatchupCards(matchups);
    setStatus(`Showing ${matchups.length} matchups for Week ${week}.`);
  });
}

if (weekSelect) {
  weekSelect.addEventListener("change", () => {
    if (!scoreboardData) {
      setStatus("Load the scoreboard first to change weeks.");
      return;
    }

    const week = Number(weekSelect.value);
    if (weekLabel) weekLabel.textContent = `Week ${week}`;

    const matchups = extractMatchups(scoreboardData, week);
    renderMatchupCards(matchups);
    setStatus(`Showing ${matchups.length} matchups for Week ${week}.`);
  });
}

// ------------- Fetching -------------

async function loadScoreboardAndRender() {
  try {
    setStatus("Loading scoreboard JSON...");
    if (jsonOutput) jsonOutput.textContent = "Loading...";

    const res = await fetch(`${backendBase}/scoreboard`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      if (jsonOutput) jsonOutput.textContent = `Error: ${res.status}\n${text}`;
      setStatus("Failed to load scoreboard JSON.");
      return;
    }

    const data = await res.json();
    scoreboardData = data;

    if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

    // Populate week dropdown + render matchups
    hydrateWeekUI(data);

    const week = getSelectedWeekOrCurrent(data);
    const matchups = extractMatchups(data, week);
    renderMatchupCards(matchups);
    setStatus(`Loaded ${matchups.length} matchups for Week ${week}.`);

    // Load standings (separate endpoint)
    await loadStandingsAndRender();
  } catch (err) {
    console.error("Fetch error:", err);
    if (jsonOutput) jsonOutput.textContent = "Error fetching scoreboard. See console.";
    setStatus("Error fetching scoreboard JSON.");
  }
}

async function loadStandingsAndRender() {
  if (!standingsContainer) return;

  try {
    standingsContainer.innerHTML = `<div class="standings-empty">Loading standings...</div>`;

    const res = await fetch(`${backendBase}/standings-raw`);
    if (!res.ok) {
      const txt = await res.text();
      console.error("Standings error:", res.status, txt);
      standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
      return;
    }

    const data = await res.json();
    const rows = extractStandings(data);

    if (!rows.length) {
      standingsContainer.innerHTML = `<div class="standings-empty">No standings found.</div>`;
      return;
    }

    renderStandingsUltraCompact(rows);
  } catch (err) {
    console.error("Standings fetch error:", err);
    standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
  }
}

// Auto-load when page loads (after sign in)
window.addEventListener("DOMContentLoaded", async () => {
  // Try to load immediately. If not authed, user can click Sign In.
  await loadScoreboardAndRender();
});

// ------------- Week UI -------------

function hydrateWeekUI(data) {
  try {
    const leagueArray = data?.fantasy_content?.league;
    if (!Array.isArray(leagueArray)) return;

    const leagueMeta = leagueArray[0];
    const currentWeek = Number(leagueMeta?.current_week ?? 1);
    const startWeek = Number(leagueMeta?.start_week ?? 1);
    const endWeek = Number(leagueMeta?.end_week ?? currentWeek);

    // Week pill
    if (weekLabel) weekLabel.textContent = `Week ${currentWeek}`;

    // Week dropdown
    if (weekSelect) {
      weekSelect.innerHTML = "";
      for (let w = startWeek; w <= endWeek; w++) {
        const opt = document.createElement("option");
        opt.value = String(w);
        opt.textContent = `Week ${w}`;
        if (w === currentWeek) opt.selected = true;
        weekSelect.appendChild(opt);
      }
    }
  } catch (e) {
    console.warn("Unable to populate week UI:", e);
  }
}

function getSelectedWeekOrCurrent(data) {
  if (weekSelect && weekSelect.value) return Number(weekSelect.value);

  const leagueArray = data?.fantasy_content?.league;
  const leagueMeta = Array.isArray(leagueArray) ? leagueArray[0] : null;
  return Number(leagueMeta?.current_week ?? 1);
}

// ------------- Matchups parsing -------------

function extractMatchups(data, requestedWeek) {
  try {
    const fc = data.fantasy_content;
    const leagueArray = fc.league;
    const leagueMeta = leagueArray[0];
    const scoreboard = leagueArray[1].scoreboard;

    // We only fetched "current week scoreboard" from Yahoo in /scoreboard
    // So requestedWeek must match what is in this JSON.
    const actualWeek = Number(scoreboard?.week ?? leagueMeta?.current_week ?? requestedWeek ?? 1);

    // If user chooses a different week, there won't be data in this payload.
    // We'll still show what we have (actual week).
    const weekNumber = requestedWeek ? Number(requestedWeek) : actualWeek;

    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot?.matchups;

    if (!matchupsObj) return [];

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

        // hide playoffs tag unless Yahoo says it is playoffs
        const isPlayoffs = String(matchupInner?.is_playoffs ?? "0") === "1";

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

    // IMPORTANT: this payload is for ONE week only (current). If requestedWeek differs,
    // we still return the extracted list (it will still be the same), because that's
    // all the data we have in /scoreboard right now.
    // (Later: add /scoreboard?week=XX on server.)
    return result;
  } catch (err) {
    console.error("Error extracting matchups:", err);
    return [];
  }
}

// ------------- Matchups rendering -------------

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

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">Week ${m.week ?? "?"}</span>
        ${m.isPlayoffs ? `<span class="matchup-tag">Playoffs</span>` : ``}
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

        <div class="vs-column">
          <span class="vs-pill">VS</span>
        </div>

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

// ------------- Standings parsing -------------

function extractStandings(data) {
  try {
    const leagueArr = data?.fantasy_content?.league;
    const standings = leagueArr?.[1]?.standings;
    const teamsObj = standings?.[0]?.teams;
    if (!teamsObj) return [];

    const rows = [];

    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const teamArr = teamsObj[k]?.team;
        const meta = teamArr?.[0];
        const points = teamArr?.[1]?.team_points?.total;
        const standingsObj = teamArr?.[2]?.team_standings;

        const name = pluckField(meta, "name") || "Unknown";
        const logoObj = pluckField(meta, "team_logos");
        const logo = logoObj?.[0]?.team_logo?.url ?? null;

        const managersArr = pluckField(meta, "managers");
        const mgrNick = managersArr?.[0]?.manager?.nickname ?? "";

        const rank = standingsObj?.rank ?? "";
        const wins = standingsObj?.outcome_totals?.wins ?? "";
        const losses = standingsObj?.outcome_totals?.losses ?? "";

        rows.push({
          rank: Number(rank),
          name,
          logo,
          manager: mgrNick,
          record: `${wins}-${losses}`,
          pf: points != null ? Number(points) : null,
        });
      });

    // Yahoo sorting (rank ascending)
    rows.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    return rows;
  } catch (e) {
    console.error("extractStandings error:", e);
    return [];
  }
}

// ------------- Standings rendering (ULTRA COMPACT) -------------

function renderStandingsUltraCompact(rows) {
  if (!standingsContainer) return;

  const wrapper = document.createElement("div");
  wrapper.className = "standings-compact";

  rows.forEach((r) => {
    const row = document.createElement("div");
    row.className = "standings-row";

    row.innerHTML = `
      <div class="standings-left">
        ${
          r.logo
            ? `<img class="standings-logo" src="${r.logo}" alt="${safeText(r.name)}" />`
            : `<div class="standings-logo standings-logo--placeholder"></div>`
        }
        <div class="standings-text">
          <div class="standings-topline">
            <span class="standings-rank">#${safeText(r.rank)}</span>
            <span class="standings-name" title="${safeText(r.name)}">${safeText(r.name)}</span>
          </div>
          <div class="standings-sub">
            <span class="standings-record">${safeText(r.record)}</span>
            ${r.manager ? `<span class="standings-dot">·</span><span>${safeText(r.manager)}</span>` : ""}
          </div>
        </div>
      </div>

      <div class="standings-right">
        <div class="standings-pf">${r.pf != null ? r.pf.toFixed(2) : "--"}</div>
        <div class="standings-pf-label">PF</div>
      </div>
    `;

    wrapper.appendChild(row);
  });

  standingsContainer.innerHTML = "";
  standingsContainer.appendChild(wrapper);
}
