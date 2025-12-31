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
  return m ? `T${m[1]}` : String(teamKey || "");
}

function normalizeBool(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
  if (typeof v === "number") return v === 1;
  return false;
}

// Prefer explicit keeper fields from week-1 roster mapping.
// Fallback ONLY if those fields are missing.
function isKeptPlayer(pick) {
  if (!pick) return false;

  // Explicit fields (best)
  if (
    pick.is_keeper !== undefined ||
    pick.kept !== undefined ||
    pick.keeper !== undefined ||
    pick.isKept !== undefined ||
    pick.kept_player !== undefined
  ) {
    return (
      normalizeBool(pick.is_keeper) ||
      normalizeBool(pick.kept) ||
      normalizeBool(pick.keeper) ||
      normalizeBool(pick.isKept) ||
      normalizeBool(pick.kept_player)
    );
  }

  // Optional explicit tag from server
  if (typeof pick.source === "string" && pick.source.toLowerCase().includes("keeper")) return true;

  // Fallback heuristic (only if server gave us no keeper fields):
  // If name still looks like a Yahoo player_key, it probably wasn't mapped.
  const name = String(pick.player_name || "");
  const key = String(pick.player_key || "");
  if (!name) return false;
  if (name === key) return true;
  if (/^\d+\.\w+\.\d+\.p\.\d+$/.test(name)) return true;
  if (/^\d+\.\w+\.\d+\.p\.\d+$/.test(key) && name === key) return true;

  return false;
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

  const { draftOrder, rounds, meta } = data;
  const teamsByKey = data.teamsByKey || data.teams || {}; // support either name

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

  // ===== Header row (aligned with grid) =====
  const header = el("div", "draft-grid-header");
  header.style.setProperty("--cols", String(draftOrder.length));

  // left corner cell
  header.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const teamMeta = teamsByKey?.[teamKey] || {};
    const th = el("div", "draft-team-header");

    const top = el("div", "draft-team-top");
    const logoWrap = el("div", "draft-team-logo-wrap");

    if (teamMeta.logo_url) {
      const img = document.createElement("img");
      img.className = "draft-team-logo";
      img.alt = teamMeta.name || teamShort(teamKey);
      img.src = teamMeta.logo_url;
      img.loading = "lazy";
      logoWrap.appendChild(img);
    } else {
      // fallback circle with short code
      logoWrap.appendChild(el("div", "draft-team-logo-fallback", teamShort(teamKey)));
    }

    top.appendChild(logoWrap);

    const nameWrap = el("div", "draft-team-name-wrap");
    nameWrap.appendChild(el("div", "draft-team-name", teamMeta.name || teamShort(teamKey)));
    nameWrap.appendChild(el("div", "draft-team-sub", teamShort(teamKey)));
    top.appendChild(nameWrap);

    th.appendChild(top);
    header.appendChild(th);
  }

  boardEl.appendChild(header);

  // ===== Body grid =====
  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(draftOrder.length));

  for (let r = 1; r <= (meta?.maxRound || 1); r++) {
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
        const topRow = el("div", "draft-pick-top");

        const left = el("div", "draft-pick-left");
        left.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));
        left.appendChild(
          el(
            "div",
            "draft-pick-meta",
            `${pick.player_pos || "—"}${pick.player_team ? " · " + pick.player_team : ""}`
          )
        );
        topRow.appendChild(left);

        // Keeper badge (ONLY when true)
        if (isKeptPlayer(pick)) {
          const badge = el("div", "draft-keeper-badge", "Kept");
          topRow.appendChild(badge);
        }

        cell.appendChild(topRow);

        const name = pick.player_name || pick.player_key || "Unknown";
        cell.appendChild(el("div", "draft-player-name", name));
      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }

  boardEl.appendChild(grid);
  setStatus(`Loaded ${meta?.totalPicks || 0} picks · ${meta?.maxRound || 0} rounds`);
}

loadDraftBoard();
