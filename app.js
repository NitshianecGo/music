/* MusicWave V2 - Full Music Search */
const C = window.MUSICWAVE_CONFIG || {};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const audio = $("#audio");

let sb = null, user = null;
let tracks = [], queue = [], queueIndex = -1;
let favs = [], history = [], playlists = [];
let currentTrackId = null;
let isPlaying = false;

// ========== UTILITY ==========
function esc(s = "") {
  return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

function toast(t) {
  const x = $("#toast");
  x.textContent = t;
  x.style.opacity = 1;
  x.style.transform = "translateY(0)";
  clearTimeout(x._timer);
  x._timer = setTimeout(() => {
    x.style.opacity = 0;
    x.style.transform = "translateY(8px)";
  }, 2500);
}

function cfgReady() {
  return C.supabaseUrl && C.supabaseAnonKey && !C.supabaseUrl.includes("YOUR_PROJECT") && C.supabaseAnonKey !== "PASTE_SUPABASE_ANON_KEY";
}

function ytReady() {
  return C.youtubeApiKey && C.youtubeApiKey !== "PASTE_YOUTUBE_API_KEY";
}

function img(u) {
  return u ? `<img src="${esc(u)}" loading="lazy" onerror="this.remove()">` : "♪";
}

function fmt(n) {
  n = Math.floor(n || 0);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

// ========== FAVORITES ==========
function isFav(id) {
  return favs.some(x => String(x.item_id) === String(id));
}

async function addFavorite(t) {
  if (isFav(t.id)) return;
  const row = {
    user_id: user?.id || "local",
    item_id: String(t.id),
    title: t.title,
    artist: t.artist || "",
    artwork: t.artwork || "",
    url: t.url || "",
    source: t.source || "music"
  };
  if (sb && user) await sb.from("favorites").insert(row);
  else { favs.push(row); localStorage.setItem("mw_favs", JSON.stringify(favs)); }
  favs.unshift(row);
  renderFavs();
  toast("❤️ Добавлено в избранное");
  updateUI();
}

async function removeFavorite(id) {
  if (sb && user) await sb.from("favorites").delete().eq("user_id", user.id).eq("item_id", String(id));
  favs = favs.filter(x => String(x.item_id) !== String(id));
  renderFavs();
  toast("💔 Удалено из избранного");
  updateUI();
}

// ========== SEARCH FUNCTIONS ==========
async function searchItunes(q) {
  try {
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=25`);
    const j = await r.json();
    return j.results.filter(x => x.previewUrl).map(x => ({
      id: "i" + x.trackId,
      title: x.trackName,
      artist: x.artistName,
      album: x.collectionName,
      artwork: x.artworkUrl100?.replace("100x100", "600x600"),
      url: x.previewUrl,
      source: "iTunes",
      duration: x.trackTimeMillis ? Math.floor(x.trackTimeMillis / 1000) : 30
    }));
  } catch (e) { return []; }
}

async function searchYouTube(q) {
  if (!ytReady()) return [];
  try {
    const u = new URL("https://www.googleapis.com/youtube/v3/search");
    u.search = new URLSearchParams({
      part: "snippet",
      q: q + " audio",
      type: "video",
      videoCategoryId: "10",
      maxResults: "20",
      key: C.youtubeApiKey
    });
    const r = await fetch(u);
    if (!r.ok) throw new Error("YouTube API error");
    const j = await r.json();
    return (j.items || []).map(x => ({
      id: "y" + x.id.videoId,
      title: x.snippet.title,
      artist: x.snippet.channelTitle,
      album: "YouTube",
      artwork: x.snippet.thumbnails?.high?.url || x.snippet.thumbnails?.default?.url,
      url: `https://www.youtube.com/watch?v=${x.id.videoId}`,
      source: "YouTube",
      youtubeId: x.id.videoId,
      duration: 0
    }));
  } catch (e) { return []; }
}

async function searchSoundCloud(q) {
  try {
    // Using public SoundCloud API endpoint
    const r = await fetch(`https://soundcloud.com/search/sounds?q=${encodeURIComponent(q)}&limit=20`);
    // Note: This is a simplified version - in production you'd want to use SoundCloud's API
    // For demo, we'll return empty array and use alternative sources
    return [];
  } catch (e) { return []; }
}

async function searchDeezer(q) {
  try {
    const r = await fetch(`https://api.deezer.com/search/track?q=${encodeURIComponent(q)}&limit=20`);
    const j = await r.json();
    return (j.data || []).map(x => ({
      id: "d" + x.id,
      title: x.title,
      artist: x.artist.name,
      album: x.album.title,
      artwork: x.album.cover_medium,
      url: x.preview,
      source: "Deezer",
      duration: Math.floor(x.duration || 30)
    }));
  } catch (e) { return []; }
}

