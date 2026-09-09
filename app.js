/* MusicWave V2
   - iTunes search / previews
   - YouTube Data API search
   - Spotify OAuth PKCE for the user's Spotify catalog
   - Supabase anonymous account + cloud favorites/history/playlists
   - Radio Browser
   - PWA install support
*/
const C=window.MUSICWAVE_CONFIG||{};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const audio=$("#audio");
let sb=null, user=null;
let tracks=[], queue=[], queueIndex=-1;
let favs=[], history=[], playlists=[];
let currentTrackId=null;

function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function toast(t){const x=$("#toast");x.textContent=t;x.style.opacity=1;x.style.transform="translateY(0)";setTimeout(()=>{x.style.opacity=0;x.style.transform="translateY(8px)"},1900)}
function cfgReady(){return C.supabaseUrl&&C.supabaseAnonKey&&!C.supabaseUrl.includes("YOUR_PROJECT")&&C.supabaseAnonKey!=="PASTE_SUPABASE_ANON_KEY"}
function ytReady(){return C.youtubeApiKey&&C.youtubeApiKey!=="PASTE_YOUTUBE_API_KEY"}
function spotifyReady(){return C.spotifyClientId&&C.spotifyClientId!=="PASTE_SPOTIFY_CLIENT_ID"}

async function initCloud(){
  if(!cfgReady()) return;
  const {createClient}=await import("https://esm.sh/@supabase/supabase-js@2");
  sb=createClient(C.supabaseUrl,C.supabaseAnonKey);
  const {data,error}=await sb.auth.getUser();
  if(error) console.warn(error);
  if(!data?.user){
    const r=await sb.auth.signInAnonymously();
    if(r.error){console.warn(r.error);return}
    user=r.data.user;
  }else user=data.user;
  await loadCloud();
  $("#accountStatus").textContent="Аккаунт создан автоматически";
}
async function loadCloud(){
  if(!sb||!user)return;
  const [f,h,p]=await Promise.all([
    sb.from("favorites").select("*").eq("user_id",user.id).order("created_at",{ascending:false}),
    sb.from("history").select("*").eq("user_id",user.id).order("played_at",{ascending:false}).limit(100),
    sb.from("playlists").select("*").eq("user_id",user.id).order("created_at",{ascending:false})
  ]);
  favs=f.data||[];history=h.data||[];playlists=p.data||[];
  renderFavs();
}
async function addFavorite(t){
  if(favs.some(x=>String(x.item_id)===String(t.id))) return;
  const row={user_id:user?.id||"local",item_id:String(t.id),title:t.title,artist:t.artist||"",artwork:t.artwork||"",url:t.url||"",source:t.source||"itunes"};
  if(sb&&user) await sb.from("favorites").insert(row); else {favs.push(row);localStorage.setItem("mw_favs",JSON.stringify(favs))}
  favs.unshift(row);renderFavs();toast("❤️ Добавлено в избранное");
  animateHeart('❤️');
  updateFavButtons();
}
async function removeFavorite(id){
  if(sb&&user) await sb.from("favorites").delete().eq("user_id",user.id).eq("item_id",String(id));
  favs=favs.filter(x=>String(x.item_id)!==String(id));renderFavs();toast("💔 Удалено из избранного");
  animateHeart('💔');
  updateFavButtons();
}
function isFav(id){return favs.some(x=>String(x.item_id)===String(id))}
async function saveHistory(t){
  const row={user_id:user?.id||"local",item_id:String(t.id),title:t.title,artist:t.artist||"",artwork:t.artwork||"",url:t.url||"",source:t.source||"itunes"};
  if(sb&&user) await sb.from("history").insert(row);
  else {history.unshift(row);history=history.slice(0,100);localStorage.setItem("mw_history",JSON.stringify(history))}
}
function img(u){return u?`<img src="${esc(u)}" loading="lazy" onerror="this.remove()">`:"♪"}

function getFavIcon(id, isFav){
  return isFav ? '❤️' : '🤍';
}

function getPlayIcon(id){
  const isPlaying = currentTrackId === String(id) && !audio.paused;
  return isPlaying ? '⏸' : '▶';
}

