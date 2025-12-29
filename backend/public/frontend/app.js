// Same-origin backend
const backendBase = "";

// ---------- Elements ----------
const authBtn = document.getElementById("authBtn");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");

const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");
const standingsContainer = document.getElementById("standingsContainer");

const statusMessage = document.getElementById("statusMessage");
const weekLabel = document.getElementById("weekLabel");
const weekSelect = document.getElementById("weekSelect");

// ---------- State ----------
let scoreboardData = null;
let standingsData = null;

// Standings sorting state
let standingsRows = []; // normalized rows
let standingsSortMode = "yahoo"; // yahoo | rank | record | pf
let standingsSortDir = "asc"; // asc | desc

// Playoff inference: team_id -> hasPlayoffSeed
let playoffSeedTeamIds = new Set();

// ---------- Helpers ----------
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

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- OAuth ----------
if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// ---------- Week Dropdown ----------
function buildWeekOptions({ startWeek, endWeek, selectedWeek }) {
  if (!weekSelect) return;

  weekSelect.innerHTML = "";

  const s = toNum(startWeek, 1);
  const e = toNum(endWeek, s);

  for (let w = s; w <= e; w++) {
    const opt = document.createElement("option");
    opt.value = String(w);
    opt.textContent = `Week ${w}`;
    if (String(w) === String(selectedWeek)) opt.selected = true;
    weekSelect.appendChild(opt);
  }
}

function setWeekSelectValue(week) {
  if (!weekSelect) return;
  const target = String(week);
  const opt = [...weekSelect.options].find((o) => o.value === target);
  if (opt) weekSelect.value = target;
}

function getSelectedWeekOrNull() {
  if (!weekSelect) return null;
  const v = weekSelect.value;
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------- Buttons ----------
if (loadJsonBtn) {
  loadJsonBtn.addEventListener("click", async () => {
    const week = getSelectedWeekOrNull();
    await loadScoreboardForWeek(week, { renderMatchups: false });
  });
}

if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", async () => {
    const week = getSelectedWeekOrNull();
    await loadScoreboardForWeek(week, { renderMatchups: true });
  });
}

if (weekSelect) {
  weekSelect.addEventListener("change", async () => {
    const week = getSelectedWeekOrNull();
    await loadScoreboardForWeek(week, { renderMatchups: true });
  });
}

// ---------- API Loads ----------
async function loadScoreboardForWeek(week, { renderMatchups } = { renderMatchups: true }) {
  try {
    const url = week
      ? `${backendBase}/scoreboard?week=${encodeURIComponent(week)}`
      : `${backendBase}/scoreboard`;

    setStatus(week ? `Loading scoreboard (week ${week})...` : "Loading scoreboard...");
    if (jsonOutput) jsonOutput.textContent = "Loading...";

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);

      if (jsonOutput) jsonOutput.textContent = `Error: ${res.status}\n${text}`;

      if (res.status === 401) {
        setStatus("Not authenticated. Click “Sign In with Yahoo” first.");
      } else {
        setStatus("Failed to load scoreboard.");
      }

      if (matchupsContainer) matchupsContainer.innerHTML = "";
      return;
    }

    const data = await res.json();
    scoreboardData = data;

    if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

    const meta = getLeagueMetaFromScoreboard(data);
    const shownWeek = getScoreboardWeek(data) ?? meta.current_week ?? week;

    // Week label
    if (weekLabel && shownWeek != null) weekLabel.textContent = `Week ${shownWeek}`;

    // Dropdown: build once then keep changing value
    if (weekSelect && weekSelect.options.length === 0) {
      buildWeekOptions({
        startWeek: meta.start_week,
        endWeek: meta.end_week,
        selectedWeek: shownWeek,
      });
    } else if (weekSelect && shownWeek != null) {
      setWeekSelectValue(shownWeek);
    }

    // Render matchups
    if (renderMatchups) {
      const matchups = extractMatchups(data);
      if (!matchups.length) {
        setStatus("No matchups found for this week.");
        if (matchupsContainer) matchupsContainer.innerHTML = "";
      } else {
        renderMatchupsWithPlayoffSections(matchups);
        setStatus(`Loaded ${matchups.length} matchups.`);
      }
    } else {
      setStatus("Scoreboard JSON loaded.");
    }
  } catch (err) {
    console.error("Scoreboard fetch error:", err);
    setStatus("Error loading scoreboard.");
    if (matchupsContainer) matchupsContainer.innerHTML = "";
  }
}

