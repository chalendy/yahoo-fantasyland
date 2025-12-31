const statusEl = document.getElementById("status");
const boardEl = document.getElementById("draftBoard");
const reloadBtn = document.getElementById("reloadBtn");

reloadBtn?.addEventListener("click", () => loadDraftBoard());

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function shortTeamKey(teamKey) {
  // "461.l.38076.t.7" -> "T7"
  const m = String(teamKey || "").match(/\.t\.(\d+)$/);
  return m ? `T${m[1]}` : String(teamKey || "");
}

async function loadDraftBoard() {
  setStatus("Loading draft board…");
  boardEl.innerHTML = "";

  let data;
  try {
    const res = await fetch("/draftboard-data", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    console.error(e);
    setStatus("Could not load draft board. Are you signed in?");
    return;
  }

  const { draftOrder, rounds, meta, teams } = data || {};
  if (!Array.isArray(draftOrder) || !draftOrder.length || !Array.isArray(rounds) || !rounds.length) {
    setStatus("Draft data looks empty.");
    return;
  }

  const teamsByKey = teams || {};

  // Build lookup: round -> team_key -> pick info
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of (r.picks || [])) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  const colCount = draftOrder.length + 1; // +1 for "Rnd" column

  // One single grid that includes the header cells + all round rows
  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(colCount));

  // -----------------------
  // Header row (aligned)
  // -----------------------
  grid.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const info = teamsByKey[teamKey] || {};
    const headerCell = el("div", "draft-team-header");

    // logo (optional)
    const logoUrl = info.logo_url || info.logo || info.team_logo || "";
    if (logoUrl) {
      const img = document.createElement("img");
      img.className = "draft-team-logo";
      img.src = logoUrl;
      img.alt = info.name ? `${info.name} logo` : "Team logo";
      img.loading = "lazy";
      headerCell.appendChild(img);
    } else {
      // fallback placeholder keeps layout consistent
      headerCell.appendChild(el("div", "draft-team-logo placeholder-logo", "🏈"));
    }

    // name + short key
    const nameWrap = el("div", "draft-team-header-text");
    nameWrap.appendChild(el("div", "draft-team-name", info.name || shortTeamKey(teamKey)));
    nameWrap.appendChild(el("div", "draft-team-key", shortTeamKey(teamKey)));
    headerCell.appendChild(nameWrap);

    grid.appendChild(headerCell);
  }

  // -----------------------
  // Body: rounds
  // -----------------------
  const maxRound = Number(meta?.maxRound) || Math.max(...rounds.map(r => Number(r.round || 0)));

  for (let r = 1; r <= maxRound; r++) {
    // Round label cell
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

        const metaTextParts = [];
        if (pick.player_pos) metaTextParts.push(pick.player_pos);
        if (pick.player_team) metaTextParts.push(pick.player_team);

        top.appendChild(el("div", "draft-pick-meta", metaTextParts.join(" · ")));

        // Keeper badge only when explicitly flagged true
        if (pick.isKeeper === true) {
          top.appendChild(el("div", "draft-keeper-badge", "Keeper"));
          cell.classList.add("is-keeper");
        }

        cell.appendChild(top);
        cell.appendChild(el("div", "draft-player-name", pick.player_name || pick.player_key || "Unknown"));

        grid.appendChild(cell);
      }
    }
  }

  boardEl.appendChild(grid);
  setStatus(`Loaded ${meta?.totalPicks ?? "?"} picks · ${maxRound} rounds`);
}

loadDraftBoard();
