/* MusicWave V2 - Full Music Search with Mobile Fix */
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

// ========== SEARCH FUNCTIONS WITH MOBILE FIX ==========
async function searchItunes(q) {
  try {
    // Use no-cors mode for mobile compatibility
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=25`, {
      signal: controller.signal,
      mode: 'cors'
    });
    clearTimeout(timeout);
    
    if (!r.ok) throw new Error('iTunes API error');
    const j = await r.json();
    return j.results.filter(x => x.previewUrl).map(x => ({
      id: "i" + x.trackId,
      title: x.trackName || 'Unknown',
      artist: x.artistName || 'Unknown',
      album: x.collectionName || '',
      artwork: x.artworkUrl100?.replace("100x100", "600x600") || '',
      url: x.previewUrl || '',
      source: "iTunes",
      duration: x.trackTimeMillis ? Math.floor(x.trackTimeMillis / 1000) : 30
    }));
  } catch (e) {
    console.warn('iTunes search failed:', e);
    return [];
  }
}

async function searchDeezer(q) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const r = await fetch(`https://api.deezer.com/search/track?q=${encodeURIComponent(q)}&limit=20`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    if (!r.ok) throw new Error('Deezer API error');
    const j = await r.json();
    return (j.data || []).map(x => ({
      id: "d" + x.id,
      title: x.title || 'Unknown',
      artist: x.artist?.name || 'Unknown',
      album: x.album?.title || '',
      artwork: x.album?.cover_medium || '',
      url: x.preview || '',
      source: "Deezer",
      duration: Math.floor(x.duration || 30)
    }));
  } catch (e) {
    console.warn('Deezer search failed:', e);
    return [];
  }
}

async function searchYouTube(q) {
  if (!ytReady()) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const u = new URL("https://www.googleapis.com/youtube/v3/search");
    u.search = new URLSearchParams({
      part: "snippet",
      q: q + " audio",
      type: "video",
      videoCategoryId: "10",
      maxResults: "15",
      key: C.youtubeApiKey
    });
    const r = await fetch(u, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!r.ok) throw new Error("YouTube API error");
    const j = await r.json();
    return (j.items || []).map(x => ({
      id: "y" + x.id.videoId,
      title: x.snippet.title || 'Unknown',
      artist: x.snippet.channelTitle || 'Unknown',
      album: "YouTube",
      artwork: x.snippet.thumbnails?.high?.url || x.snippet.thumbnails?.default?.url || '',
      url: `https://www.youtube.com/watch?v=${x.id.videoId}`,
      source: "YouTube",
      youtubeId: x.id.videoId,
      duration: 0
    }));
  } catch (e) {
    console.warn('YouTube search failed:', e);
    return [];
  }
}

// Fallback search using public APIs
async function searchFallback(q) {
  try {
    // Try to get results from a public music search API
    const r = await fetch(`https://api.soundcloud.com/search?q=${encodeURIComponent(q)}&limit=10`, {
      mode: 'no-cors'
    });
    // This is a fallback - might not work due to CORS
    return [];
  } catch (e) {
    return [];
  }
}

