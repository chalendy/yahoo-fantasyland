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

// Optional week dropdown (if present in your HTML)
const weekSelect = document.getElementById("weekSelect");

// Standings area (Option A: Always visible). If your HTML uses a different id, rename here.
const standingsContainer = document.getElementById("standingsContainer");
const standingsStatus = document.getElementById("standingsStatus"); // optional small status line

let scoreboardData = null;
let standingsData = null;

// ---------------- Helpers ----------------

function setStatus(msg) {
  if (statusMessage) statusMessage.textContent = msg;
}

function setStandingsStatus(msg) {
  if (standingsStatus) standingsStatus.textContent = msg;
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

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function formatRecord(outcomeTotals) {
  if (!outcomeTotals) return "";
  const w = outcomeTotals.wins ?? "?";
  const l = outcomeTotals.losses ?? "?";
  const t = outcomeTotals.ties ?? 0;
  return t && String(t) !== "0" ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function formatPoints(x) {
  const n = safeNum(x);
  if (n == null) return x ?? "";
  return n.toFixed(2);
}

// ---------------- Buttons ----------------

// Sign in with Yahoo
if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// Load raw scoreboard JSON
if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    await loadScoreboardAndRender();
  });
}

// Render this week's matchups
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

// Week dropdown (if you have it). This assumes your backend supports week switching.
// If your server currently ignores week, this will still keep visuals stable.
if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    const chosen = weekSelect.value;
    if (!chosen) return;
    await loadScoreboardAndRender({ week: chosen });
  });
}

// ---------------- Scoreboard loading ----------------

async function loadScoreboardAndRender({ week } = {}) {
  try {
    setStatus("Loading scoreboard JSON...");

    // If your server supports week switching, it will read ?week=
    const url = week ? `${backendBase}/scoreboard?week=${encodeURIComponent(week)}` : `${backendBase}/scoreboard`;

    if (jsonOutput) jsonOutput.textContent = "Loading...";

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      if (jsonOutput) jsonOutput.textContent = `Error: ${res.status}\n${text}`;
      setStatus(res.status === 401 ? "Not authenticated. Click 'Sign In with Yahoo' first." : "Failed to load scoreboard JSON.");
      return;
    }

    const data = await res.json();
    scoreboardData = data;

    if (jsonOutput) {
      jsonOutput.textContent = JSON.stringify(data, null, 2);
    }

    // Update week label + dropdown options
    syncWeekUIFromScoreboard(data, { preferWeek: week });

    // Render matchups automatically (keeps your existing behavior)
    const matchups = extractMatchups(data);
    if (!matchups || matchups.length === 0) {
      setStatus("No matchups found for this week.");
      if (matchupsContainer) matchupsContainer.innerHTML = "";
      return;
    }

    renderMatchupCards(matchups);
    setStatus(`Loaded ${matchups.length} matchups.`);
  } catch (err) {
    console.error("Fetch error:", err);
    if (jsonOutput) jsonOutput.textContent = "Error fetching scoreboard. See console.";
    setStatus("Error fetching scoreboard JSON.");
  }
}

function syncWeekUIFromScoreboard(data, { preferWeek } = {}) {
  try {
    const leagueArray = data?.fantasy_content?.league;
    if (!Array.isArray(leagueArray)) return;

    const leagueMeta = leagueArray[0];
    const scoreboard = leagueArray[1]?.scoreboard;

    const currentWeek = scoreboard?.week ?? leagueMeta?.current_week;
    const startWeek = safeNum(leagueMeta?.start_week) ?? 1;
    const endWeek = safeNum(leagueMeta?.end_week) ?? safeNum(leagueMeta?.current_week) ?? currentWeek ?? 17;

    const activeWeek = preferWeek ?? currentWeek;

    if (weekLabel && activeWeek != null) {
      weekLabel.textContent = `Week ${activeWeek}`;
    }

    if (weekSelect) {
      // Populate only once OR repopulate if empty
      if (weekSelect.options.length === 0) {
        for (let w = startWeek; w <= endWeek; w++) {
          const opt = document.createElement("option");
          opt.value = String(w);
          opt.textContent = `Week ${w}`;
          weekSelect.appendChild(opt);
        }
      }

      // Set the selected week to the active one (not always current week)
      if (activeWeek != null) {
        weekSelect.value = String(activeWeek);
      }
    }
  } catch (e) {
    console.warn("Unable to sync week UI from JSON:", e);
  }
}

// ---------------- Matchups parsing + rendering ----------------