async function loadStandings() {
  if (!standingsContainer) return;

  try {
    standingsContainer.innerHTML = `<div class="standings-empty">Loading standings…</div>`;

    const res = await fetch(`${backendBase}/standings-raw`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Standings error:", res.status, text);

      standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
      return;
    }

    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.error("Standings JSON parse error:", e);
      standingsContainer.innerHTML = `<div class="standings-empty">Error parsing standings.</div>`;
      return;
    }

    standingsData = data;
    standingsRows = extractStandingsRows(data);

    // Build playoff seed set for playoff/consolation inference
    playoffSeedTeamIds = new Set(
      standingsRows
        .filter((r) => r.playoffSeed != null && r.playoffSeed !== "")
        .map((r) => String(r.teamId))
    );

    renderStandingsSection();
  } catch (err) {
    console.error("Standings fetch error:", err);
    standingsContainer.innerHTML = `<div class="standings-empty">Error loading standings.</div>`;
  }
}

// ---------- Scoreboard Parsing ----------
function getLeagueMetaFromScoreboard(data) {
  const leagueArr = data?.fantasy_content?.league;
  const meta = Array.isArray(leagueArr) ? leagueArr[0] : {};
  return meta || {};
}

function getScoreboardWeek(data) {
  const leagueArr = data?.fantasy_content?.league;
  const scoreboard = Array.isArray(leagueArr) ? leagueArr[1]?.scoreboard : null;
  // often scoreboard.week exists even when requesting a week; sometimes not
  return scoreboard?.week ?? scoreboard?.["0"]?.week ?? null;
}

