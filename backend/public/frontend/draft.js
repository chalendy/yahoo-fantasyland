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

// -------------------------
// Team meta helpers
// -------------------------
function getTeamMeta(data, teamKey) {
  const sources = [
    data?.teamsByKey,
    data?.teams,
    data?.teamMeta,
    data?.teamMap,
    data?.teamsByKeyMap,
    data?.teamsByKey,
  ];
  for (const src of sources) {
    if (src && typeof src === "object" && src[teamKey]) return src[teamKey];
  }
  return null;
}

function teamShort(teamKey) {
  const m = String(teamKey).match(/\.t\.(\d+)$/);
  return m ? `T${m[1]}` : teamKey;
}

// -------------------------
// Eligibility helpers
// -------------------------
function getCurrentRostersMap(data) {
  return (
    data?.currentRostersByTeamKey ||
    data?.rostersByTeamKey ||
    data?.rosters ||
    data?.current_rosters ||
    null
  );
}

function normalizeRosterMap(rostersMap) {
  if (!rostersMap || typeof rostersMap !== "object") return null;

  const out = {};
  for (const [teamKey, arr] of Object.entries(rostersMap)) {
    if (Array.isArray(arr)) out[teamKey] = new Set(arr.filter(Boolean).map(String));
    else if (arr && typeof arr === "object" && Array.isArray(arr.players)) {
      out[teamKey] = new Set(arr.players.filter(Boolean).map(String));
    }
  }
  return out;
}

function getMovedPlayersSet(data) {
  const raw = data?.movedPlayers;
  if (!Array.isArray(raw)) return null;
  return new Set(raw.filter(Boolean).map(String));
}

// -------------------------
// Position styling helpers (adds classes so your CSS can color them)
// -------------------------
function normPos(pos) {
  const p = String(pos || "").trim().toUpperCase();
  if (!p) return "";
  // normalize common Yahoo flex labels
  if (p === "W/R/T" || p === "WRT") return "FLEX";
  if (p === "W/R" || p === "WR/RB") return "FLEX";
  return p;
}

function applyPositionClass(cell, pos) {
  const p = normPos(pos);

  // remove any old position classes
  cell.classList.remove(
    "pos-qb",
    "pos-rb",
    "pos-wr",
    "pos-te",
    "pos-k",
    "pos-def",
    "pos-dst",
    "pos-flex",
    "pos-bench",
    "pos-ir"
  );

  // add new
  if (p === "QB") cell.classList.add("pos-qb");
  else if (p === "RB") cell.classList.add("pos-rb");
  else if (p === "WR") cell.classList.add("pos-wr");
  else if (p === "TE") cell.classList.add("pos-te");
  else if (p === "K") cell.classList.add("pos-k");
  else if (p === "DEF" || p === "DST" || p === "D/ST") cell.classList.add("pos-def");
  else if (p === "FLEX") cell.classList.add("pos-flex");
  else if (p === "BN" || p === "BENCH") cell.classList.add("pos-bench");
  else if (p === "IR") cell.classList.add("pos-ir");
}

// -------------------------
// Toggle UI (own line support)
// -------------------------
let keeperToggleState = {
  enabled: false,
  ready: false,
};

function ensureToggleUI() {
  // Prefer a dedicated host if you added one (recommended):
  // <div id="draftHeaderToggles"></div>
  const host =
    document.getElementById("draftHeaderToggles") ||
    document.querySelector(".controls-card") ||
    document.querySelector(".app-header") ||
    document.body;

  if (document.getElementById("keeperEligibleToggle")) return;

  const wrap = el("label", "btn btn-secondary");
  wrap.style.display = "inline-flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "8px";
  wrap.style.userSelect = "none";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.id = "keeperEligibleToggle";
  cb.style.margin = "0";
  cb.style.transform = "translateY(1px)";

  const txt = el(
    "span",
    "",
    "Show keeper-eligible (Rd 6+ · still rostered · never dropped/traded · not a keeper)"
  );

  wrap.appendChild(cb);
  wrap.appendChild(txt);

  cb.addEventListener("change", () => {
    keeperToggleState.enabled = cb.checked;
    if (window.__draftDataCache) renderBoard(window.__draftDataCache);
  });

  // If host is the special toggles container, keep it on its own line
  if (host?.id === "draftHeaderToggles") {
    wrap.style.marginTop = "8px";
    host.appendChild(wrap);
  } else {
    // fallback: insert above board
    boardEl?.parentNode?.insertBefore(wrap, boardEl);
  }
}

function setToggleReady(isReady) {
  keeperToggleState.ready = !!isReady;
  const cb = document.getElementById("keeperEligibleToggle");
  if (!cb) return;

  cb.disabled = !isReady;
  cb.title = isReady ? "" : "Eligibility needs current rosters + movedPlayers in /draftboard-data.";
}

// -------------------------
// Main loader
// -------------------------
async function loadDraftBoard() {
  ensureToggleUI();

  setStatus("Loading draft board…");
  boardEl.innerHTML = "";
  window.__draftDataCache = null;

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

  window.__draftDataCache = data;

  const rosterSets = normalizeRosterMap(getCurrentRostersMap(data));
  const movedSet = getMovedPlayersSet(data);
  setToggleReady(!!rosterSets && !!movedSet);

  renderBoard(data);
}

