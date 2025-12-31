// draft.js

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

function teamShort(teamKey) {
  // "461.l.38076.t.7" -> "T7"
  const m = String(teamKey || "").match(/\.t\.(\d+)$/);
  return m ? `T${m[1]}` : String(teamKey || "");
}

async function loadDraftBoard() {
  setStatus("Loading draft board…");
  if (boardEl) boardEl.innerHTML = "";

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
  if (!Array.isArray(draftOrder) || !draftOrder.length || !Array.isArray(rounds) || !rounds.length) {
    setStatus("Draft data looks empty.");
    return;
  }

  // teams may come back as:
  // - an object map: { "461...t.1": { name, logo_url } }
  // - or an array: [ { team_key, name, logo_url } ]
  const teamsByKey = new Map();
  if (teams && typeof teams === "object" && !Array.isArray(teams)) {
    for (const [k, v] of Object.entries(teams)) {
      if (v) teamsByKey.set(k, v);
    }
  } else if (Array.isArray(teams)) {
    for (const t of teams) {
      if (t?.team_key) teamsByKey.set(t.team_key, t);
    }
  }

  // Build lookup: round -> team_key -> pick info
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of r.picks || []) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  // Wrapper (if you’re using the CSS that enables horizontal scroll)
  const wrapper = el("div", "draft-board-wrapper");

  // Grid container
  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(draftOrder.length));

  // =========================
  // Header row
  // =========================
  const header = el("div", "draft-grid-header");
  header.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const team = teamsByKey.get(teamKey) || {};
    const th = el("div", "draft-team-header");

    // logo
    if (team.logo_url) {
      const img = document.createElement("img");
      img.src = team.logo_url;
      img.alt = team.name ? `${team.name} logo` : teamShort(teamKey);
      img.loading = "lazy";
      th.appendChild(img);
    }

    // name
    th.appendChild(el("div", "draft-team-name", team.name || teamShort(teamKey)));

    // optional short label (if you like it)
    th.appendChild(el("div", "draft-team-key", teamShort(teamKey)));

    header.appendChild(th);
  }

  grid.appendChild(header);

  // =========================
  // Body (rounds as rows)
  // =========================
  for (let r = 1; r <= (meta?.maxRound || 0); r++) {
    const row = el("div", "draft-row");
    row.style.setProperty("--cols", String(draftOrder.length));

    // round label
    row.appendChild(el("div", "draft-round-cell", `R${r}`));

    const map = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-pick-empty", "—"));
      } else {
        // top meta row
        const top = el("div", "draft-pick-top");

        // LEFT: pick number + keeper badge (same line)
        const left = el("div", "draft-pick-left");
        left.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        if (pick.is_keeper) {
          const badge = el("span", "draft-keeper-badge", "Keeper");
          // keep this short so it fits in tight cells
          left.appendChild(badge);
        }

        // RIGHT: position/team
        const rightMeta = `${pick.player_pos || ""}${pick.player_team ? " · " + pick.player_team : ""}`.trim();
        top.appendChild(left);
        top.appendChild(el("div", "draft-pick-meta", rightMeta || ""));

        cell.appendChild(top);

        // player name
        cell.appendChild(el("div", "draft-player-name", pick.player_name || pick.player_key));

      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }

  wrapper.appendChild(grid);
  boardEl.appendChild(wrapper);

  setStatus(`Loaded ${meta?.totalPicks ?? 0} picks · ${meta?.maxRound ?? 0} rounds`);
}

loadDraftBoard();