async function searchMusic(q) {
  if (!q.trim()) return [];
  
  // Try multiple sources
  const sources = [
    searchItunes(q),
    searchDeezer(q),
    searchYouTube(q)
  ];
  
  const results = await Promise.allSettled(sources);
  let allTracks = [];
  
  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      allTracks = allTracks.concat(result.value);
    }
  });
  
  // Remove duplicates by title/artist
  const seen = new Set();
  allTracks = allTracks.filter(t => {
    const key = (t.title + t.artist).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  return allTracks;
}

async function searchAll(q, target) {
  if (!q.trim()) {
    $(target).innerHTML = '<div class="empty-state">🎵 Введите запрос для поиска</div>';
    return;
  }
  
  $(target).innerHTML = '<div class="empty-state">🔍 Ищем музыку по всем источникам...</div>';
  
  try {
    const results = await searchMusic(q);
    tracks = results;
    
    const container = $(target);
    container.className = target === "#searchResults" ? "track-list" : "track-grid";
    
    if (tracks.length) {
      container.innerHTML = tracks.map(target === "#searchResults" ? row : card).join("");
      bind(container);
      const sourceCount = new Set(tracks.map(t => t.source)).size;
      $("#searchStatus").textContent = `🎵 Найдено ${tracks.length} треков из ${sourceCount} источников`;
    } else {
      container.innerHTML = `<div class="empty-state">😕 Ничего не найдено по запросу "${esc(q)}"</div>`;
      $("#searchStatus").textContent = "Ничего не найдено";
    }
  } catch (e) {
    console.error(e);
    $(target).innerHTML = '<div class="empty-state">⚠️ Ошибка поиска. Проверьте подключение к интернету.</div>';
  }
}

// ========== UI RENDERING ==========
function row(t) {
  const id = String(t.id);
  const fav = isFav(id);
  const playing = currentTrackId === id && isPlaying;
  return `<div class="track-row">
    <div class="cover">${img(t.artwork)}</div>
    <div>
      <strong>${esc(t.title)}</strong>
      <span>${esc(t.artist)} • ${esc(t.source)} ${t.duration ? '• ' + fmt(t.duration) : ''}</span>
    </div>
    <button class="play-btn ${playing ? 'playing' : ''}" data-play="${esc(id)}">${playing ? '⏸' : '▶'}</button>
    <button class="fav-btn ${fav ? 'active' : ''}" data-fav="${esc(id)}">${fav ? '❤️' : '🤍'}</button>
  </div>`;
}

function card(t) {
  const id = String(t.id);
  const fav = isFav(id);
  const playing = currentTrackId === id && isPlaying;
  return `<article class="card">
    <div class="cover">${img(t.artwork)}</div>
    <h3>${esc(t.title)}</h3>
    <p>${esc(t.artist)}</p>
    <p style="font-size:11px;color:var(--muted)">${esc(t.source)}</p>
    <div class="card-actions">
      <button class="icon-btn play ${playing ? 'playing' : ''}" data-play="${esc(id)}">${playing ? '⏸' : '▶'}</button>
      <button class="icon-btn fav-btn ${fav ? 'active' : ''}" data-fav="${esc(id)}">${fav ? '❤️' : '🤍'}</button>
    </div>
  </article>`;
}

function bind(el) {
  el.querySelectorAll("[data-play]").forEach(b => {
    b.onclick = () => playById(b.dataset.play);
  });
  el.querySelectorAll("[data-fav]").forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      const id = b.dataset.fav;
      const t = [...tracks, ...favs, ...history].find(x => String(x.id || x.item_id) === String(id));
      if (t) {
        if (isFav(id)) {
          removeFavorite(id);
        } else {
          addFavorite(t);
        }
      }
    };
  });
}

function updateUI() {
  // Update all play buttons
  document.querySelectorAll('[data-play]').forEach(btn => {
    const id = btn.dataset.play;
    const playing = currentTrackId === id && isPlaying;
    btn.textContent = playing ? '⏸' : '▶';
    btn.classList.toggle('playing', playing);
  });
  
  // Update all fav buttons
  document.querySelectorAll('[data-fav]').forEach(btn => {
    const id = btn.dataset.fav;
    const fav = isFav(id);
    btn.textContent = fav ? '❤️' : '🤍';
    btn.classList.toggle('active', fav);
  });
}