async function searchMusic(q) {
  if (!q.trim()) return [];
  
  // Show loading state on mobile
  const isMobile = window.innerWidth <= 650;
  if (isMobile) {
    toast('🔍 Поиск музыки...');
  }
  
  // Try multiple sources with timeout
  const sources = [
    searchDeezer(q), // Deezer first (good mobile support)
    searchItunes(q),
    searchYouTube(q)
  ];
  
  const results = await Promise.allSettled(sources);
  let allTracks = [];
  
  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value && result.value.length > 0) {
      allTracks = allTracks.concat(result.value);
    }
  });
  
  // If no results from main sources, try fallback
  if (allTracks.length === 0) {
    const fallback = await searchFallback(q);
    allTracks = allTracks.concat(fallback);
  }
  
  // Remove duplicates
  const seen = new Set();
  allTracks = allTracks.filter(t => {
    if (!t.title) return false;
    const key = (t.title + (t.artist || '')).toLowerCase().trim();
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
  
  const container = $(target);
  container.innerHTML = '<div class="empty-state">🔍 Ищем музыку...</div>';
  
  try {
    const results = await searchMusic(q);
    tracks = results;
    
    container.className = target === "#searchResults" ? "track-list" : "track-grid";
    
    if (tracks.length) {
      container.innerHTML = tracks.map(target === "#searchResults" ? row : card).join("");
      bind(container);
      const sourceCount = new Set(tracks.map(t => t.source)).size;
      const status = $("#searchStatus");
      if (status) {
        status.textContent = `🎵 Найдено ${tracks.length} треков из ${sourceCount} источников`;
      }
      toast(`✅ Найдено ${tracks.length} треков`);
    } else {
      container.innerHTML = `<div class="empty-state">😕 Ничего не найдено по запросу "${esc(q)}"</div>`;
      const status = $("#searchStatus");
      if (status) {
        status.textContent = "Ничего не найдено";
      }
      toast('😕 Ничего не найдено');
    }
  } catch (e) {
    console.error('Search error:', e);
    container.innerHTML = '<div class="empty-state">⚠️ Ошибка поиска. Проверьте подключение к интернету.</div>';
    toast('⚠️ Ошибка поиска');
  }
}

// ========== UI RENDERING ==========
function row(t) {
  const id = String(t.id || t.item_id || '');
  if (!id) return '';
  const fav = isFav(id);
  const playing = currentTrackId === id && isPlaying;
  return `<div class="track-row">
    <div class="cover">${img(t.artwork)}</div>
    <div>
      <strong>${esc(t.title || 'Unknown')}</strong>
      <span>${esc(t.artist || 'Unknown')} • ${esc(t.source || 'Music')} ${t.duration ? '• ' + fmt(t.duration) : ''}</span>
    </div>
    <button class="play-btn ${playing ? 'playing' : ''}" data-play="${esc(id)}">${playing ? '⏸' : '▶'}</button>
    <button class="fav-btn ${fav ? 'active' : ''}" data-fav="${esc(id)}">${fav ? '❤️' : '🤍'}</button>
  </div>`;
}

function card(t) {
  const id = String(t.id || t.item_id || '');
  if (!id) return '';
  const fav = isFav(id);
  const playing = currentTrackId === id && isPlaying;
  return `<article class="card">
    <div class="cover">${img(t.artwork)}</div>
    <h3>${esc(t.title || 'Unknown')}</h3>
    <p>${esc(t.artist || 'Unknown')}</p>
    <p style="font-size:11px;color:var(--muted)">${esc(t.source || 'Music')}</p>
    <div class="card-actions">
      <button class="icon-btn play ${playing ? 'playing' : ''}" data-play="${esc(id)}">${playing ? '⏸' : '▶'}</button>
      <button class="icon-btn fav-btn ${fav ? 'active' : ''}" data-fav="${esc(id)}">${fav ? '❤️' : '🤍'}</button>
    </div>
  </article>`;
}

function bind(el) {
  if (!el) return;
  el.querySelectorAll("[data-play]").forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      const id = b.dataset.play;
      if (id) playById(id);
    };
  });
  el.querySelectorAll("[data-fav]").forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      const id = b.dataset.fav;
      if (!id) return;
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
  document.querySelectorAll('[data-play]').forEach(btn => {
    const id = btn.dataset.play;
    const playing = currentTrackId === id && isPlaying;
    btn.textContent = playing ? '⏸' : '▶';
    btn.classList.toggle('playing', playing);
  });
  
  document.querySelectorAll('[data-fav]').forEach(btn => {
    const id = btn.dataset.fav;
    const fav = isFav(id);
    btn.textContent = fav ? '❤️' : '🤍';
    btn.classList.toggle('active', fav);
  });
}

