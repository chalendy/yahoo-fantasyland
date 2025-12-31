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
    data?.teamsByKeyMap,
    data?.teams,
    data?.teamMeta,
    data?.teamMap,
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
// Rosters map helpers (current rosters)
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
  // Ensure team_key -> Set(player_key)
  if (!rostersMap || typeof rostersMap !== "object") return null;

  const out = {};
  for (const [teamKey, arr] of Object.entries(rostersMap)) {
    if (Array.isArray(arr)) {
      out[teamKey] = new Set(arr.filter(Boolean).map(String));
    } else if (arr && typeof arr === "object" && Array.isArray(arr.players)) {
      out[teamKey] = new Set(arr.players.filter(Boolean).map(String));
    }
  }
  return out;
}

// -------------------------
// Dropped / traded disqualifier helpers
// We try multiple shapes that your server might return.
// Supported patterns (any one):
//   data.disqualifiedByTeamKey[team_key] = ["461.p.x", ...]
//   data.droppedOrTradedByTeamKey[team_key] = ["461.p.x", ...]
//   data.playerMoveDisqualifyByTeamKey[team_key] = ["461.p.x", ...]
//   data.disqualifiedPlayerKeys = ["461.p.x", ...] (global)
//   data.playerMovesByTeamKey[team_key][player_key] = { dropped:true, traded:true } or boolean
//   pick.was_dropped_or_traded / pick.was_dropped / pick.was_traded (per-pick flags)
// -------------------------
function getDisqualifyMap(data) {
  return (
    data?.disqualifiedByTeamKey ||
    data?.droppedOrTradedByTeamKey ||
    data?.playerMoveDisqualifyByTeamKey ||
    data?.disqualified_by_team ||
    null
  );
}

function normalizeDisqualifyMap(raw) {
  // team_key -> Set(player_key)
  if (!raw || typeof raw !== "object") return null;

  const out = {};
  for (const [teamKey, v] of Object.entries(raw)) {
    if (Array.isArray(v)) {
      out[teamKey] = new Set(v.filter(Boolean).map(String));
    } else if (v && typeof v === "object") {
      // maybe { players: [...] }
      if (Array.isArray(v.players)) out[teamKey] = new Set(v.players.filter(Boolean).map(String));
      // maybe { "461.p.x": true, ... }
      else out[teamKey] = new Set(Object.keys(v).map(String));
    }
  }
  return out;
}

function getGlobalDisqualifySet(data) {
  const arr =
    data?.disqualifiedPlayerKeys ||
    data?.disqualified_player_keys ||
    data?.droppedOrTradedPlayerKeys ||
    null;

  if (Array.isArray(arr)) return new Set(arr.filter(Boolean).map(String));
  return null;
}

function pickIsDisqualified(pick, teamKey, disqualifyByTeamSet, globalDisqualifySet) {
  // Per-pick flags from server (strongest, simplest)
  if (pick?.was_dropped_or_traded === true) return true;
  if (pick?.was_dropped === true) return true;
  if (pick?.was_traded === true) return true;

  const pk = String(pick?.player_key || "");
  if (!pk) return false;

  if (globalDisqualifySet?.has(pk)) return true;

  const teamSet = disqualifyByTeamSet?.[teamKey];
  if (teamSet?.has(pk)) return true;

  return false;
}

// -------------------------
// Toggle UI (moved to its own header line)
// -------------------------
let keeperToggleState = {
  enabled: false,
  ready: false,
};

function ensureToggleUI() {
  // avoid duplicating
  if (document.getElementById("keeperEligibleToggle")) return;

  // We want it on its own line in the header.
  // Try common wrappers in your page:
  const headerHost =
    document.querySelector(".app-header") ||
    document.querySelector("header") ||
    document.body;

  // Create a full-width row under the header content
  let row = document.getElementById("draftToggleRow");
  if (!row) {
    row = el("div", "draft-toggle-row");
    row.id = "draftToggleRow";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.flexWrap = "wrap";
    row.style.marginTop = "10px";

    // Insert AFTER the header block (so it's its own line)
    headerHost.appendChild(row);
  }

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

  const txt = el("span", "", "Show keeper-eligible (Rd 6+, rostered, not keeper, not dropped/traded)");
  wrap.appendChild(cb);
  wrap.appendChild(txt);

  cb.addEventListener("change", () => {
    keeperToggleState.enabled = cb.checked;
    if (window.__draftDataCache) renderBoard(window.__draftDataCache);
  });

  row.appendChild(wrap);
}