function row(t){
  const id = String(t.id || t.item_id);
  const fav = isFav(id);
  const playing = currentTrackId === id && !audio.paused;
  return `<div class="track-row"><div class="cover">${img(t.artwork)}</div><div><strong>${esc(t.title)}</strong><span>${esc(t.artist)} • ${esc(t.album||t.source||"Track")}</span></div><button class="play-btn ${playing?'playing':''}" data-play="${esc(id)}">${playing?'⏸':'▶'}</button><button class="fav-btn ${fav?'active':''}" data-fav="${esc(id)}">${fav?'❤️':'🤍'}</button></div>`
}
function card(t){
  const id = String(t.id || t.item_id);
  const fav = isFav(id);
  const playing = currentTrackId === id && !audio.paused;
  return `<article class="card"><div class="cover">${img(t.artwork)}</div><h3>${esc(t.title)}</h3><p>${esc(t.artist)}</p><div class="card-actions"><button class="icon-btn play ${playing?'playing':''}" data-play="${esc(id)}">${playing?'⏸':'▶'}</button><button class="icon-btn fav-btn ${fav?'active':''}" data-fav="${esc(id)}">${fav?'❤️':'🤍'}</button></div></article>`
}
function bind(el){
 el.querySelectorAll("[data-play]").forEach(b=>b.onclick=()=>playById(b.dataset.play));
 el.querySelectorAll("[data-fav]").forEach(b=>{
   b.onclick=(e)=>{
     e.stopPropagation();
     const id = b.dataset.fav;
     const t=[...tracks,...favs,...history].find(x=>String(x.id||x.item_id)===String(id));
     if(t){
       if(isFav(id)){
         removeFavorite(id);
       } else {
         addFavorite(t);
       }
     }
   }
 });
}

function animateHeart(icon){
  const heart = document.createElement('div');
  heart.className = 'heart-animation';
  heart.textContent = icon;
  const size = icon === '❤️' ? 60 : 50;
  heart.style.cssText = `
    position: fixed;
    font-size: ${size}px;
    color: ${icon === '❤️' ? '#ff3366' : '#ff6b6b'};
    pointer-events: none;
    z-index: 9999;
    animation: ${icon === '❤️' ? 'heartFloat' : 'heartBreak'} 1s ease-out forwards;
    left: ${Math.random() * window.innerWidth * 0.5 + window.innerWidth * 0.25}px;
    top: ${Math.random() * window.innerHeight * 0.3 + window.innerHeight * 0.2}px;
  `;
  document.body.appendChild(heart);
  setTimeout(() => heart.remove(), 1200);
}

function updateFavButtons() {
  document.querySelectorAll('[data-fav]').forEach(btn => {
    const id = btn.dataset.fav;
    const fav = isFav(id);
    btn.textContent = fav ? '❤️' : '🤍';
    btn.classList.toggle('active', fav);
  });
}