// ========== PLAYER ==========
function playById(id) {
  if (!id) { toast('⚠️ Ошибка: ID трека не указан'); return; }
  
  const t = [...tracks, ...favs, ...history].find(x => String(x.id || x.item_id) === String(id));
  if (!t) { toast('Трек не найден'); return; }
  
  currentTrackId = String(t.id || t.item_id);
  
  // For YouTube - open in new tab
  if (t.source === "YouTube") {
    if (t.url) {
      window.open(t.url, "_blank", "noopener");
      toast("📺 YouTube открыт в новой вкладке");
    } else {
      toast('⚠️ Ссылка YouTube не найдена');
    }
    saveHistory(t);
    return;
  }
  
  // For radio
  if (t.source === "Radio" && t.url) {
    audio.src = t.url;
    $("#playerTitle").textContent = t.title || 'Radio';
    $("#playerArtist").textContent = t.artist || "Live Radio";
    $("#playerCover").textContent = "◉";
    audio.play().catch(e => {
      console.error('Radio play error:', e);
      toast('⚠️ Не удалось воспроизвести радио');
    });
    saveHistory(t);
    isPlaying = true;
    updateUI();
    return;
  }
  
  // For music tracks
  if (t.url && t.url.startsWith('http')) {
    audio.src = t.url;
    $("#playerTitle").textContent = t.title || 'Unknown';
    $("#playerArtist").textContent = t.artist || 'Unknown';
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
        // Try to open in new tab if available
        if (t.url && t.url.includes('youtube.com')) {
          window.open(t.url, "_blank", "noopener");
        }
      });
    
    queue = tracks.length ? tracks : [t];
    queueIndex = queue.findIndex(x => String(x.id) === String(t.id));
  } else {
    toast('⚠️ Нет доступного аудио для этого трека');
    // Try to open URL if available
    if (t.url) {
      window.open(t.url, "_blank", "noopener");
    }
  }
}

// ========== PLAYER CONTROLS ==========
$("#playBtn").onclick = () => {
  if (!audio.src) {
    toast('⚠️ Нет активного трека');
    return;
  }
  if (audio.paused) {
    audio.play().catch(() => {});
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
  const view = $(`#${v}View`);
  if (view) view.classList.remove("hidden");
  $$(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.view === v));
  document.querySelector('.sidebar')?.classList.remove('open');
  document.querySelector('.sidebar-overlay')?.classList.remove('active');
}

$$(".nav-item").forEach(b => b.onclick = () => show(b.dataset.view));

// ========== MOBILE MENU ==========
const mobileMenu = document.getElementById("mobileMenu");
const sidebar = document.querySelector(".sidebar");
const overlay = document.createElement('div');
overlay.className = 'sidebar-overlay';
document.body.appendChild(overlay);

if (mobileMenu) {
  mobileMenu.onclick = (e) => {
    e.stopPropagation();
    sidebar.classList.toggle("open");
    overlay.classList.toggle("active");
  };
}

if (overlay) {
  overlay.onclick = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
  };
}

// ========== SEARCH ==========
const searchBtn = $("#searchBtn");
const searchInput = $("#searchInput");
const searchResults = $("#searchResults");

if (searchBtn) {
  searchBtn.onclick = () => {
    const query = searchInput?.value?.trim();
    if (!query) { toast('Введите запрос для поиска'); return; }
    show("search");
    searchAll(query, "#searchResults");
  };
}

if (searchInput) {
  searchInput.onkeydown = e => {
    if (e.key === "Enter") searchBtn?.click();
  };
}

const heroSearch = $("#heroSearch");
if (heroSearch) {
  heroSearch.onclick = () => {
    searchInput?.focus();
    show("search");
  };
}

const discoverBtn = $("#discoverBtn");
if (discoverBtn) {
  discoverBtn.onclick = () => {
    searchAll("The Weeknd", "#homeResults");
  };
}

// ========== THEME ==========
const themeBtn = $("#themeBtn");
if (themeBtn) {
  themeBtn.onclick = () => {
    document.body.classList.toggle("light");
    localStorage.setItem("mw_theme", document.body.classList.contains("light") ? "light" : "dark");
  };
}

if (localStorage.getItem("mw_theme") === "light") document.body.classList.add("light");