function extractMatchups(data) {
  try {
    const fc = data.fantasy_content;
    const leagueArray = fc.league;
    const leagueMeta = leagueArray[0];
    const scoreboard = leagueArray[1].scoreboard;

    // Example: scoreboard["0"].matchups
    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot.matchups;
    const weekNumber = scoreboard.week ?? leagueMeta.current_week;

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchupWrapper = matchupsObj[key];
        const matchup = matchupWrapper.matchup;
        const matchupInner = matchup["0"]; // the one containing "teams"
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

        // Playoffs tag only when matchupInner says it is playoffs
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

    // Hide the tag if NOT playoffs (your request)
    const tagHtml = m.isPlayoffs ? `<span class="matchup-tag">Playoffs</span>` : ``;

    card.innerHTML = `
      <div class="matchup-header-row">
        <span class="matchup-week-label">WEEK ${m.week ?? "?"}</span>
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

// ---------------- Standings (Option A: Always visible) ----------------

async function loadStandings() {
  if (!standingsContainer) return;

  try {
    setStandingsStatus("Loading standings...");

    const res = await fetch(`${backendBase}/standings-raw`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Standings error:", res.status, text);
      setStandingsStatus(res.status === 401 ? "Sign in to load standings." : "Error loading standings.");
      standingsContainer.innerHTML = "";
      return;
    }

    const text = await res.text();
    const data = JSON.parse(text);
    standingsData = data;

    const teams = extractStandingsTeams(data);
    if (!teams.length) {
      setStandingsStatus("No standings found.");
      standingsContainer.innerHTML = "";
      return;
    }

    renderStandings(teams);
    setStandingsStatus("Live");
  } catch (err) {
    console.error("Standings fetch error:", err);
    setStandingsStatus("Error loading standings.");
    if (standingsContainer) standingsContainer.innerHTML = "";
  }
}

function extractStandingsTeams(data) {
  try {
    const league = data?.fantasy_content?.league;
    const standingsBlock = league?.[1]?.standings?.[0];
    const teamsObj = standingsBlock?.teams;
    if (!teamsObj) return [];

    const teams = [];

    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const teamArr = teamsObj[k]?.team;
        if (!Array.isArray(teamArr)) return;

        const meta = teamArr[0]; // array of objects
        const points = teamArr[1]?.team_points?.total;
        const standings = teamArr[2]?.team_standings;

        const name = pluckField(meta, "name") || "Unknown";
        const logos = pluckField(meta, "team_logos");
        const logoUrl = logos?.[0]?.team_logo?.url ?? null;

        const managers = pluckField(meta, "managers");
        const managerNickname = managers?.[0]?.manager?.nickname ?? "";

        const rank = standings?.rank ?? "";
        const record = formatRecord(standings?.outcome_totals);
        const pf = standings?.points_for ?? points ?? "";

        teams.push({
          rank: safeNum(rank) ?? 999,
          name,
          managerNickname,
          record,
          pointsFor: pf,
          logoUrl,
        });
      });

    // Yahoo sorting (rank ascending)
    teams.sort((a, b) => a.rank - b.rank);

    return teams;
  } catch (e) {
    console.error("extractStandingsTeams failed:", e);
    return [];
  }
}

function renderStandings(teams) {
  if (!standingsContainer) return;

  // Keep it simple: rows, not big “image cards”
  standingsContainer.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${teams
        .map((t) => {
          const logo = t.logoUrl
            ? `<img src="${t.logoUrl}" alt="${t.name}" style="width:40px;height:40px;border-radius:999px;object-fit:cover;border:1px solid rgba(255,255,255,0.18);background:rgba(0,0,0,0.35);" />`
            : `<div style="width:40px;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.7);background:rgba(0,0,0,0.25);">?</div>`;

          const manager = t.managerNickname ? ` · ${t.managerNickname}` : "";
          const pf = t.pointsFor !== "" ? formatPoints(t.pointsFor) : "";

          return `
            <div class="matchup-card" style="padding:12px 12px;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                  ${logo}
                  <div style="min-width:0;">
                    <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                      <div style="font-weight:700; opacity:0.9;">#${t.rank}</div>
                      <div style="font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 320px;">
                        ${t.name}
                      </div>
                    </div>
                    <div style="font-size:0.78rem; color: rgba(255,255,255,0.65);">
                      ${t.record}${manager}
                    </div>
                  </div>
                </div>

                <div style="text-align:right;">
                  <div style="font-weight:800; font-size:1.05rem;">${pf}</div>
                  <div style="font-size:0.75rem; color: rgba(255,255,255,0.6);">PF</div>
                </div>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

// ---------------- Auto load ----------------

async function autoLoadEverything() {
  // Always attempt standings (Option A: Always visible)
  loadStandings();

  // Try scoreboard + matchups automatically.
  // If not authenticated yet, the server returns 401 and we show a nice message.
  await loadScoreboardAndRender();
}

// Auto-start once the page finishes loading
window.addEventListener("DOMContentLoaded", autoLoadEverything);