function extractMatchups(data) {
  try {
    const leagueArray = data?.fantasy_content?.league;
    if (!Array.isArray(leagueArray)) return [];

    const leagueMeta = leagueArray[0] || {};
    const scoreboard = leagueArray[1]?.scoreboard;
    if (!scoreboard) return [];

    const scoreboardRoot = scoreboard["0"];
    const matchupsObj = scoreboardRoot?.matchups;
    if (!matchupsObj) return [];

    const weekNumber = scoreboard?.week ?? scoreboardRoot?.week ?? leagueMeta.current_week;

    const result = [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((key) => {
        const matchupWrapper = matchupsObj[key];
        const matchup = matchupWrapper?.matchup;
        const matchupInner = matchup?.["0"];
        const teamsObj = matchupInner?.teams;
        if (!teamsObj) return;

        const team0 = teamsObj["0"]?.team;
        const team1 = teamsObj["1"]?.team;
        if (!team0 || !team1) return;

        const team0Meta = team0[0];
        const team0Stats = team0[1];
        const team1Meta = team1[0];
        const team1Stats = team1[1];

        const teamAName = pluckField(team0Meta, "name") || "Unknown Team";
        const teamBName = pluckField(team1Meta, "name") || "Unknown Team";

        const teamAId = pluckField(team0Meta, "team_id") || "";
        const teamBId = pluckField(team1Meta, "team_id") || "";

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

        // Reliable playoffs flag location in your JSON: matchup["0"].is_playoffs
        const isPlayoffs = String(matchupInner?.is_playoffs ?? "0") === "1";

        // Consolation flag is unreliable for your league => infer using standings playoff_seed
        // If BOTH teams have playoff_seed => playoffs bracket, else consolation (during playoff weeks)
        const aHasSeed = playoffSeedTeamIds.has(String(teamAId));
        const bHasSeed = playoffSeedTeamIds.has(String(teamBId));
        const inferredConsolation = isPlayoffs && !(aHasSeed && bHasSeed);

        result.push({
          week: weekNumber,
          isPlayoffs,
          isConsolation: inferredConsolation,
          teamA: {
            id: teamAId,
            name: teamAName,
            logo: teamALogo,
            score: teamAScore,
            projected: teamAProj,
            winProbability: teamAProb,
          },
          teamB: {
            id: teamBId,
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

// ---------- Playoff Labels (computed by playoff matchup count) ----------
function playoffStageLabel(playoffMatchupCount) {
  if (playoffMatchupCount <= 1) return "Final";
  if (playoffMatchupCount === 2) return "Semifinal";
  return "Quarterfinal";
}

// ---------- Rendering: Matchups ----------
function renderMatchupCards(matchups, { tagText = null } = {}) {
  if (!matchupsContainer) return;

  const frag = document.createDocumentFragment();

  matchups.forEach((m) => {
    const card = document.createElement("article");
    card.className = "matchup-card";

    const teamAProbPct = m.teamA.winProbability != null ? Math.round(m.teamA.winProbability * 100) : null;
    const teamBProbPct = m.teamB.winProbability != null ? Math.round(m.teamB.winProbability * 100) : null;

    const showTag = !!tagText;
    card.innerHTML = `
      <div class="matchup-header-row">
        <span></span>
        ${showTag ? `<span class="matchup-tag">${escapeHtml(tagText)}</span>` : `<span></span>`}
      </div>

      <div class="matchup-body">
        <div class="team-column">
          <div class="team-info">
            ${
              m.teamA.logo
                ? `<img src="${m.teamA.logo}" alt="${escapeHtml(m.teamA.name)}" class="team-logo" />`
                : `<div class="team-logo placeholder-logo">A</div>`
            }
            <div>
              <div class="team-name">${escapeHtml(m.teamA.name)}</div>
              <div class="team-metadata">
                Proj: ${escapeHtml(String(m.teamA.projected))}
                ${teamAProbPct != null ? ` · Win%: ${teamAProbPct}%` : ""}
              </div>
            </div>
          </div>
          <div class="team-score">${escapeHtml(String(m.teamA.score))}</div>
        </div>

        <div class="vs-column">
          <span class="vs-pill">VS</span>
        </div>

        <div class="team-column">
          <div class="team-info team-info-right">
            <div>
              <div class="team-name">${escapeHtml(m.teamB.name)}</div>
              <div class="team-metadata">
                Proj: ${escapeHtml(String(m.teamB.projected))}
                ${teamBProbPct != null ? ` · Win%: ${teamBProbPct}%` : ""}
              </div>
            </div>
            ${
              m.teamB.logo
                ? `<img src="${m.teamB.logo}" alt="${escapeHtml(m.teamB.name)}" class="team-logo" />`
                : `<div class="team-logo placeholder-logo">B</div>`
            }
          </div>
          <div class="team-score">${escapeHtml(String(m.teamB.score))}</div>
        </div>
      </div>
    `;

    frag.appendChild(card);
  });

  matchupsContainer.appendChild(frag);
}

function renderMatchupsWithPlayoffSections(matchups) {
  if (!matchupsContainer) return;
  matchupsContainer.innerHTML = "";

  const anyPlayoffs = matchups.some((m) => m.isPlayoffs);

  // Regular season: just render without tags/sections
  if (!anyPlayoffs) {
    renderMatchupCards(matchups, { tagText: null });
    return;
  }

  const playoffs = matchups.filter((m) => m.isPlayoffs && !m.isConsolation);
  const consolation = matchups.filter((m) => m.isPlayoffs && m.isConsolation);

  const stage = playoffStageLabel(playoffs.length);

  if (playoffs.length) {
    const h = document.createElement("div");
    h.className = "matchups-section-header";
    h.innerHTML = `<div class="matchups-section-title">Playoffs</div><div class="matchups-section-pill">${escapeHtml(
      stage
    )}</div>`;
    matchupsContainer.appendChild(h);
    renderMatchupCards(playoffs, { tagText: stage });
  }

  if (consolation.length) {
    const h2 = document.createElement("div");
    h2.className = "matchups-section-header";
    h2.innerHTML = `<div class="matchups-section-title">Consolation</div><div class="matchups-section-pill">Consolation</div>`;
    matchupsContainer.appendChild(h2);
    renderMatchupCards(consolation, { tagText: "Consolation" });
  }

  // If somehow everything was playoffs but empty after filtering, fallback
  if (!playoffs.length && !consolation.length) {
    renderMatchupCards(matchups, { tagText: "Playoffs" });
  }
}

// ---------- Standings Parsing ----------
function extractStandingsRows(data) {
  try {
    const leagueArr = data?.fantasy_content?.league;
    if (!Array.isArray(leagueArr)) return [];

    const standingsBlock = leagueArr[1]?.standings;
    const teamsObj = standingsBlock?.[0]?.teams;
    if (!teamsObj) return [];

    const rows = [];

    Object.keys(teamsObj)
      .filter((k) => k !== "count")
      .forEach((k) => {
        const team = teamsObj[k]?.team;
        if (!team) return;

        const meta = team[0]; // array of objects
        const points = team[1]?.team_points?.total ?? null;
        const standings = team[2]?.team_standings ?? {};

        const name = pluckField(meta, "name") || "Unknown Team";
        const teamId = pluckField(meta, "team_id") || "";
        const logoObj = pluckField(meta, "team_logos");
        const logo = logoObj?.[0]?.team_logo?.url ?? null;

        const managersObj = pluckField(meta, "managers");
        const managerNickname = managersObj?.[0]?.manager?.nickname ?? "";

        const rank = toNum(standings.rank, 999);
        const wins = toNum(standings?.outcome_totals?.wins, 0);
        const losses = toNum(standings?.outcome_totals?.losses, 0);
        const ties = toNum(standings?.outcome_totals?.ties, 0);
        const pf = toNum(standings.points_for ?? points, 0);

        const playoffSeed = standings.playoff_seed ?? null;

        rows.push({
          yahooIndex: rows.length,
          teamId,
          playoffSeed,
          rank,
          name,
          logo,
          manager: managerNickname,
          wins,
          losses,
          ties,
          pf,
        });
      });

    return rows;
  } catch (err) {
    console.error("extractStandingsRows error:", err);
    return [];
  }
}

// ---------- Standings Sorting + Rendering ----------
function applyStandingsSort(rows) {
  const r = [...rows];

  if (standingsSortMode === "yahoo") {
    return r;
  }

  if (standingsSortMode === "rank") {
    r.sort((a, b) => a.rank - b.rank);
  } else if (standingsSortMode === "record") {
    r.sort((a, b) => {
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return b.pf - a.pf;
    });
  } else if (standingsSortMode === "pf") {
    r.sort((a, b) => b.pf - a.pf);
  }

  if (standingsSortDir === "desc") r.reverse();
  return r;
}

function setStandingsSort(mode) {
  if (standingsSortMode === mode) {
    standingsSortDir = standingsSortDir === "asc" ? "desc" : "asc";
  } else {
    standingsSortMode = mode;
    standingsSortDir = "asc";
  }
  renderStandingsSection();
}

function renderStandingsSection() {
  if (!standingsContainer) return;

  if (!standingsRows || standingsRows.length === 0) {
    standingsContainer.innerHTML = `<div class="standings-empty">No standings loaded yet.</div>`;
    return;
  }

  const controls = `
    <div class="standings-controls">
      <button class="standings-sort-btn ${standingsSortMode === "yahoo" ? "active" : ""}" data-sort="yahoo">Yahoo</button>
      <button class="standings-sort-btn ${standingsSortMode === "rank" ? "active" : ""}" data-sort="rank">Rank</button>
      <button class="standings-sort-btn ${standingsSortMode === "record" ? "active" : ""}" data-sort="record">W-L</button>
      <button class="standings-sort-btn ${standingsSortMode === "pf" ? "active" : ""}" data-sort="pf">PF</button>
      <span class="standings-sort-dir">${standingsSortMode === "yahoo" ? "" : (standingsSortDir === "asc" ? "▲" : "▼")}</span>
    </div>
  `;

  const sorted = applyStandingsSort(standingsRows);

  const list = sorted
    .map((t) => {
      const record = `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;
      return `
        <div class="standings-row">
          <div class="s-left">
            ${t.logo ? `<img class="s-logo" src="${t.logo}" alt="${escapeHtml(t.name)}" />` : `<div class="s-logo s-logo--ph"></div>`}
            <div class="s-namewrap">
              <div class="s-topline">
                <span class="s-rank">#${t.rank}</span>
                <span class="s-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
              </div>
              <div class="s-sub">${record}${t.manager ? ` · ${escapeHtml(t.manager)}` : ""}</div>
            </div>
          </div>

          <div class="s-right">
            <div class="s-pf">${t.pf.toFixed(2)}</div>
            <div class="s-pflabel">PF</div>
          </div>
        </div>
      `;
    })
    .join("");

  standingsContainer.innerHTML = controls + `<div class="standings-ultra">${list}</div>`;

  standingsContainer.querySelectorAll(".standings-sort-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-sort");
      setStandingsSort(mode);
    });
  });
}

// ---------- Auto Load ----------
async function autoBoot() {
  // Standings first so playoff/consolation inference works once matchups load
  await loadStandings();
  await loadScoreboardForWeek(null, { renderMatchups: true });
}

window.addEventListener("DOMContentLoaded", autoBoot);
