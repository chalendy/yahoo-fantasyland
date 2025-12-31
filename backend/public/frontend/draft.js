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

function teamShortFromKey(teamKey) {
  // "461.l.38076.t.7" -> "T7"
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

  if (!Array.isArray(draftOrder) || !draftOrder.length || !Array.isArray(rounds) || !rounds.length) {
    setStatus("Draft data looks empty.");
    return;
  }

  // Build lookup: round -> team_key -> pick info
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of (r.picks || [])) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  // Wrapper (keeps your horizontal scroll behavior)
  const wrapper = el("div", "draft-board-wrapper");

  // Grid wrapper
  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(draftOrder.length));

  // Header row
  const header = el("div", "draft-grid-header");

  // Top-left corner cell
  header.appendChild(el("div", "draft-corner", "Rnd"));

  // Team columns
  for (const teamKey of draftOrder) {
    const info = teamsByKey?.[teamKey] || null;

    const th = el("div", "draft-team-header");

    // logo
    const logoUrl = info?.logo || info?.logo_url || info?.team_logo || info?.teamLogo;
    if (logoUrl) {
      const img = document.createElement("img");
      img.src = logoUrl;
      img.alt = info?.name ? `${info.name} logo` : "Team logo";
      th.appendChild(img);
    }

    // name (fallback to T#)
    const name = info?.name || info?.team_name || info?.teamName || teamShortFromKey(teamKey);
    th.appendChild(el("div", "draft-team-name", name));

    header.appendChild(th);
  }

  grid.appendChild(header);

  // Body: rounds
  const maxRound = Number(meta?.maxRound || 0) || Math.max(...rounds.map(r => r.round || 0), 0);

  for (let r = 1; r <= maxRound; r++) {
    const row = el("div", "draft-row");
    row.style.setProperty("--cols", String(draftOrder.length));

    // Round label
    row.appendChild(el("div", "draft-round-cell", `R${r}`));

    const map = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-pick-empty", "—"));
      } else {
        // --- TOP ROW ---
        const top = el("div", "draft-pick-top");

        // Left group: pick number + keeper badge (SIDE-BY-SIDE)
        const left = el("div", "draft-pick-left");
        left.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        if (pick.is_keeper) {
          // Badge element (style via CSS)
          left.appendChild(el("span", "draft-keeper-badge", "Keeper"));
        }

        // Right meta: position/team
        const metaText =
          `${pick.player_pos || ""}${pick.player_team ? ` · ${pick.player_team}` : ""}`.trim();
        const metaEl = el("div", "draft-pick-meta", metaText);

        top.appendChild(left);
        top.appendChild(metaEl);

        cell.appendChild(top);

        // Player name under the top row
        cell.appendChild(el("div", "draft-player-name", pick.player_name || pick.player_key));
      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }

  wrapper.appendChild(grid);
  boardEl.appendChild(wrapper);

  setStatus(`Loaded ${meta?.totalPicks ?? "?"} picks · ${maxRound} rounds`);
}

loadDraftBoard();
