(function () {
  "use strict";

  var STORAGE_KEY = "beli_restaurants_v1";

  var BUCKETS = {
    liked: { label: "Liked", low: 7.0, high: 10.0, className: "score-liked" },
    fine: { label: "Fine", low: 4.0, high: 6.9, className: "score-fine" },
    disliked: { label: "Disliked", low: 1.0, high: 3.9, className: "score-disliked" }
  };

  /** @type {Array<Object>} */
  var restaurants = loadRestaurants();

  // In-flight ranking session state (comparison binary search)
  var rankingSession = null;

  // ---------- Persistence ----------

  function loadRestaurants() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRestaurants() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(restaurants));
    } catch (e) {
      // storage unavailable (private mode, quota) — fail silently, app still works in-memory
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- Ranking math ----------

  function bucketPeers(bucketKey, excludeId) {
    return restaurants
      .filter(function (r) { return r.status === "been" && r.bucket === bucketKey && r.id !== excludeId; })
      .sort(function (a, b) { return b.score - a.score; });
  }

  // Assigns scores to an explicitly ordered (best-to-worst) list of restaurants
  // within a bucket. Order must be provided by the caller (e.g. the binary
  // search insertion result) rather than re-derived by sorting on `score`,
  // since a newly ranked restaurant has no score yet.
  function assignBucketScores(bucketKey, orderedPeers) {
    var def = BUCKETS[bucketKey];
    var n = orderedPeers.length;
    if (n === 0) return;
    if (n === 1) {
      orderedPeers[0].score = round1((def.low + def.high) / 2);
      return;
    }
    for (var i = 0; i < n; i++) {
      var score = def.high - (i / (n - 1)) * (def.high - def.low);
      orderedPeers[i].score = round1(score);
    }
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  // ---------- Rendering ----------

  var els = {};

  function cacheEls() {
    els.searchInput = document.getElementById("searchInput");
    els.addBtn = document.getElementById("addBtn");
    els.tabs = document.querySelectorAll(".tab");
    els.statsBar = document.getElementById("statsBar");
    els.beenPanel = document.getElementById("beenPanel");
    els.wantPanel = document.getElementById("wantPanel");

    els.addModal = document.getElementById("addModal");
    els.addModalTitle = document.getElementById("addModalTitle");
    els.addForm = document.getElementById("addForm");
    els.fName = document.getElementById("fName");
    els.fCuisine = document.getElementById("fCuisine");
    els.fCity = document.getElementById("fCity");
    els.fNotes = document.getElementById("fNotes");
    els.cancelAdd = document.getElementById("cancelAdd");

    els.sentimentModal = document.getElementById("sentimentModal");
    els.sentimentName = document.getElementById("sentimentName");

    els.compareModal = document.getElementById("compareModal");
    els.compareBucketLabel = document.getElementById("compareBucketLabel");
    els.compareLeft = document.getElementById("compareLeft");
    els.compareRight = document.getElementById("compareRight");
    els.compareTie = document.getElementById("compareTie");

    els.toast = document.getElementById("toast");
  }

  var activeTab = "been";
  var searchTerm = "";
  var editingId = null; // set when add modal is used for editing want-to-try entries

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function matchesSearch(r) {
    if (!searchTerm) return true;
    var hay = (r.name + " " + r.cuisine + " " + r.city).toLowerCase();
    return hay.indexOf(searchTerm) !== -1;
  }

  function render() {
    renderStats();
    renderBeen();
    renderWant();
  }

  function renderStats() {
    var been = restaurants.filter(function (r) { return r.status === "been"; });
    var want = restaurants.filter(function (r) { return r.status === "want"; });
    var avg = been.length
      ? round1(been.reduce(function (s, r) { return s + r.score; }, 0) / been.length)
      : null;
    var top = been.slice().sort(function (a, b) { return b.score - a.score; })[0];

    var chips = [];
    chips.push('<span class="stat-chip"><strong>' + been.length + '</strong> been</span>');
    chips.push('<span class="stat-chip"><strong>' + want.length + '</strong> want to try</span>');
    if (avg !== null) chips.push('<span class="stat-chip">avg score <strong>' + avg.toFixed(1) + '</strong></span>');
    if (top) chips.push('<span class="stat-chip">top pick <strong>' + escapeHtml(top.name) + '</strong></span>');
    els.statsBar.innerHTML = chips.join("");
  }

  function renderBeen() {
    var list = restaurants
      .filter(function (r) { return r.status === "been" && matchesSearch(r); })
      .sort(function (a, b) { return b.score - a.score; });

    if (!list.length) {
      els.beenPanel.innerHTML = emptyState("🍽️", "No ranked restaurants yet", "Add a place you've been to start building your rankings.");
      return;
    }

    els.beenPanel.innerHTML = list.map(function (r, idx) {
      var badgeClass = BUCKETS[r.bucket].className;
      return (
        '<div class="card" data-id="' + r.id + '">' +
          '<div class="rank-num">' + (idx + 1) + '</div>' +
          '<div class="card-body">' +
            '<div class="card-title-row">' +
              '<p class="card-title">' + escapeHtml(r.name) + '</p>' +
              '<span class="score-badge ' + badgeClass + '">' + r.score.toFixed(1) + '</span>' +
            '</div>' +
            '<div class="card-tags">' + [escapeHtml(r.cuisine), escapeHtml(r.city)].filter(Boolean).join(" · ") + '</div>' +
            (r.notes ? '<p class="card-notes">' + escapeHtml(r.notes) + '</p>' : "") +
            '<div class="card-actions">' +
              '<button class="icon-btn" data-action="rerank" data-id="' + r.id + '">Re-rank</button>' +
              '<button class="icon-btn" data-action="delete" data-id="' + r.id + '">Delete</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join("");
  }

  function renderWant() {
    var list = restaurants
      .filter(function (r) { return r.status === "want" && matchesSearch(r); })
      .sort(function (a, b) { return b.addedAt - a.addedAt; });

    if (!list.length) {
      els.wantPanel.innerHTML = emptyState("📝", "Nothing on your list yet", "Add somewhere you're excited to try.");
      return;
    }

    els.wantPanel.innerHTML = list.map(function (r) {
      return (
        '<div class="card" data-id="' + r.id + '">' +
          '<div class="card-body">' +
            '<div class="card-title-row">' +
              '<p class="card-title">' + escapeHtml(r.name) + '</p>' +
            '</div>' +
            '<div class="card-tags">' + [escapeHtml(r.cuisine), escapeHtml(r.city)].filter(Boolean).join(" · ") + '</div>' +
            (r.notes ? '<p class="card-notes">' + escapeHtml(r.notes) + '</p>' : "") +
            '<div class="card-actions">' +
              '<button class="icon-btn" data-action="markBeen" data-id="' + r.id + '">Mark as Been</button>' +
              '<button class="icon-btn" data-action="delete" data-id="' + r.id + '">Delete</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join("");
  }

  function emptyState(icon, title, sub) {
    return (
      '<div class="empty-state">' +
        '<div class="big">' + icon + '</div>' +
        '<div class="title">' + title + '</div>' +
        '<div>' + sub + '</div>' +
      '</div>'
    );
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { els.toast.classList.add("hidden"); }, 2200);
  }

  // ---------- Tabs ----------

  function switchTab(tab) {
    activeTab = tab;
    els.tabs.forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    els.beenPanel.classList.toggle("active", tab === "been");
    els.wantPanel.classList.toggle("active", tab === "want");
  }

  // ---------- Add / Edit flow ----------

  function openAddModal() {
    editingId = null;
    els.addModalTitle.textContent = "Add a Restaurant";
    els.addForm.reset();
    els.addModal.classList.remove("hidden");
    els.fName.focus();
  }

  function closeAddModal() {
    els.addModal.classList.add("hidden");
  }

  function handleAddSubmit(e) {
    e.preventDefault();
    var name = els.fName.value.trim();
    if (!name) return;
    var cuisine = els.fCuisine.value.trim();
    var city = els.fCity.value.trim();
    var notes = els.fNotes.value.trim();
    var status = els.addForm.querySelector('input[name="fStatus"]:checked').value;

    var restaurant = {
      id: uid(),
      name: name,
      cuisine: cuisine,
      city: city,
      notes: notes,
      status: "want",
      bucket: null,
      score: 0,
      addedAt: Date.now()
    };
    restaurants.push(restaurant);
    saveRestaurants();
    closeAddModal();

    if (status === "been") {
      startRankingFlow(restaurant.id);
    } else {
      render();
      showToast("Added to Want to Try");
    }
  }

  // ---------- Ranking flow (sentiment -> binary search comparisons) ----------

  function startRankingFlow(restaurantId) {
    var r = restaurants.find(function (x) { return x.id === restaurantId; });
    if (!r) return;
    els.sentimentName.textContent = r.name;
    els.sentimentModal.dataset.restaurantId = restaurantId;
    els.sentimentModal.classList.remove("hidden");
  }

  function onSentimentChosen(bucketKey) {
    var restaurantId = els.sentimentModal.dataset.restaurantId;
    els.sentimentModal.classList.add("hidden");

    var r = restaurants.find(function (x) { return x.id === restaurantId; });
    if (!r) return;
    r.status = "been";
    r.bucket = bucketKey;

    var peers = bucketPeers(bucketKey, r.id);
    if (peers.length === 0) {
      assignBucketScores(bucketKey, [r]);
      saveRestaurants();
      render();
      showToast(r.name + " added to your rankings");
      return;
    }

    rankingSession = {
      restaurantId: restaurantId,
      bucketKey: bucketKey,
      peers: peers,
      lo: 0,
      hi: peers.length
    };
    presentNextComparison();
  }

  function presentNextComparison() {
    var s = rankingSession;
    if (!s) return;
    if (s.lo >= s.hi) {
      finishRankingSession(s.lo);
      return;
    }
    var mid = Math.floor((s.lo + s.hi) / 2);
    var candidate = restaurants.find(function (x) { return x.id === s.restaurantId; });
    var opponent = s.peers[mid];

    els.compareBucketLabel.textContent = BUCKETS[s.bucketKey].label;
    els.compareLeft.innerHTML = escapeHtml(candidate.name) + '<span class="sub">' + escapeHtml(candidate.cuisine || "") + '</span>';
    els.compareRight.innerHTML = escapeHtml(opponent.name) + '<span class="sub">' + escapeHtml(opponent.cuisine || "") + '</span>';
    els.compareModal.dataset.mid = String(mid);
    els.compareModal.classList.remove("hidden");
  }

  function onComparisonChoice(choice) {
    var s = rankingSession;
    if (!s) return;
    var mid = parseInt(els.compareModal.dataset.mid, 10);

    if (choice === "left") {
      // candidate is better than opponent -> candidate ranks above mid
      s.hi = mid;
    } else if (choice === "right") {
      // opponent is better -> candidate ranks below mid
      s.lo = mid + 1;
    } else {
      // tie -> insert right here, stop searching
      s.lo = mid;
      s.hi = mid;
    }

    els.compareModal.classList.add("hidden");
    presentNextComparison();
  }

  function finishRankingSession(insertIndex) {
    var s = rankingSession;
    var candidate = restaurants.find(function (x) { return x.id === s.restaurantId; });
    s.peers.splice(insertIndex, 0, candidate);
    assignBucketScores(s.bucketKey, s.peers);
    saveRestaurants();
    rankingSession = null;
    render();
    showToast(candidate.name + " ranked!");
  }

  // ---------- Card actions ----------

  function handlePanelClick(e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id;

    if (action === "delete") {
      restaurants = restaurants.filter(function (r) { return r.id !== id; });
      saveRestaurants();
      render();
      showToast("Deleted");
    } else if (action === "markBeen") {
      startRankingFlow(id);
    } else if (action === "rerank") {
      var r = restaurants.find(function (x) { return x.id === id; });
      if (!r) return;
      // Pull it out of its current bucket and rescale the peers left behind,
      // then re-run the sentiment + comparison flow from scratch.
      var oldBucket = r.bucket;
      r.bucket = null;
      if (oldBucket) {
        assignBucketScores(oldBucket, bucketPeers(oldBucket, r.id));
      }
      saveRestaurants();
      startRankingFlow(id);
    }
  }

  // ---------- Wire up ----------

  function init() {
    cacheEls();

    els.tabs.forEach(function (btn) {
      btn.addEventListener("click", function () { switchTab(btn.dataset.tab); });
    });

    els.addBtn.addEventListener("click", openAddModal);
    els.cancelAdd.addEventListener("click", closeAddModal);
    els.addModal.addEventListener("click", function (e) {
      if (e.target === els.addModal) closeAddModal();
    });
    els.addForm.addEventListener("submit", handleAddSubmit);

    els.sentimentModal.addEventListener("click", function (e) {
      var btn = e.target.closest(".sentiment-btn");
      if (btn) onSentimentChosen(btn.dataset.sentiment);
    });

    els.compareLeft.addEventListener("click", function () { onComparisonChoice("left"); });
    els.compareRight.addEventListener("click", function () { onComparisonChoice("right"); });
    els.compareTie.addEventListener("click", function () { onComparisonChoice("tie"); });

    els.beenPanel.addEventListener("click", handlePanelClick);
    els.wantPanel.addEventListener("click", handlePanelClick);

    els.searchInput.addEventListener("input", function () {
      searchTerm = els.searchInput.value.trim().toLowerCase();
      render();
    });

    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
