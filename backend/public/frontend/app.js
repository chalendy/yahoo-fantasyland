// Point to your backend (same origin on Render)
const backend = "";

// Grab elements
const authBtn = document.getElementById("authBtn");
const loadMatchupsBtn = document.getElementById("loadMatchupsBtn");
const loadScoreboardBtn = document.getElementById("loadScoreboardBtn");
const matchupsDiv = document.getElementById("matchups");
const outputPre = document.getElementById("output");

// ---- Button handlers ----

// Sign in with Yahoo
authBtn.addEventListener("click", () => {
  window.location.href = "/auth/start";
});

// Load raw JSON (for debugging)
loadScoreboardBtn.addEventListener("click", async () => {
  outputPre.textContent = "Loading scoreboard JSON...";

  try {
    const res = await fetch("/scoreboard");
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      outputPre.textContent = `Error: ${res.status}\n${text}`;
      return;
    }

    const data = await res.json();
    outputPre.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    console.error(err);
    outputPre.textContent = "Error fetching scoreboard. See console for details.";
  }
});

// Load this week's matchups (pretty UI)
loadMatchupsBtn.addEventListener("click", async () => {
  matchupsDiv.innerHTML = "Loading matchups...";
  outputPre.textContent = "";

  try {
    const res = await fetch("/scoreboard");
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard error:", res.status, text);
      matchupsDiv.textContent = `Error: ${res.status}`;
      return;
    }

    const data = await res.json();
    // Also dump to debug so you can inspect structure
    outputPre.textContent = JSON.stringify(data, null, 2);

    const matchups = extractMatchupsFromYahooScoreboard(data);
    renderMatchups(matchups);
  } catch (err) {
    console.error(err);
    matchupsDiv.textContent = "Error loading matchups. See console.";
  }
});

// ---- Helpers ----

// Tries to walk the Yahoo JSON structure and pull out matchups.
// You may need to tweak this if Yahoo's JSON shape differs slightly.
function extractMatchupsFromYahooScoreboard(data) {
  const matchups = [];

  try {
    // Typical Yahoo structure:
    // data.fantasy_content.league[1].scoreboard[0].matchups
    const fantasyContent = data.fantasy_content;
    if (!fantasyContent) return [];

    const leagueArr = fantasyContent.league;
    if (!Array.isArray(leagueArr)) return [];

    const scoreboardWrapper = leagueArr.find((item) => item && item.scoreboard);
    if (!scoreboardWrapper) return [];

    const scoreboard = scoreboardWrapper.scoreboard[0]; // first scoreboard object
    const matchupsObj = scoreboard.matchups;
    if (!matchupsObj) return [];

    Object.keys(matchupsObj)
      .filter((k) => k !== "count")
      .forEach((mk) => {
        const matchupWrapper = matchupsObj[mk];
        if (!matchupWrapper || !matchupWrapper.matchup) return;

        const matchup = matchupWrapper.matchup;
        const teamsObj = matchup.teams;
        if (!teamsObj) return;

        const teamEntries = Object.keys(teamsObj)
          .filter((k) => k !== "count")
          .map((k) => teamsObj[k].team);

        if (teamEntries.length !== 2) return;

        const [team1Arr, team1Info] = teamEntries[0];
        const [team2Arr, team2Info] = teamEntries[1];

        const name1 =
          (team1Arr.find((o) => o && o.name) || {}).name || "Unknown Team";
        const name2 =
          (team2Arr.find((o) => o && o.name) || {}).name || "Unknown Team";

        const score1 =
          team1Info?.team_points?.total ??
          team1Info?.team_points?.value ??
          "0.00";
        const score2 =
          team2Info?.team_points?.total ??
          team2Info?.team_points?.value ??
          "0.00";

        const proj1 =
          team1Info?.team_projected_points?.total ??
          team1Info?.team_projected_points?.value ??
          null;
        const proj2 =
          team2Info?.team_projected_points?.total ??
          team2Info?.team_projected_points?.value ??
          null;

        matchups.push({
          name1,
          score1,
          proj1,
          name2,
          score2,
          proj2,
        });
      });
  } catch (err) {
    console.error("Error extracting matchups:", err);
  }

  return matchups;
}

function renderMatchups(matchups) {
  if (!matchups.length) {
    matchupsDiv.innerHTML = "<p>No matchups found for this week.</p>";
    return;
  }

  matchupsDiv.innerHTML = "";

  matchups.forEach((m) => {
    const card = document.createElement("div");
    card.className = "matchup-card";

    card.innerHTML = `
      <div class="team">
        <div class="team-name">${m.name1}</div>
        <div class="team-score">${m.score1}</div>
        ${
          m.proj1
            ? `<div class="team-proj">Proj: ${m.proj1}</div>`
            : ""
        }
      </div>
      <div class="vs">vs</div>
      <div class="team">
        <div class="team-name">${m.name2}</div>
        <div class="team-score">${m.score2}</div>
        ${
          m.proj2
            ? `<div class="team-proj">Proj: ${m.proj2}</div>`
            : ""
        }
      </div>
    `;

    matchupsDiv.appendChild(card);
  });
}
