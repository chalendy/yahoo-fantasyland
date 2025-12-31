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

function teamShortKey(teamKey) {
  const m = String(teamKey).match(/\.t\.(\d+)$/);
  return m ? `T${m[1]}` : teamKey;
}

async function loadDraftBoard() {
  setStatus("Loading draft board…");
  boardEl.innerHTML = "";

  let data;
  try {
    const res = await fetch("/draftboard-data");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    console.error(e);
    setStatus("Could not load draft board. Are you signed in?");
    return;
  }

  const { draftOrder, rounds, meta, teamsByKey } = data;

  if (!draftOrder?.length || !rounds?.length) {
    setStatus("Draft data looks empty.");
    return;
  }

  // Build lookup: round -> team_key -> pick info
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of r.picks) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  // Grid wrapper
  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(draftOrder.length + 1)); // +1 for round column

  // Header row
  const header = el("div", "draft-grid-header");
  header.style.setProperty("--cols", String(draftOrder.length + 1));
  header.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const t = teamsByKey?.[teamKey];
    const th = el("div", "draft-team-header");

    const top = el("div", "draft-team-header-top");

    const logo = el("img", "draft-team-logo");
    if (t?.logo_url) {
      logo.src = t.logo_url;
      logo.alt = t?.name || teamShortKey(teamKey);
    } else {
      logo.style.display = "none";
    }

    const nameWrap = el("div", "draft-team-namewrap");
    nameWrap.appendChild(el("div", "draft-team-name", t?.name || teamShortKey(teamKey)));
    if (t?.manager) nameWrap.appendChild(el("div", "draft-team-manager", t.manager));

    top.appendChild(logo);
    top.appendChild(nameWrap);
    th.appendChild(top);

    header.appendChild(th);
  }

  grid.appendChild(header);

  // Body: rounds
  for (let r = 1; r <= meta.maxRound; r++) {
    const row = el("div", "draft-row");
    row.style.setProperty("--cols", String(draftOrder.length + 1));

    // Round label
    row.appendChild(el("div", "draft-round-cell", `R${r}`));

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
        top.appendChild(el("div", "draft-pick-meta", metaLine));

        const nameLine = el("div", "draft-player-name", pick.player_name);

        // keeper badge
        if (pick.is_keeper) {
          const badge = el("span", "draft-keeper-badge", "KEEPER");
          nameLine.appendChild(badge);
        }

        cell.appendChild(top);
        cell.appendChild(nameLine);
      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }

  boardEl.appendChild(grid);
  setStatus(`Loaded ${meta.totalPicks} picks · ${meta.maxRound} rounds`);
}

loadDraftBoard();