// ========== RADIO ==========
async function searchRadio(q = "") {
  const el = $("#radioResults");
  if (!el) return;
  el.innerHTML = '<div class="empty-state">📻 Ищем станции...</div>';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const r = await fetch(`https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(q)}&limit=36&hidebroken=true&order=clickcount&reverse=true`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    if (!r.ok) throw new Error('Radio API error');
    const a = await r.json();
    if (a && a.length) {
      el.innerHTML = a.map(s => `
        <article class="radio-card">
          <img class="radio-logo" src="${esc(s.favicon || "")}" onerror="this.style.display='none'">
          <div>
            <strong>${esc(s.name || 'Unknown')}</strong>
            <small>${esc(s.country || "World")} • ${esc(s.tags || "radio")}</small>
          </div>
          <button class="icon-btn play" data-radio="${esc(s.stationuuid)}">▶</button>
        </article>
      `).join("");
      el.querySelectorAll("[data-radio]").forEach(b => {
        b.onclick = () => {
          const station = a.find(s => s.stationuuid === b.dataset.radio);
          if (station) playRadio(station);
        };
      });
    } else {
      el.innerHTML = "<div class='empty-state'>📻 Станций не найдено</div>";
    }
  } catch (e) {
    console.error('Radio error:', e);
    el.innerHTML = "<div class='empty-state'>⚠️ Радио API недоступно</div>";
  }
}

function playRadio(s) {
  if (!s) return;
  const radioTrack = {
    id: 'radio_' + (s.stationuuid || Date.now()),
    title: s.name || 'Unknown Radio',
    artist: s.country || 'World',
    artwork: s.favicon || '',
    url: s.url_resolved || s.url || '',
    source: 'Radio'
  };
  if (radioTrack.url) {
    if (!tracks.find(t => t.id === radioTrack.id)) {
      tracks.push(radioTrack);
    }
    playById(radioTrack.id);
  } else {
    toast('⚠️ Недоступен URL радиостанции');
  }
}

const radioBtn = $("#radioBtn");
const radioSearch = $("#radioSearch");

if (radioBtn) {
  radioBtn.onclick = () => {
    const query = radioSearch?.value?.trim() || '';
    searchRadio(query);
  };
}

if (radioSearch) {
  radioSearch.onkeydown = e => {
    if (e.key === "Enter") radioBtn?.click();
  };
}

// ========== FAVORITES & HISTORY ==========
function renderFavs() {
  const el = $("#favoriteResults");
  if (!el) return;
  el.innerHTML = favs.length ?
    favs.map(x => row({ ...x, id: x.item_id, source: x.source || 'Music' })).join("") :
    "<div class='empty-state'>💔 Избранное пусто</div>";
  bind(el);
}

function renderHistory() {
  const el = $("#historyResults");
  if (!el) return;
  el.innerHTML = history.length ?
    history.map(x => row({ ...x, id: x.item_id, source: x.source || 'Music' })).join("") :
    "<div class='empty-state'>📝 История пуста</div>";
  bind(el);
}

// ========== SAVE HISTORY ==========
async function saveHistory(t) {
  if (!t || !t.id) return;
  const row = {
    user_id: user?.id || "local",
    item_id: String(t.id),
    title: t.title || 'Unknown',
    artist: t.artist || '',
    artwork: t.artwork || '',
    url: t.url || '',
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
  try {
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
    const status = $("#accountStatus");
    if (status) status.textContent = "✅ Аккаунт создан автоматически";
  } catch (e) {
    console.warn('Cloud init failed:', e);
  }
}

async function loadCloud() {
  if (!sb || !user) return;
  try {
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
  } catch (e) {
    console.warn('Load cloud failed:', e);
  }
}

// ========== BOOT ==========
async function boot() {
  await initCloud();
  
  if (!favs.length) favs = JSON.parse(localStorage.getItem("mw_favs") || "[]");
  if (!history.length) history = JSON.parse(localStorage.getItem("mw_history") || "[]");
  
  // Initial search with delay to ensure DOM is ready
  setTimeout(() => {
    searchAll("The Weeknd", "#homeResults");
    searchRadio("");
    renderFavs();
    renderHistory();
  }, 500);
  
  // Update UI periodically
  setInterval(updateUI, 1000);
  
  // Check for network status
  window.addEventListener('online', () => {
    toast('🌐 Интернет восстановлен');
  });
  
  window.addEventListener('offline', () => {
    toast('⚠️ Нет подключения к интернету');
  });
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// ========== SERVICE WORKER ==========
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
