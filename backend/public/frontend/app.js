const backendBase = "https://yh-fantasyland.onrender.com";

// Buttons / DOM elements
const authBtn = document.getElementById("authBtn");
const loadScoreboardBtn = document.getElementById("loadScoreboardBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const jsonOutput = document.getElementById("jsonOutput");
const matchupsContainer = document.getElementById("matchupsContainer");

let scoreboardData = null;

// ---------- Helpers ----------

function setJsonOutput(content) {
  if (!jsonOutput) return;
  jsonOutput.textContent = content;
}

function setMatchupsMessage(msg) {
  if (!matchupsContainer) return;
  matchupsContainer.innerHTML = `<p class="matchups-message">${msg}</p>`;
}

// Parse Yahoo scoreboard JSON into a friendlier matchup list
function extractMatchupsFromScoreboard(data) {
  try {
    const fc = data.fantasy_content;
    if (!fc || !fc.league) return [];

    const leagueArr = fc.league;
    const leagueMeta = leagueArr[0];
    const leagueBody = leagueArr[1];

    const currentWeek = leagueMeta.current_week || leagueBody.scoreboard?.week;
    const scoreboard = leagueBody.scoreboard[0];
    const matchupsObj = scoreboard.matchups;

    const matchupCount = matchupsObj.count ?? 0;
    const matchups = [];

    for (let i = 0; i < matchupCount; i++) {
      const wrapper = matchupsObj[i];
      if (!wrapper || !wrapper.matchup) continue;

      const matchup = wrapper.matchup;
      const matchupCore = matchup[0]; // teams wrapper + meta
      const teamsObj = matchupCore.teams;
      const week = matchupCore.week ?? scoreboard.week ?? currentWeek;
      const status = matchupCore.status || scoreboard.status || "unknown";

      const homeTeam = parseTeamFromYahoo(teamsObj["0"]);
      const awayTeam = parseTeamFromYahoo(teamsObj["1"]);

      matchups.push({
        week,
        status,
        home: homeTeam,
        away: awayTeam,
      });
    }

    return matchups;
  } catch (err) {
    console.error("Error extracting matchups:", err);
    return [];
  }
}

function parseTeamFromYahoo(teamContainer) {
  if (!teamContainer || !teamContainer.team) {
    return {
      name: "Unknown Team",
      logo: null,
      points: "0.00",
      projected: "0.00",
      winProb: null,
    };
  }

  const teamArr = teamContainer.team;
  const metaArr = teamArr[0] || [];
  const stats = teamArr[1] || {};

  let name = "Unknown Team";
  let logoUrl = null;

  metaArr.forEach((item) => {
    if (item && item.name) {
      name = item.name;
    }
    if (item && item.team_logos) {
      const maybeLogo = item.team_logos[0]?.team_logo?.url;
      if (maybeLogo) logoUrl = maybeLogo;
    }
  });

  const points = stats.team_points?.total ?? "0.00";
  const projected = stats.team_projected_points?.total ?? "0.00";
  const winProb = typeof stats.win_probability === "number"
    ? stats.win_probability
    : null;

  return { name, logo: logoUrl, points, projected, winProb };
}

// Render nice Sleeper-style cards
function renderMatchupCards(matchups) {
  if (!matchupsContainer) return;

  if (!matchups.length) {
    setMatchupsMessage("No matchups found for this week.");
    return;
  }

  const cardsHtml = matchups
    .map((m, idx) => {
      const weekLabel = `Week ${m.week}`;
      const statusLabel =
        m.status === "midevent"
          ? "Live"
          : m.status === "postevent"
          ? "Final"
          : m.status === "pregame"
          ? "Upcoming"
          : m.status || "Status";

      const homeWinPct = m.home.winProb != null ? Math.round(m.home.winProb * 100) : null;
      const awayWinPct = m.away.winProb != null ? Math.round(m.away.winProb * 100) : null;

      const homeLogo = m.home.logo
        ? `<img class="team-avatar" src="${m.home.logo}" alt="${m.home.name} logo" />`
        : `<div class="team-avatar placeholder"></div>`;

      const awayLogo = m.away.logo
        ? `<img class="team-avatar" src="${m.away.logo}" alt="${m.away.name} logo" />`
        : `<div class="team-avatar placeholder"></div>`;

      // win prob bars
      let winBarHtml = "";
      if (homeWinPct != null && awayWinPct != null) {
        const total = homeWinPct + awayWinPct || 1;
        const homeWidth = (homeWinPct / total) * 100;
        const awayWidth = (awayWinPct / total) * 100;
        winBarHtml = `
          <div class="win-prob-bar">
            <div class="win-prob-fill home" style="width:${homeWidth}%"></div>
            <div class="win-prob-fill away" style="width:${awayWidth}%"></div>
          </div>
          <div class="win-prob-labels">
            <span>${homeWinPct}% win</span>
            <span>${awayWinPct}% win</span>
          </div>
        `;
      }

      return `
        <article class="matchup-card">
          <header class="matchup-header">
            <div class="matchup-week">${weekLabel}</div>
            <div class="matchup-status">${statusLabel}</div>
          </header>

          <div class="matchup-main">
            <div class="team-panel team-left">
              ${homeLogo}
              <div class="team-meta">
                <div class="team-name">${m.home.name}</div>
                <div class="team-sub">
                  <span class="team-score">${m.home.points}</span>
                  <span class="team-proj">Proj ${m.home.projected}</span>
                </div>
              </div>
            </div>

            <div class="vs-pill">
              <span>VS</span>
            </div>

            <div class="team-panel team-right">
              ${awayLogo}
              <div class="team-meta">
                <div class="team-name">${m.away.name}</div>
                <div class="team-sub">
                  <span class="team-score">${m.away.points}</span>
                  <span class="team-proj">Proj ${m.away.projected}</span>
                </div>
              </div>
            </div>
          </div>

          ${winBarHtml}
        </article>
      `;
    })
    .join("");

  matchupsContainer.innerHTML = cardsHtml;
}

// ---------- Event handlers ----------

// 1) Sign in with Yahoo
if (authBtn) {
  authBtn.addEventListener("click", () => {
    window.location.href = `${backendBase}/auth/start`;
  });
}

// 2) Load raw scoreboard JSON
if (loadScoreboardBtn) {
  loadScoreboardBtn.addEventListener("click", async () => {
    try {
      setJsonOutput("Loading scoreboard JSON...");
      const res = await fetch(`${backendBase}/scoreboard`);
      if (!res.ok) {
        const text = await res.text();
        console.error("Scoreboard error:", res.status, text);
        setJsonOutput(`Error fetching scoreboard: ${res.status}`);
        return;
      }
      const data = await res.json();
      scoreboardData = data;
      setJsonOutput(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("Scoreboard fetch failed:", err);
      setJsonOutput("Error fetching scoreboard. See console for details.");
    }
  });
}

// 3) Load pretty matchup cards for current week
if (loadMatchupsBtn) {
  loadMatchupsBtn.addEventListener("click", () => {
    if (!scoreboardData) {
      setMatchupsMessage(
        "No scoreboard loaded yet. Click 'Load Scoreboard JSON' first."
      );
      return;
    }

    const matchups = extractMatchupsFromScoreboard(scoreboardData);
    renderMatchupCards(matchups);
  });
}