// ========== PLAYER ==========
function playById(id) {
  const t = [...tracks, ...favs, ...history].find(x => String(x.id || x.item_id) === String(id));
  if (!t) { toast('Трек не найден'); return; }
  
  currentTrackId = String(t.id || t.item_id);
  
  // For YouTube - open in new tab
  if (t.source === "YouTube") {
    window.open(t.url, "_blank", "noopener");
    toast("📺 YouTube открыт в новой вкладке");
    saveHistory(t);
    return;
  }
  
  // For radio
  if (t.source === "Radio") {
    audio.src = t.url;
    $("#playerTitle").textContent = t.title;
    $("#playerArtist").textContent = t.artist || "Live Radio";
    $("#playerCover").textContent = "◉";
    audio.play().catch(() => {});
    saveHistory(t);
    isPlaying = true;
    updateUI();
    return;
  }
  
  // For music tracks
  if (t.url && t.url.startsWith('http')) {
    audio.src = t.url;
    $("#playerTitle").textContent = t.title;
    $("#playerArtist").textContent = t.artist;
    $("#playerCover").innerHTML = img(t.artwork);
    
    audio.play()
      .then(() => {
        isPlaying = true;
        saveHistory(t);
        updateUI();
      })
      .catch((e) => {
        console.error('Play error:', e);
        toast('⚠️ Не удалось воспроизвести трек');
      });
    
    // Set queue
    queue = tracks.length ? tracks : [t];
    queueIndex = queue.findIndex(x => String(x.id) === String(t.id));
  } else {
    toast('⚠️ Нет доступного аудио для этого трека');
  }
}

// ========== PLAYER CONTROLS ==========
$("#playBtn").onclick = () => {
  if (!audio.src) return;
  if (audio.paused) {
    audio.play();
    isPlaying = true;
    $("#playBtn").textContent = "Ⅱ";
  } else {
    audio.pause();
    isPlaying = false;
    $("#playBtn").textContent = "▶";
  }
  updateUI();
};

$("#nextBtn").onclick = () => {
  if (queue.length) {
    queueIndex = (queueIndex + 1) % queue.length;
    playById(queue[queueIndex].id);
  }
};

$("#prevBtn").onclick = () => {
  if (queue.length) {
    queueIndex = (queueIndex - 1 + queue.length) % queue.length;
    playById(queue[queueIndex].id);
  }
};

audio.onplay = () => {
  isPlaying = true;
  $("#playBtn").textContent = "Ⅱ";
  updateUI();
};

audio.onpause = () => {
  isPlaying = false;
  $("#playBtn").textContent = "▶";
  updateUI();
};

audio.onended = () => {
  isPlaying = false;
  $("#playBtn").textContent = "▶";
  updateUI();
  // Auto play next
  if (queue.length && queueIndex < queue.length - 1) {
    queueIndex++;
    playById(queue[queueIndex].id);
  }
};

audio.ontimeupdate = () => {
  $("#progress").value = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  $("#currentTime").textContent = fmt(audio.currentTime);
  if (audio.duration) {
    $("#duration").textContent = fmt(audio.duration);
  }
};

$("#progress").oninput = e => {
  if (audio.duration) audio.currentTime = (e.target.value / 100) * audio.duration;
};

// ========== VOLUME ==========
const savedVolume = Number(localStorage.getItem("mw_volume") || 80);
audio.volume = savedVolume / 100;
$("#volume").value = savedVolume;
$("#volumeValue").textContent = savedVolume + "%";

$("#volume").oninput = e => {
  const v = Number(e.target.value);
  audio.volume = v / 100;
  $("#volumeValue").textContent = v + "%";
  $("#volumeIcon").textContent = v === 0 ? "🔇" : v < 45 ? "🔉" : "🔊";
  localStorage.setItem("mw_volume", v);
};

// ========== NAVIGATION ==========
function show(v) {
  $$(".view").forEach(x => x.classList.add("hidden"));
  $(`#${v}View`).classList.remove("hidden");
  $$(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.view === v));
  // Close mobile menu
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-overlay')?.classList.remove('active');
}

$$(".nav-item").forEach(b => b.onclick = () => show(b.dataset.view));

// ========== MOBILE MENU ==========
const mobileMenu = document.getElementById("mobileMenu");
const sidebar = document.querySelector(".sidebar");
const overlay = document.createElement('div');
overlay.className = 'sidebar-overlay';
document.body.appendChild(overlay);

mobileMenu.onclick = (e) => {
  e.stopPropagation();
  sidebar.classList.toggle("open");
  overlay.classList.toggle("active");
};

overlay.onclick = () => {
  sidebar.classList.remove("open");
  overlay.classList.remove("active");
};

// ========== SEARCH ==========
$("#searchBtn").onclick = () => {
  const query = $("#searchInput").value.trim();
  if (!query) { toast('Введите запрос для поиска'); return; }
  show("search");
  searchAll(query, "#searchResults");
};

$("#searchInput").onkeydown = e => {
  if (e.key === "Enter") $("#searchBtn").click();
};

$("#heroSearch").onclick = () => {
  $("#searchInput").focus();
  show("search");
};

$("#discoverBtn").onclick = () => {
  searchAll("The Weeknd", "#homeResults");
};

// ========== THEME ==========
$("#themeBtn").onclick = () => {
  document.body.classList.toggle("light");
  localStorage.setItem("mw_theme", document.body.classList.contains("light") ? "light" : "dark");
};