// -------------------------
// Rendering
// -------------------------
function renderBoard(data) {
  boardEl.innerHTML = "";

  const { draftOrder, rounds, meta } = data || {};
  if (!Array.isArray(draftOrder) || !draftOrder.length || !Array.isArray(rounds) || !rounds.length) {
    setStatus("Draft data looks empty.");
    return;
  }

  // round -> team_key -> pick
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of (r?.picks || [])) m.set(p.team_key, p);
    byRoundTeam.set(Number(r.round), m);
  }

  const rosterSets = normalizeRosterMap(getCurrentRostersMap(data));
  const movedSet = getMovedPlayersSet(data);
  const canComputeEligibility = !!rosterSets && !!movedSet;

  boardEl.style.setProperty("--cols", String(draftOrder.length));

  // Header
  const header = el("div", "draft-grid-header");
  header.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const metaObj = getTeamMeta(data, teamKey);

    const name =
      metaObj?.name ||
      metaObj?.team_name ||
      metaObj?.teamName ||
      metaObj?.team ||
      teamShort(teamKey);

    const logo =
      metaObj?.logo ||
      metaObj?.logo_url ||
      metaObj?.logoUrl ||
      metaObj?.team_logo ||
      metaObj?.teamLogo ||
      null;

    const th = el("div", "draft-team-header");

    if (logo) {
      const img = document.createElement("img");
      img.src = logo;
      img.alt = name;
      img.loading = "lazy";
      th.appendChild(img);
    }

    th.appendChild(el("div", "draft-team-name", name));
    header.appendChild(th);
  }

  boardEl.appendChild(header);

  // Body
  const grid = el("div", "draft-grid");

  const maxRound =
    Number(meta?.maxRound) ||
    Math.max(...rounds.map((r) => Number(r.round || 0)));

  for (let r = 1; r <= maxRound; r++) {
    const row = el("div", "draft-row");
    row.appendChild(el("div", "draft-round-cell", `R${r}`));

    const map = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-pick-empty", "—"));
        row.appendChild(cell);
        continue;
      }

      // Apply position color classes (restores your CSS-based position colors)
      applyPositionClass(cell, pick.player_pos);

      // Eligible if:
      // - drafted round >= 6
      // - still on same team's roster NOW
      // - NOT a keeper
      // - NEVER dropped/traded (movedSet contains moved player_keys)
      let isEligible = false;
      if (canComputeEligibility) {
        const roster = rosterSets[teamKey];
        const roundNum = Number(pick.round);
        const playerKey = String(pick.player_key || "");
        const neverMoved = !movedSet.has(playerKey);

        isEligible =
          roundNum >= 6 &&
          !!roster?.has(playerKey) &&
          !pick.is_keeper &&
          neverMoved;
      }

      // Toggle effect: dim non-eligible (but NEVER dim keepers just because)
      if (keeperToggleState.enabled && canComputeEligibility && !isEligible) {
        cell.style.opacity = "0.25";
        cell.style.filter = "grayscale(0.35)";
      } else {
        cell.style.opacity = "";
        cell.style.filter = "";
      }

      // Top row
      const top = el("div", "draft-pick-top");

      const left = el("div", "draft-pick-left");
      left.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

// We reserve badge space with ONE badge element so names align.
// Then we show either "Keeper" or "Eligible" (never both).
const badge = el("span", "draft-keeper-badge", "");
badge.classList.add("is-placeholder");

// Reset any prior type classes
badge.classList.remove("is-keeper", "is-eligible");

// Determine which badge should be shown
if (pick.is_keeper) {
  badge.textContent = "Keeper";
  badge.classList.add("is-keeper");
  badge.style.visibility = "visible";
} else if (keeperToggleState.enabled && canComputeEligibility && isEligible) {
  badge.textContent = "Eligible";
  badge.classList.add("is-eligible");
  badge.style.visibility = "visible";
} else {
  // placeholder (takes space, but not visible, prevents shifting)
  // Use the longer word so reserved width is stable
  badge.textContent = "Eligible";
  badge.style.visibility = "hidden";
}

left.appendChild(badge);


      const metaText = `${pick.player_pos || ""}${pick.player_team ? " · " + pick.player_team : ""}`.trim();
      const right = el("div", "draft-pick-meta", metaText);

      top.appendChild(left);
      top.appendChild(right);

      // Player row: portrait + name
      const playerRow = el("div", "draft-player-row");
      playerRow.style.display = "flex";
      playerRow.style.alignItems = "center";
      playerRow.style.gap = "8px";

      if (pick.player_headshot) {
        const img = document.createElement("img");
        img.src = pick.player_headshot;
        img.alt = pick.player_name || "Player";
        img.loading = "lazy";
        img.style.width = "28px";
        img.style.height = "28px";
        img.style.borderRadius = "50%";
        img.style.objectFit = "cover";
        img.style.border = "1px solid rgba(255,255,255,0.18)";
        img.style.background = "rgba(0,0,0,0.25)";
        playerRow.appendChild(img);
      }

      playerRow.appendChild(el("div", "draft-player-name", pick.player_name || "—"));

      cell.appendChild(top);
      cell.appendChild(playerRow);

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }

  boardEl.appendChild(grid);

  const total = Number(meta?.totalPicks) || 0;

  if (keeperToggleState.enabled) {
    if (!canComputeEligibility) {
      setStatus("Toggle needs current rosters + movedPlayers included in /draftboard-data to calculate eligibility.");
    } else {
      setStatus(`Showing keeper eligibility · ${total || "?"} picks · ${maxRound} rounds`);
    }
  } else {
    setStatus(`Loaded ${total || "?"} picks · ${maxRound} rounds`);
  }
}

loadDraftBoard();
