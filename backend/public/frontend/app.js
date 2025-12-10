const backend = "https://yh-fantasyland.onrender.com";

const authBtn = document.getElementById("authBtn");
const loadBtn = document.getElementById("loadBtn");
const output = document.getElementById("output");
const matchupsContainer = document.getElementById("matchups");

// Sign in with Yahoo
authBtn.onclick = () => {
  window.location.href = `${backend}/auth/start`;
};

// Load scoreboard + render matchups
loadBtn.onclick = async () => {
  output.textContent = "Loading scoreboard...";
  matchupsContainer.innerHTML = "";

  try {
    const res = await fetch(`${backend}/scoreboard`);
    if (!res.ok) {
      const text = await res.text();
      console.error("Scoreboard HTTP error:", res.status, text);
      output.textContent = `Error fetching scoreboard: ${res.status}`;
      return;
    }

    const data = await res.json();
    output.textContent = JSON.stringify(data, null, 2); // keep raw JSON for debugging

    const matchups = extractMatchups(data);
    renderMatchups(matchups);
  } catch (err) {
    console.error("Fetch error:", err);
    output.textContent = "Error fetching scoreboard. See console for details.";
  }
};

// ------------------------
//  Helpers
// ------------------------

// Turn Yahoo’s crazy JSON into a clean matchups array
function extractMatchups(scoreboardJson) {
  try {
    // Typical Yahoo structure:
    // fantasy_content.league[1].scoreboard[0].matchups
    const leagueArr = scoreboardJson.fantasy_content.league;
    const scoreboard = leagueArr[1].scoreboard[0];
    const matchupsObj = scoreboard.matchups;

    const result = [];

    for (const mKey in matchupsObj) {
      if (mKey === "count") continue;

      const matchupWrapper = matchupsObj[mKey];
      const matchup = matchupWrapper.matchup;
      const teamsObj = matchup.teams;

      const teams = [];

      for (const tKey in teamsObj) {
        if (tKey === "count") continue;

        const teamWrapper = teamsObj[tKey];
        const teamArr = teamWrapper.team;

        const metaArr = teamArr[0]; // array with name, logos, managers, etc.
        const scoring = teamArr[1] || {};

        // Find objects inside metaArr
        const nameObj = metaArr.find((item) => item && item.name);
        const logosObj = metaArr.find((item) => item && item.team_logos);
        const managersObj = metaArr.find((item) => item && item.managers);

        const name = nameObj?.name || "Unknown Team";
        const logo =
          logosObj?.team_logos?.[0]?.team_logo?.url || null;
        const manager =
          managersObj?.managers?.[0]?.manager?.nickname || null;

        const points = parseFloat(
          scoring.team_points?.total ?? "0.00"
        );
        const projected = parseFloat(
          scoring.team_projected_points?.total ?? "0.00"
        );
        const winProb = scoring.win_probability ?? null;

        teams.push({
          name,
          logo,
          manager,
          points,
          projected,
          winProb,
        });
      }

      result.push({
        week: scoreboard.week,
        teams,
      });
    }

    return result;
  } catch (e) {
    console.error("Error parsing matchups:", e);
    return [];
  }
}

// Render matchups into the page
function renderMatchups(matchups) {
  matchupsContainer.innerHTML = "";

  if (!matchups.length) {
    matchupsContainer.textContent = "No matchups found.";
    return;
  }

  matchups.forEach((mu) => {
    if (mu.teams.length < 2) return;

    const [home, away] = mu.teams;

    const card = document.createElement("div");
    card.className = "matchup-card";

    card.innerHTML = `
      <div class="team team-a">
        ${home.logo ? `<img src="${home.logo}" class="team-logo" />` : ""}
        <div class="team-name">${home.name}</div>
        <div class="team-manager">${home.manager ?? ""}</div>
        <div class="team-points">
          ${home.points.toFixed(2)} pts
          <span class="proj">(${home.projected.toFixed(2)} proj)</span>
        </div>
      </div>
      <div class="vs">vs</div>
      <div class="team team-b">
        ${away.logo ? `<img src="${away.logo}" class="team-logo" />` : ""}
        <div class="team-name">${away.name}</div>
        <div class="team-manager">${away.manager ?? ""}</div>
        <div class="team-points">
          ${away.points.toFixed(2)} pts
          <span class="proj">(${away.projected.toFixed(2)} proj)</span>
        </div>
      </div>
    `;

    matchupsContainer.appendChild(card);
  });
}
