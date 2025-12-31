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
  // "461.l.38076.t.7" -> "T7"
  const m = String(teamKey || "").match(/\.t\.(\d+)$/);
  return m ? `T${m[1]}` : teamKey;
}

function pickIsKeeper(pick) {
  // only true if the backend explicitly marked it
  return pick?.is_keeper === true || pick?.isKeeper === true;
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

  const { draftOrder, rounds, meta, teams } = data || {};
  if (!Array.isArray(draftOrder) || !draftOrder.length || !Array.isArray(rounds)) {
    setStatus("Draft data looks empty.");
    return;
  }

  // Build lookup: round -> team_key -> pick
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of r.picks || []) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  const colCount = draftOrder.length + 1; // +1 for the "Rnd" column
  const maxRound = Number(meta?.maxRound || 0) || Math.max(...rounds.map(r => r.round || 0), 0);

  // One grid for EVERYTHING so header aligns with picks
  const grid = el("div", "draft-grid");
  grid.style.gridTemplateColumns = `repeat(${colCount}, minmax(0, 1fr))`;

  // --- Header row (in-grid) ---
  grid.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const t = teams?.[teamKey] || {};
    const headerCell = el("div", "draft-team-header");

    const top = el("div", "draft-team-header-top");

    // logo (optional)
    const logoUrl = t.logo_url || t.logoUrl || t.logo;
    if (logoUrl) {
      const img = document.createElement("img");
      img.className = "draft-team-logo";
      img.alt = t.name || teamShort(teamKey);
      img.src = logoUrl;
      img.loading = "lazy";
      top.appendChild(img);
    } else {
      // placeholder circle if you want (keeps spacing consistent)
      top.appendChild(el("div", "draft-team-logo placeholder-logo", ""));
    }

    const nameWrap = el("div", "draft-team-header-text");
    nameWrap.appendChild(el("div", "draft-team-name", t.name || teamShort(teamKey)));
    nameWrap.appendChild(el("div", "draft-team-key", teamShort(teamKey)));

    top.appendChild(nameWrap);
    headerCell.appendChild(top);

    grid.appendChild(headerCell);
  }

  // --- Body: each round is a ROW ---
  for (let r = 1; r <= maxRound; r++) {
    grid.appendChild(el("div", "draft-round-cell", `R${r}`));

    const roundMap = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = roundMap.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-pick-empty", "—"));
        grid.appendChild(cell);
        continue;
      }

      const top = el("div", "draft-pick-top");
      top.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

      const metaTxt = [pick.player_pos, pick.player_team].filter(Boolean).join(" · ");
      top.appendChild(el("div", "draft-pick-meta", metaTxt));

      // Only show keeper badge when explicitly true
      if (pickIsKeeper(pick)) {
        top.appendChild(el("div", "draft-keeper-badge", "Kept"));
      }

      cell.appendChild(top);
      cell.appendChild(el("div", "draft-player-name", pick.player_name || pick.player_key || "Unknown"));

      grid.appendChild(cell);
    }
  }

  boardEl.appendChild(grid);
  setStatus(`Loaded ${meta?.totalPicks ?? "?"} picks · ${maxRound} rounds`);
}

loadDraftBoard();
