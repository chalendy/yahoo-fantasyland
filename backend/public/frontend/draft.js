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
// Toggle UI
// -------------------------
let keeperToggleState = {
  enabled: false,
  ready: false,
};

function ensureToggleUI() {
  const host =
    document.querySelector(".button-row") ||
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

  if (host.classList?.contains("button-row")) {
    host.appendChild(wrap);
  } else {
    boardEl?.parentNode?.insertBefore(wrap, boardEl);
  }
}

function setToggleReady(isReady) {
  keeperToggleState.ready = !!isReady;
  const cb = document.getElementById("keeperEligibleToggle");
  if (!cb) return;

  cb.disabled = !isReady;
  cb.title = isReady
    ? ""
    : "Eligibility needs current rosters + movedPlayers included in /draftboard-data.";
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

      // Eligible if:
      // - drafted round >= 6
      // - still on same team's roster NOW
      // - NOT a keeper already
      // - NEVER dropped/traded (movedSet)
      let isEligible = false;
      if (canComputeEligibility) {
        const roster = rosterSets[teamKey];
        const roundNum = Number(pick.round);
        const playerKey = String(pick.player_key || "");
        const neverMoved = !movedSet.has(playerKey);

        // IMPORTANT: keepers are NOT eligible to be kept again
        isEligible =
          roundNum >= 6 &&
          !!roster?.has(playerKey) &&
          !pick.is_keeper &&
          neverMoved;
      }

      // If toggle ON: dim non-eligible
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

      // Reserve badge slots so NOTHING shifts.
      // Use visibility (not display) to keep layout stable.
      const keeperBadge = el("span", "draft-keeper-badge", "Keeper");
      keeperBadge.style.visibility = pick.is_keeper ? "visible" : "hidden";

      const eligibleBadge = el("span", "draft-keeper-badge", "Eligible");
      const showEligible =
        keeperToggleState.enabled && canComputeEligibility && isEligible && !pick.is_keeper;
      eligibleBadge.style.visibility = showEligible ? "visible" : "hidden";

      left.appendChild(keeperBadge);
      left.appendChild(eligibleBadge);

      const metaText = `${pick.player_pos || ""}${pick.player_team ? " · " + pick.player_team : ""}`.trim();
      const right = el("div", "draft-pick-meta", metaText);

      top.appendChild(left);
      top.appendChild(right);

      // Player row (portrait + name)
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
