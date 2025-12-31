
const statusEl = document.getElementById("status");
const boardEl = document.getElementById("draftBoard");
const reloadBtn = document.getElementById("reloadBtn");

reloadBtn?.addEventListener("click", () => loadDraftBoard());

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function teamShort(teamKey) {
  const m = String(teamKey || "").match(/\.t\.(\d+)$/);
  return m ? `T${m[1]}` : String(teamKey || "");
}

function renderTeamHeader(teamKey, teamsMeta) {
  const meta = teamsMeta?.[teamKey];
  const wrap = el("div", "draft-team-header");

  // logo
  if (meta?.logo_url) {
    const img = document.createElement("img");
    img.className = "draft-team-logo";
    img.alt = meta?.name ? `${meta.name} logo` : "Team logo";
    img.src = meta.logo_url;
    wrap.appendChild(img);
  } else {
    wrap.appendChild(el("div", "draft-team-logo draft-team-logo--placeholder", "🏈"));
  }

  // name + short
  const nameWrap = el("div", "draft-team-text");
  nameWrap.appendChild(el("div", "draft-team-name", meta?.name || teamShort(teamKey)));
  nameWrap.appendChild(el("div", "draft-team-short", teamShort(teamKey)));
  wrap.appendChild(nameWrap);

  return wrap;
}

async function loadDraftBoard() {
  setStatus("Loading draft board…");
  boardEl.innerHTML = "";

  let data;
  try {
    const res = await fetch("/draftboard-data", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    console.error(e);
    setStatus("Could not load draft board. Are you signed in?");
    return;
  }

  const { draftOrder, rounds, meta, teams } = data;
  if (!Array.isArray(draftOrder) || draftOrder.length === 0 || !Array.isArray(rounds) || rounds.length === 0) {
    setStatus("Draft data looks empty.");
    return;
  }

  // Build lookup: round -> team_key -> pick info
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of r.picks || []) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  // Main grid (header + rows)
  const cols = draftOrder.length + 1; // +1 for round label column
  const grid = el("div", "draft-grid");
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(170px, 1fr))`;

  // Header row: corner + teams
  grid.appendChild(el("div", "draft-corner", "Rnd"));
  for (const teamKey of draftOrder) {
    grid.appendChild(renderTeamHeader(teamKey, teams));
  }

  // Body: rounds as rows
  for (let r = 1; r <= meta.maxRound; r++) {
    // round label cell
    grid.appendChild(el("div", "draft-round-cell", `R${r}`));

    const map = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-pick-empty", "—"));
      } else {
        const top = el("div", "draft-pick-top");

        top.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        const metaLine = `${pick.player_pos || ""}${pick.player_team ? " · " + pick.player_team : ""}`.trim();
        top.appendChild(el("div", "draft-pick-meta", metaLine || "\u00A0"));

        cell.appendChild(top);

        const nameRow = el("div", "draft-player-name", pick.player_name || pick.player_key);

        // Keeper badge (from server is_keeper)
        if (pick.is_keeper) {
          const badge = el("span", "draft-keeper-badge", "Keeper");
          nameRow.appendChild(badge);
          cell.classList.add("is-keeper");
        }

        cell.appendChild(nameRow);
      }

      grid.appendChild(cell);
    }
  }

  boardEl.appendChild(grid);
  setStatus(`Loaded ${meta.totalPicks} picks · ${meta.maxRound} rounds`);
}

loadDraftBoard();