function setToggleReady(isReady) {
  keeperToggleState.ready = !!isReady;
  const cb = document.getElementById("keeperEligibleToggle");
  if (!cb) return;

  cb.disabled = !isReady;
  cb.title = isReady
    ? ""
    : "Roster/transaction eligibility data not included in /draftboard-data yet.";
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

  // "Ready" if we can compute eligibility (rosters + some dropped/trade signal OR per-pick flags)
  const rosterSets = normalizeRosterMap(getCurrentRostersMap(data));
  const disqualifySets = normalizeDisqualifyMap(getDisqualifyMap(data));
  const globalSet = getGlobalDisqualifySet(data);

  // If your server marks pick.was_dropped_or_traded, we can compute without maps too.
  const hasPerPickDisq =
    Array.isArray(data?.rounds) &&
    data.rounds.some((r) => (r?.picks || []).some((p) => p?.was_dropped_or_traded || p?.was_dropped || p?.was_traded));

  setToggleReady(!!rosterSets && (hasPerPickDisq || !!disqualifySets || !!globalSet));

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

  // Build lookup: round -> team_key -> pick info
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of (r?.picks || [])) m.set(p.team_key, p);
    byRoundTeam.set(Number(r.round), m);
  }

  // Eligibility inputs
  const rosterSets = normalizeRosterMap(getCurrentRostersMap(data));
  const disqualifyByTeamSet = normalizeDisqualifyMap(getDisqualifyMap(data));
  const globalDisqualifySet = getGlobalDisqualifySet(data);

  const canComputeEligibility = !!rosterSets && (keeperToggleState.ready || !!disqualifyByTeamSet || !!globalDisqualifySet);

  // Set cols for CSS (repeat(var(--cols), ...))
  boardEl.style.setProperty("--cols", String(draftOrder.length));

  // Header row
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

  // Body grid
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

      // League eligibility:
      // - drafted in Rd 6+
      // - still on that team's roster
      // - NOT a keeper (keepers cannot be kept again)
      // - NOT dropped or traded at any point (per transactions)
      let isEligible = false;

      if (canComputeEligibility) {
        const roster = rosterSets?.[teamKey];
        const roundNum = Number(pick.round);
        const playerKey = String(pick.player_key || "");

        const stillRostered = !!roster?.has(playerKey);
        const notKeeper = pick.is_keeper !== true;
        const notMoved = !pickIsDisqualified(pick, teamKey, disqualifyByTeamSet, globalDisqualifySet);

        isEligible = roundNum >= 6 && stillRostered && notKeeper && notMoved;
      }

      // If toggle is ON and we can compute: dim non-eligible cells
      if (keeperToggleState.enabled && canComputeEligibility && !isEligible) {
        cell.style.opacity = "0.25";
        cell.style.filter = "grayscale(0.35)";
      } else {
        cell.style.opacity = "";
        cell.style.filter = "";
      }

      // Top row: pick # + badges on left, meta on right
      const top = el("div", "draft-pick-top");

      const left = el("div", "draft-pick-left");
      left.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

      // Keeper badge (from API logic)
      if (pick.is_keeper) {
        left.appendChild(el("span", "draft-keeper-badge", "Keeper"));
      }

      // Eligibility badge (show only when toggle ON)
      if (keeperToggleState.enabled && canComputeEligibility && isEligible) {
        left.appendChild(el("span", "draft-keeper-badge", "Eligible"));
      }

      const metaText = `${pick.player_pos || ""}${pick.player_team ? " · " + pick.player_team : ""}`.trim();
      const right = el("div", "draft-pick-meta", metaText);

      top.appendChild(left);
      top.appendChild(right);

      // Player row: portrait + name (portrait optional)
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
      setStatus("Toggle needs roster + transaction eligibility data in /draftboard-data to calculate eligibility.");
    } else {
      setStatus(`Showing keeper eligibility · ${total || "?"} picks · ${maxRound} rounds`);
    }
  } else {
    setStatus(`Loaded ${total || "?"} picks · ${maxRound} rounds`);
  }
}

loadDraftBoard();