async function searchItunes(q){
 try {
  const r=await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=30`);
  const j=await r.json();
  return j.results.filter(x=>x.previewUrl).map(x=>({id:"i"+x.trackId,title:x.trackName,artist:x.artistName,album:x.collectionName,artwork:x.artworkUrl100?.replace("100x100","600x600"),url:x.previewUrl,source:"iTunes"}))
 } catch(e) { return [] }
}
async function searchYouTube(q){
 if(!ytReady()) return [];
 try {
  const u=new URL("https://www.googleapis.com/youtube/v3/search");
  u.search=new URLSearchParams({part:"snippet",q,type:"video",videoCategoryId:"10",maxResults:"24",key:C.youtubeApiKey});
  const r=await fetch(u); if(!r.ok) throw new Error("YouTube API error");
  const j=await r.json();
  return (j.items||[]).map(x=>({id:"y"+x.id.videoId,title:x.snippet.title,artist:x.snippet.channelTitle,album:"YouTube",artwork:x.snippet.thumbnails?.high?.url,url:"https://www.youtube.com/watch?v="+x.id.videoId,source:"YouTube",youtubeId:x.id.videoId}));
 } catch(e) { return [] }
}
async function searchVK(q){
  if(!C.vkAccessToken || C.vkAccessToken==="PASTE_VK_ACCESS_TOKEN") return [];
  try {
   const p=new URLSearchParams({q,count:"30",access_token:C.vkAccessToken,v:C.vkApiVersion||"5.199"});
   const r=await fetch("https://api.vk.com/method/audio.search?"+p.toString());
   if(!r.ok) throw new Error("VK API error");
   const j=await r.json();
   if(j.error) throw new Error(j.error.error_msg||"VK API error");
   const items=j.response?.items||[];
   return items.map(x=>({id:"vk"+x.id+"_"+x.owner_id,title:x.title,artist:x.artist,album:"VK",artwork:"",url:x.url||"",source:"VK",vkId:x.id,vkOwnerId:x.owner_id}))
    .filter(x=>x.url);
  } catch(e) { return [] }
}
async function searchAll(q,target){
 if(!q.trim()){
   $(target).innerHTML='<div class="empty-state">Введите запрос для поиска</div>';
   return;
 }
 $(target).innerHTML='<div class="empty-state">🔍 Ищем музыку...</div>';
 try{
  const jobs = [
    searchItunes(q),
    searchYouTube(q),
    searchVK(q)
  ];
  const results = await Promise.allSettled(jobs);
  const allTracks = [];
  const sources = [];
  results.forEach((result, index) => {
    if(result.status === 'fulfilled' && result.value.length > 0) {
      allTracks.push(...result.value);
      const names = ['iTunes', 'YouTube', 'VK'];
      sources.push(names[index]);
    }
  });
  tracks = allTracks;
  const container = $(target);
  container.className=target==="#searchResults"?"track-list":"track-grid";
  if(tracks.length) {
    container.innerHTML=tracks.map(target==="#searchResults"?row:card).join("");
    bind(container);
  } else {
    container.innerHTML="<div class='empty-state'>😕 Ничего не найдено. Попробуйте другой запрос.</div>";
  }
  const status = $("#searchStatus");
  if(status) {
    status.textContent = tracks.length ? `🎵 Найдено ${tracks.length} треков. Источники: ${sources.join(' + ') || 'нет'}` : 'Ничего не найдено';
  }
 }catch(e){
  $(target).innerHTML="<div class='empty-state'>⚠️ Ошибка поиска. Проверьте подключение к интернету.</div>";
  console.error(e);
 }
}
function playById(id){
 const t=[...tracks,...favs,...history].find(x=>String(x.id||x.item_id)===String(id));if(!t){toast('Трек не найден');return}
 currentTrackId = String(t.id || t.item_id);
 
 if(t.source==="YouTube" || t.source==="VK"){
   if(t.url && t.url.startsWith('http')){
     audio.src=t.url;
     $("#playerTitle").textContent=t.title;
     $("#playerArtist").textContent=t.artist;
     $("#playerCover").innerHTML=img(t.artwork);
     audio.play().catch(()=>{
       window.open(t.url,"_blank","noopener");
       toast("📺 Открыто в новой вкладке");
     });
   } else {
     window.open(t.url,"_blank","noopener");
     toast("📺 Открыто в новой вкладке");
   }
   saveHistory(t);
   updatePlayButtons();
   return;
 }
 
 if(t.source==="Radio"){
   audio.src=t.url;
   $("#playerTitle").textContent=t.title;
   $("#playerArtist").textContent=t.artist || "Live Radio";
   $("#playerCover").textContent="◉";
   audio.play().catch(()=>toast("Нажмите Play для запуска"));
   saveHistory(t);
   updatePlayButtons();
   return;
 }
 
 audio.src=t.url;
 $("#playerTitle").textContent=t.title;
 $("#playerArtist").textContent=t.artist;
 $("#playerCover").innerHTML=img(t.artwork);
 audio.play().catch(()=>{});
 saveHistory(t);
 queue=tracks;
 queueIndex=queue.findIndex(x=>x.id===t.id);
 updatePlayButtons();
}

function updatePlayButtons(){
  document.querySelectorAll('[data-play]').forEach(btn => {
    const id = btn.dataset.play;
    const isPlaying = currentTrackId === id && !audio.paused;
    btn.textContent = isPlaying ? '⏸' : '▶';
    btn.classList.toggle('playing', isPlaying);
  });
}

$("#playBtn").onclick=()=>{
 if(!audio.src)return;
 if(audio.paused){
   audio.play();
   $("#playBtn").textContent="Ⅱ";
 } else {
   audio.pause();
   $("#playBtn").textContent="▶";
 }
 updatePlayButtons();
};

$("#nextBtn").onclick=()=>{
 if(queue.length){
   queueIndex=(queueIndex+1)%queue.length;
   playById(queue[queueIndex].id);
 }
};

$("#prevBtn").onclick=()=>{
 if(queue.length){
   queueIndex=(queueIndex-1+queue.length)%queue.length;
   playById(queue[queueIndex].id);
 }
};

audio.onplay = () => {
  $("#playBtn").textContent="Ⅱ";
  updatePlayButtons();
};
audio.onpause = () => {
  $("#playBtn").textContent="▶";
  updatePlayButtons();
};
audio.onended=()=>{
  $("#playBtn").textContent="▶";
  updatePlayButtons();
};
audio.ontimeupdate=()=>{
  $("#progress").value=audio.duration?audio.currentTime/audio.duration*100:0;
  $("#currentTime").textContent=fmt(audio.currentTime);
}
$("#progress").oninput=e=>{
 if(audio.duration)audio.currentTime=e.target.value/100*audio.duration;
}
function fmt(n){n=Math.floor(n||0);return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`}

function show(v){
 $$(".view").forEach(x=>x.classList.add("hidden"));
 $(`#${v}View`).classList.remove("hidden");
 $$(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
 // Close mobile menu
 const sidebar = document.querySelector('.sidebar');
  if(sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
  }
}
$$(".nav-item").forEach(b=>b.onclick=()=>show(b.dataset.view));

// Mobile menu toggle
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

// Close menu on window resize
window.addEventListener('resize', () => {
  if(window.innerWidth > 650) {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
  }
});

$("#searchBtn").onclick=()=>{
  const query = $("#searchInput").value.trim();
  if(!query) {
    toast('Введите запрос для поиска');
    return;
  }
  show("search");
  searchAll(query,"#searchResults");
};
$("#searchInput").onkeydown=e=>{if(e.key==="Enter"){$("#searchBtn").click()}};
$("#heroSearch").onclick=()=>{$("#searchInput").focus();show("search")};
$("#discoverBtn").onclick=()=>searchAll("The Weeknd","#homeResults");
$("#themeBtn").onclick=()=>{document.body.classList.toggle("light");localStorage.setItem("mw_theme",document.body.classList.contains("light")?"light":"dark")};
if(localStorage.getItem("mw_theme")==="light")document.body.classList.add("light");

async function searchRadio(q=""){
 const el=$("#radioResults");el.innerHTML='<div class="empty-state">📻 Ищем станции...</div>';
 try{
  const r=await fetch(`https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(q)}&limit=36&hidebroken=true&order=clickcount&reverse=true`);
  if(!r.ok) throw new Error('Radio API error');
  const a=await r.json();
  if(a.length) {
    el.innerHTML=a.map(s=>`<article class="radio-card"><img class="radio-logo" src="${esc(s.favicon||"")}" onerror="this.style.display='none'"><div><strong>${esc(s.name)}</strong><small>${esc(s.country||"World")} • ${esc(s.tags||"radio")}</small></div><button class="icon-btn play" data-radio="${esc(s.stationuuid)}">▶</button></article>`).join("");
    el.querySelectorAll("[data-radio]").forEach(b=>b.onclick=()=>playRadio(a.find(s=>s.stationuuid===b.dataset.radio)));
  } else {
    el.innerHTML="<div class='empty-state'>📻 Станций не найдено</div>";
  }
 }catch(e){
  el.innerHTML="<div class='empty-state'>⚠️ Радио API недоступно. Попробуйте позже.</div>";
  console.error(e);
 }
}
function playRadio(s){
 const radioTrack = {
   id: 'radio_' + s.stationuuid,
   title: s.name,
   artist: s.country || 'World',
   artwork: s.favicon || '',
   url: s.url_resolved || s.url,
   source: 'Radio'
 };
 // Add to tracks for queue
 if(!tracks.find(t => t.id === radioTrack.id)) {
   tracks.push(radioTrack);
 }
 playById(radioTrack.id);
}
$("#radioBtn").onclick=()=>{
 const query = $("#radioSearch").value.trim();
 searchRadio(query);
};
$("#radioSearch").onkeydown=e=>{if(e.key==="Enter")$("#radioBtn").click()};

function renderFavs(){
 const el=$("#favoriteResults");
 el.innerHTML=favs.length?favs.map(x=>row({...x,id:x.item_id,source:x.source||'iTunes'})).join(""):"<div class='empty-state'>💔 Избранное пусто. Добавьте треки!</div>";
 bind(el);
}
function renderHistory(){
 const el=$("#historyResults");
 el.innerHTML=history.length?history.map(x=>row({...x,id:x.item_id,source:x.source||'iTunes'})).join(""):"<div class='empty-state'>📝 История пока пустая</div>";
 bind(el);
}

async function spotifyLogin(){
 if(!spotifyReady()){toast("Сначала укажи Spotify Client ID в config.js");return}
 const verifier=crypto.randomUUID()+crypto.randomUUID();localStorage.setItem("sp_verifier",verifier);
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
 const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
 const scopes="user-read-private user-read-email user-library-read playlist-read-private playlist-modify-private playlist-modify-public";
 const u=new URL("https://accounts.spotify.com/authorize");
 u.search=new URLSearchParams({client_id:C.spotifyClientId,response_type:"code",redirect_uri:C.spotifyRedirectUri,code_challenge_method:"S256",code_challenge:challenge,scope:scopes,state:crypto.randomUUID()});
 location.href=u.toString();
}
async function spotifyCallback(){
 const code=new URLSearchParams(location.search).get("code");if(!code||!spotifyReady())return;
 const verifier=localStorage.getItem("sp_verifier");if(!verifier)return;
 const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:C.spotifyClientId,grant_type:"authorization_code",code,redirect_uri:C.spotifyRedirectUri,code_verifier:verifier})});
 const j=await r.json();if(j.access_token){localStorage.setItem("spotify_token",j.access_token);history.replaceState({},document.title,location.pathname);toast("✅ Spotify подключён")}
}
$("#spotifyBtn")?.addEventListener("click",spotifyLogin);
function renderAccount(){
 if($("#accountStatus"))$("#accountStatus").textContent=sb&&user?"✅ Аккаунт создан автоматически":"💻 Локальный режим";
}
async function createPlaylist(){
 if(!sb||!user){toast("Для облачных плейлистов настрой Supabase");return}
 const name=prompt("Название плейлиста:","Мой плейлист");if(!name)return;
 await sb.from("playlists").insert({user_id:user.id,name});toast("✅ Плейлист создан")
}
$("#newPlaylistBtn")?.addEventListener("click",createPlaylist);

const savedVolume=Number(localStorage.getItem("mw_volume")||80);
audio.volume=savedVolume/100;
$("#volume").value=savedVolume;
$("#volumeValue").textContent=savedVolume+"%";
$("#volume").oninput=e=>{
 const v=Number(e.target.value); audio.volume=v/100;
 $("#volumeValue").textContent=v+"%";
 $("#volumeIcon").textContent=v===0?"🔇":v<45?"🔉":"🔊";
 localStorage.setItem("mw_volume",v);
};

async function boot(){
 await spotifyCallback(); await initCloud(); renderAccount();
 if(!favs.length) favs=JSON.parse(localStorage.getItem("mw_favs")||"[]");
 if(!history.length) history=JSON.parse(localStorage.getItem("mw_history")||"[]");
 searchAll("The Weeknd","#homeResults");
 searchRadio("");
 renderFavs();
 renderHistory();
}
boot();

if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
