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

function safeTeamCode(abbr) {
  if (!abbr) return "";
  return String(abbr).trim();
}

async function loadDraftBoard() {
  setStatus("Loading draft board…");
  boardEl.innerHTML = "";

  let data;
  try {
    const res = await fetch("/draftboard-data", { headers: { "Accept": "application/json" } });
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

  // Outer wrapper grid list
  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(draftOrder.length));

  // Header row
  const header = el("div", "draft-grid-header");
  header.style.setProperty("--cols", String(draftOrder.length));

  header.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const t = teamsByKey?.[teamKey];
    const th = el("div", "draft-team-header");

    const metaWrap = el("div", "draft-team-meta");
    metaWrap.appendChild(el("div", "draft-team-name", t?.name || teamKey.replace(/^.*\.t\./, "T")));
    metaWrap.appendChild(el("div", "draft-team-sub", t?.manager ? `@${t.manager}` : teamKey.replace(/^.*\.t\./, "Team ")));

    th.appendChild(metaWrap);

    if (t?.logo_url) {
      const img = document.createElement("img");
      img.className = "draft-team-logo";
      img.src = t.logo_url;
      img.alt = t?.name || "Team";
      th.appendChild(img);
    }

    header.appendChild(th);
  }

  boardEl.appendChild(header);

  // Rows: rounds
  for (let r = 1; r <= meta.maxRound; r++) {
    const row = el("div", "draft-row");
    row.style.setProperty("--cols", String(draftOrder.length));

    row.appendChild(el("div", "draft-round-cell", `R${r}`));

    const map = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-pick-empty", "—"));
      } else {
        const top = el("div", "draft-pick-top");

        // Left: pick #
        top.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        // Right: keeper badge OR pos/team meta
        const right = el("div", "draft-pick-meta");

        if (pick.is_keeper) {
          const badge = el("span", "keeper-badge", "Keeper");
          badge.title = "Kept from last season";
          right.appendChild(badge);
          cell.classList.add("is-keeper");
        } else {
          const pos = pick.player_pos || "";
          const team = safeTeamCode(pick.player_team);
          right.textContent = `${pos}${pos && team ? " · " : ""}${team}`;
        }

        top.appendChild(right);
        cell.appendChild(top);

        // Name
        const name = pick.player_name || pick.player_key || "Unknown";
        cell.appendChild(el("div", "draft-player-name", name));
      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }

  boardEl.appendChild(grid);
  setStatus(`Loaded ${meta.totalPicks} picks · ${meta.maxRound} rounds`);
}

loadDraftBoard();
