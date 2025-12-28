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

function toInt(v) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function safeText(el, text) {
  if (el) el.textContent = text ?? "";
}

// ------------- Auth button -------------

if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ------------- API calls -------------

async function fetchScoreboardForWeek(week) {
  // server.js currently returns current-week scoreboard only, but we keep week param
  // for future server enhancement. For now this just fetches /scoreboard.
  const res = await fetch(`${backendBase}/scoreboard`);
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
  // /standings-raw returns JSON text, but it *is* JSON
  return res.json();
}

// ------------- Button handlers -------------

if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    try {
      setStatus("Loading scoreboard JSON...");
      if (jsonOutput) jsonOutput.textContent = "Loading...";

      const data = await fetchScoreboardForWeek(getSelectedWeekOrNull());
      scoreboardData = data;

      if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);
      setStatus("Scoreboard JSON loaded successfully.");

      hydrateWeekUIFromScoreboard(data);
      renderMatchupsForCurrentSelection();

      // Also load standings (keeps them “always visible”)
      await loadAndRenderStandings();
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
    renderMatchupsForCurrentSelection();
  });
}

// ------------- Week dropdown -------------

function getSelectedWeekOrNull() {
  if (!weekSelect) return null;
  const n = toInt(weekSelect.value);
  return n;
}

function setWeekSelectOptions(startWeek, endWeek, selectedWeek) {
  if (!weekSelect) return;

  weekSelect.innerHTML = "";
  for (let w = startWeek; w <= endWeek; w++) {
    const opt = document.createElement("option");
    opt.value = String(w);
    opt.textContent = `Week ${w}`;
    if (w === selectedWeek) opt.selected = true;
    weekSelect.appendChild(opt);
  }
}

function hydrateWeekUIFromScoreboard(data) {
  try {
    const leagueArr = data?.fantasy_content?.league;
    const leagueMeta = leagueArr?.[0];
    const scoreboard = leagueArr?.[1]?.scoreboard;

    const currentWeek = toInt(leagueMeta?.current_week) ?? toInt(scoreboard?.week) ?? 1;
    const startWeek = toInt(leagueMeta?.start_week) ?? 1;
    const endWeek = toInt(leagueMeta?.end_week) ?? currentWeek;

    // Populate dropdown if empty OR if it has no options yet
    if (weekSelect && weekSelect.options.length === 0) {
      setWeekSelectOptions(startWeek, endWeek, currentWeek);
    }

    // Label beside matchups
    if (weekLabel) weekLabel.textContent = `Week ${getSelectedWeekOrNull() ?? currentWeek}`;
  } catch (e) {
    console.warn("Unable to hydrate week UI:", e);
  }
}

if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    // When week changes, refetch scoreboard (server currently returns current week only,
    // but we keep this flow so it’s correct once you add week param server-side).
    try {
      setStatus("Loading scoreboard for selected week...");
      const data = await fetchScoreboardForWeek(getSelectedWeekOrNull());
      scoreboardData = data;

      if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

      hydrateWeekUIFromScoreboard(data);
      renderMatchupsForCurrentSelection();

      setStatus("Loaded selected week.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to load selected week.");
    }
  });
}

// ------------- Matchups parsing -------------

function extractMatchupsFromScoreboard(data) {
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

        // playoff tag logic (hide for regular season)
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

function renderMatchupsForCurrentSelection() {
  if (!scoreboardData) return;

  const matchups = extractMatchupsFromScoreboard(scoreboardData);
  if (!matchups || matchups.length === 0) {
    setStatus("No matchups found for this week.");
    if (matchupsContainer) matchupsContainer.innerHTML = "";
    return;
  }

  // update week label to match dropdown selection (don’t drift)
  if (weekLabel) {
    const selected = getSelectedWeekOrNull();
    const weekFromData = toInt(matchups[0]?.week);
    weekLabel.textContent = `Week ${selected ?? weekFromData ?? "?"}`;
  }

  renderMatchupCards(matchups);
}

// ------------- Standings parsing + rendering -------------

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
        const teamRoot = teamsObj[k]?.team;
        if (!teamRoot) return;

        const meta = teamRoot[0]; // array of {name},{team_logos},... etc
        const points = teamRoot[1]?.team_points?.total;
        const standings = teamRoot[2]?.team_standings;

        const name = pluckField(meta, "name") || "Unknown";
        const logos = pluckField(meta, "team_logos");
        const logo = logos?.[0]?.team_logo?.url ?? null;

        const managers = pluckField(meta, "managers");
        const managerName = managers?.[0]?.manager?.nickname ?? "";

        const rank = standings?.rank ?? "";
        const wins = standings?.outcome_totals?.wins ?? "";
        const losses = standings?.outcome_totals?.losses ?? "";
        const record = wins !== "" && losses !== "" ? `${wins}-${losses}` : "";

        const pf = standings?.points_for ?? points ?? "";

        rows.push({
          rank: toInt(rank) ?? 999,
          rankText: String(rank ?? ""),
          name,
          logo,
          managerName,
          record,
          pf: pf !== "" ? String(pf) : "",
        });
      });

    // Yahoo sorting = rank ascending (already) but we enforce
    rows.sort((a, b) => a.rank - b.rank);
    return rows;
  } catch (e) {
    console.error("extractStandingsRows error:", e);
    return [];
  }
}

function renderStandings(rows) {
  if (!standingsContainer) return;
  standingsContainer.innerHTML = "";

  if (!rows.length) {
    standingsContainer.innerHTML = `<div class="empty-state">No standings found.</div>`;
    return;
  }

  const list = document.createElement("div");
  list.className = "standings-list-inner";

  rows.forEach((r) => {
    const row = document.createElement("div");
    row.className = "standings-row";

    row.innerHTML = `
      <div class="standings-left">
        ${
          r.logo
            ? `<img class="standings-logo" src="${r.logo}" alt="${r.name}"/>`
            : `<div class="standings-logo standings-logo--placeholder"></div>`
        }
        <div class="standings-text">
          <div class="standings-line1">
            <span class="standings-rank">#${r.rankText}</span>
            <span class="standings-team" title="${r.name}">${r.name}</span>
          </div>
          <div class="standings-line2">
            <span class="standings-record">${r.record}</span>
            ${r.managerName ? `<span class="standings-dot">·</span><span class="standings-manager">${r.managerName}</span>` : ``}
          </div>
        </div>
      </div>
      <div class="standings-right">
        <div class="standings-pf">${r.pf}</div>
        <div class="standings-pf-label">PF</div>
      </div>
    `;

    list.appendChild(row);
  });

  standingsContainer.appendChild(list);
}

async function loadAndRenderStandings() {
  try {
    setStatus("Loading standings...");
    const data = await fetchStandingsRaw();
    standingsData = data;

    const rows = extractStandingsRows(data);
    renderStandings(rows);

    setStatus("Standings loaded.");
  } catch (e) {
    console.error(e);
    setStatus("Error loading standings.");
    if (standingsContainer) standingsContainer.innerHTML = `<div class="empty-state">Error loading standings.</div>`;
  }
}

// ------------- Auto load -------------

async function autoLoadEverything() {
  try {
    setStatus("Loading scoreboard...");

    const data = await fetchScoreboardForWeek(getSelectedWeekOrNull());
    scoreboardData = data;

    if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

    hydrateWeekUIFromScoreboard(data);
    renderMatchupsForCurrentSelection();

    await loadAndRenderStandings();
  } catch (err) {
    console.error("Auto load error:", err);
    setStatus("Not authenticated. Click Sign In with Yahoo.");
  }
}

window.addEventListener("DOMContentLoaded", autoLoadEverything);