if (localStorage.getItem("mw_theme") === "light") document.body.classList.add("light");

// ========== RADIO ==========
async function searchRadio(q = "") {
  const el = $("#radioResults");
  el.innerHTML = '<div class="empty-state">📻 Ищем станции...</div>';
  try {
    const r = await fetch(`https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(q)}&limit=36&hidebroken=true&order=clickcount&reverse=true`);
    if (!r.ok) throw new Error('Radio API error');
    const a = await r.json();
    if (a.length) {
      el.innerHTML = a.map(s => `
        <article class="radio-card">
          <img class="radio-logo" src="${esc(s.favicon || "")}" onerror="this.style.display='none'">
          <div>
            <strong>${esc(s.name)}</strong>
            <small>${esc(s.country || "World")} • ${esc(s.tags || "radio")}</small>
          </div>
          <button class="icon-btn play" data-radio="${esc(s.stationuuid)}">▶</button>
        </article>
      `).join("");
      el.querySelectorAll("[data-radio]").forEach(b => {
        b.onclick = () => playRadio(a.find(s => s.stationuuid === b.dataset.radio));
      });
    } else {
      el.innerHTML = "<div class='empty-state'>📻 Станций не найдено</div>";
    }
  } catch (e) {
    el.innerHTML = "<div class='empty-state'>⚠️ Радио API недоступно</div>";
    console.error(e);
  }
}

function playRadio(s) {
  const radioTrack = {
    id: 'radio_' + s.stationuuid,
    title: s.name,
    artist: s.country || 'World',
    artwork: s.favicon || '',
    url: s.url_resolved || s.url,
    source: 'Radio'
  };
  if (!tracks.find(t => t.id === radioTrack.id)) {
    tracks.push(radioTrack);
  }
  playById(radioTrack.id);
}

$("#radioBtn").onclick = () => {
  const query = $("#radioSearch").value.trim();
  searchRadio(query);
};

$("#radioSearch").onkeydown = e => {
  if (e.key === "Enter") $("#radioBtn").click();
};

// ========== FAVORITES & HISTORY ==========
function renderFavs() {
  const el = $("#favoriteResults");
  el.innerHTML = favs.length ?
    favs.map(x => row({ ...x, id: x.item_id, source: x.source || 'Music' })).join("") :
    "<div class='empty-state'>💔 Избранное пусто</div>";
  bind(el);
}

function renderHistory() {
  const el = $("#historyResults");
  el.innerHTML = history.length ?
    history.map(x => row({ ...x, id: x.item_id, source: x.source || 'Music' })).join("") :
    "<div class='empty-state'>📝 История пуста</div>";
  bind(el);
}

// ========== SAVE HISTORY ==========
async function saveHistory(t) {
  const row = {
    user_id: user?.id || "local",
    item_id: String(t.id),
    title: t.title,
    artist: t.artist || "",
    artwork: t.artwork || "",
    url: t.url || "",
    source: t.source || "music"
  };
  if (sb && user) {
    try { await sb.from("history").insert(row); } catch (e) {}
  } else {
    history.unshift(row);
    history = history.slice(0, 100);
    localStorage.setItem("mw_history", JSON.stringify(history));
  }
  renderHistory();
}

// ========== CLOUD ==========
async function initCloud() {
  if (!cfgReady()) return;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  sb = createClient(C.supabaseUrl, C.supabaseAnonKey);
  const { data, error } = await sb.auth.getUser();
  if (error) console.warn(error);
  if (!data?.user) {
    const r = await sb.auth.signInAnonymously();
    if (r.error) { console.warn(r.error); return; }
    user = r.data.user;
  } else user = data.user;
  await loadCloud();
  $("#accountStatus").textContent = "✅ Аккаунт создан автоматически";
}

async function loadCloud() {
  if (!sb || !user) return;
  const [f, h, p] = await Promise.all([
    sb.from("favorites").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    sb.from("history").select("*").eq("user_id", user.id).order("played_at", { ascending: false }).limit(100),
    sb.from("playlists").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  ]);
  favs = f.data || [];
  history = h.data || [];
  playlists = p.data || [];
  renderFavs();
  renderHistory();
}

// ========== BOOT ==========
async function boot() {
  await initCloud();
  
  // Load local data if no cloud
  if (!favs.length) favs = JSON.parse(localStorage.getItem("mw_favs") || "[]");
  if (!history.length) history = JSON.parse(localStorage.getItem("mw_history") || "[]");
  
  // Initial search
  searchAll("The Weeknd", "#homeResults");
  searchRadio("");
  renderFavs();
  renderHistory();
  
  // Update UI periodically
  setInterval(updateUI, 500);
}

boot();

// ========== SERVICE WORKER ==========
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
