// Backend is same origin, so we can use relative URLs
const backend = "";

// Buttons and UI elements
const authBtn = document.getElementById("authBtn");
const loadScoreboardBtn = document.getElementById("loadScoreboardBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const statusMessage = document.getElementById("statusMessage");
const matchupsContainer = document.getElementById("matchupsContainer");
const jsonOutput = document.getElementById("jsonOutput");

// Holds the last-loaded scoreboard JSON
let scoreboardData = null;

// ---- Helpers ----
function setStatus(msg, isError = false) {
  statusMessage.textContent = msg;
  statusMessage.className = isError ? "status-message error" : "status-message";
}

function clearMatchups() {
  matchupsContainer.innerHTML = "";
}

// ---- Button handlers ----

// 1) Yahoo login
authBtn.addEventListener("click", () => {
  window.location.href = `${backend}/auth/start`;
});

// 2) Load raw scoreboard JSON from /scoreboard
loadScoreboardBtn.addEventListener("click", async () => {
  setStatus("Loading scoreboard JSON…");
  clearMatchups();
  jsonOutput.textContent = "";

  try {
    const res = await fetch(`${backend}/scoreboard`);
    if (!res.ok) {
      const txt = await res.text();
      console.error("Scoreboard error:", res.status, txt);
      setStatus(`Error fetching scoreboard (${res.status})`, true);
      return;
    }

    const data = await res.json();
    scoreboardData = data; // <-- this is what matchups reader will use

    jsonOutput.textContent = JSON.stringify(data, null, 2);
    setStatus("Scoreboard JSON loaded. Now click “Load This Week’s Matchups”.");
  } catch (err) {
    console.error("Fetch error:", err);
    setStatus("Error fetching scoreboard. Check console.", true);
  }
});

// 3) Parse and display this week’s matchups
loadMatchupsBtn.addEventListener("click", () => {
  clearMatchups();

  if (!scoreboardData) {
    setStatus(
      "No scoreboard loaded yet. Click “Load Scoreboard JSON” first.",
      true
    );
    return;
  }

  try {
    const fc = scoreboardData.fantasy_content;
    const leagueArr = fc?.league;

    // Your sample JSON: league[1].scoreboard[0].matchups
    const scoreboardRoot = Array.isArray(leagueArr)
      ? leagueArr[1]?.scoreboard?.[0]
      : null;

    const matchupsObj = scoreboardRoot?.matchups;

    if (!matchupsObj) {
      setStatus("No matchups found in scoreboard.", true);
      return;
    }

    const entries = Object.entries(matchupsObj).filter(
      ([key]) => key !== "count"
    );

    if (!entries.length) {
      setStatus("No matchups found for this week.", true);
      return;
    }

    const fragments = [];

    for (const [key, matchupWrapper] of entries) {
      const matchup = matchupWrapper.matchup;

      // In your JSON, "matchup": { "0": { teams: {...} }, week: "...", ... }
      const core =
        matchup?.["0"] || (Array.isArray(matchup) ? matchup[0] : matchup);
      const teamsObj = core?.teams;

      if (!teamsObj) continue;

      const teamEntries = Object.entries(teamsObj).filter(
        ([k]) => k !== "count"
      );

      if (teamEntries.length < 2) continue;

      const parsedTeams = teamEntries.map(([, t]) => {
        const teamArr = t.team;
        if (!Array.isArray(teamArr) || teamArr.length < 1) return null;

        const metaArr = teamArr[0]; // array of objects: {name}, {url}, {team_logos}, etc.
        const stats = teamArr[1] || {};

        const nameObj = Array.isArray(metaArr)
          ? metaArr.find((o) => o && typeof o === "object" && "name" in o)
          : null;
        const name = nameObj?.name || "Unknown Team";

        const logoObj = Array.isArray(metaArr)
          ? metaArr.find((o) => o && o.team_logos)
          : null;
        const logoUrl =
          logoObj?.team_logos?.[0]?.team_logo?.url || null;

        const points = parseFloat(stats?.team_points?.total || "0") || 0;
        const projected =
          parseFloat(stats?.team_projected_points?.total || "0") || 0;
        const winProb = stats?.win_probability;
        const winProbPct =
          typeof winProb === "number"
            ? `${(winProb * 100).toFixed(0)}%`
            : null;

        return { name, logoUrl, points, projected, winProbPct };
      });

      if (parsedTeams.includes(null) || parsedTeams.length < 2) continue;

      const [home, away] = parsedTeams;

      const cardHtml = `
        <div class="matchup-card">
          <div class="team team-home">
            ${
              home.logoUrl
                ? `<img src="${home.logoUrl}" alt="${home.name} logo" class="team-logo" />`
                : ""
            }
            <div class="team-name">${home.name}</div>
            <div class="team-points">
              <span class="points">${home.points.toFixed(2)}</span>
              <span class="projected">Proj: ${home.projected.toFixed(2)}</span>
              ${
                home.winProbPct
                  ? `<span class="winprob">Win: ${home.winProbPct}</span>`
                  : ""
              }
            </div>
          </div>

          <div class="vs">vs</div>

          <div class="team team-away">
            ${
              away.logoUrl
                ? `<img src="${away.logoUrl}" alt="${away.name} logo" class="team-logo" />`
                : ""
            }
            <div class="team-name">${away.name}</div>
            <div class="team-points">
              <span class="points">${away.points.toFixed(2)}</span>
              <span class="projected">Proj: ${away.projected.toFixed(2)}</span>
              ${
                away.winProbPct
                  ? `<span class="winprob">Win: ${away.winProbPct}</span>`
                  : ""
              }
            </div>
          </div>
        </div>
      `;

      fragments.push(cardHtml);
    }

    if (!fragments.length) {
      setStatus("No matchups could be parsed from the scoreboard.", true);
      return;
    }

    matchupsContainer.innerHTML = fragments.join("");
    setStatus("");
  } catch (err) {
    console.error("Error parsing matchups:", err);
    setStatus("Error parsing matchups. Check console.", true);
  }
});
