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

function shortTeamKey(teamKey) {
  // 461.l.38076.t.12 -> T12
  return teamKey?.replace(/^.*\.t\./, "T") ?? "";
}

// If it didn't map, you said assume keeper. We'll flag those.
function isKeeperPick(pick) {
  if (!pick) return false;

  const name = (pick.player_name || "").trim();
  const pos = (pick.player_pos || "").trim();
  const team = (pick.player_team || "").trim();

  // Your observed failure mode: player_name becomes the raw key like "461.p.40899"
  const looksLikeRawKey = /^(\d+)\.p\.\d+$/.test(name) || /^(\d+)\.p\.\d+$/.test(pick.player_key || "");

  return looksLikeRawKey || (!name || name === pick.player_key) || (!pos && !team);
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

  const { draftOrder, rounds, meta, teamsByKey } = data;

  if (!draftOrder?.length || !meta?.maxRound) {
    setStatus("Draft data looks empty.");
    return;
  }

  // Build lookup: round -> team_key -> pick info
  const byRoundTeam = new Map();
  for (const r of rounds || []) {
    const m = new Map();
    for (const p of r.picks || []) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  // Main grid wrapper
  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(draftOrder.length));

  // Header row (same grid template as body rows)
  const header = el("div", "draft-header");
  header.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const teamMeta = teamsByKey?.[teamKey] || {};
    const name = teamMeta.name || shortTeamKey(teamKey);
    const logo = teamMeta.logo || teamMeta.logo_url || "";

    const th = el("div", "draft-team-header");

    if (logo) {
      const img = document.createElement("img");
      img.className = "draft-team-logo";
      img.src = logo;
      img.alt = name;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      th.appendChild(img);
    } else {
      // simple placeholder circle
      const ph = el("div", "draft-team-logo");
      th.appendChild(ph);
    }

    const metaCol = el("div", "draft-team-meta");
    metaCol.appendChild(el("div", "draft-team-name", name));
    metaCol.appendChild(el("div", "draft-team-key", shortTeamKey(teamKey)));
    th.appendChild(metaCol);

    header.appendChild(th);
  }

  grid.appendChild(header);

  // Body: rounds
  for (let r = 1; r <= meta.maxRound; r++) {
    const row = el("div", "draft-row");

    // Round label
    row.appendChild(el("div", "draft-round-cell", `R${r}`));

    const map = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-empty", "—"));
      } else {
        const keeper = isKeeperPick(pick);

        const top = el("div", "draft-pick-top");
        top.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        const metaText = `${pick.player_pos || ""}${pick.player_team ? " · " + pick.player_team : ""}`.trim();
        top.appendChild(el("div", "draft-pick-meta", metaText || (keeper ? "Keeper" : "")));

        cell.appendChild(top);

        // Name line (fallback)
        const displayName =
          !pick.player_name || pick.player_name === pick.player_key ? shortTeamKey(pick.player_key || "") : pick.player_name;

        cell.appendChild(el("div", "draft-player-name", displayName || "—"));

        if (keeper) {
          cell.appendChild(el("div", "draft-badge", "Keeper"));
        }
      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }

  boardEl.appendChild(grid);
  setStatus(`Loaded ${meta.totalPicks} picks · ${meta.maxRound} rounds`);
}

loadDraftBoard();
