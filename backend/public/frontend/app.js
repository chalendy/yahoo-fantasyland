function createMatchupCard(matchup, week) {
  return `
    <div class="matchup-card">

      <div class="team-col">
        <span class="week-label">Week ${week}</span>
        <div class="team-top">
          <img class="team-logo" src="${matchup.home.logo}" />
          <div>
            <div class="team-name">${matchup.home.name}</div>
          </div>
        </div>

        <div class="team-score">${matchup.home.score}</div>
        <div class="team-proj">Proj: ${matchup.home.projected}</div>
        <div class="team-winprob">Win: ${matchup.home.winprob}%</div>
      </div>

      <div class="matchup-center">
        <div class="vs-text">VS</div>
      </div>

      <div class="team-col">
        <span class="week-label" style="opacity: 0;">Week ${week}</span>
        <div class="team-top" style="justify-content: flex-end;">
          <div>
            <div class="team-name" style="text-align: right;">${matchup.away.name}</div>
          </div>
          <img class="team-logo" src="${matchup.away.logo}" />
        </div>

        <div class="team-score" style="text-align: right;">${matchup.away.score}</div>
        <div class="team-proj" style="text-align: right;">Proj: ${matchup.away.projected}</div>
        <div class="team-winprob" style="text-align: right;">Win: ${matchup.away.winprob}%</div>
      </div>

      <div class="playoff-pill">Playoffs</div>
    </div>
  `;
}
