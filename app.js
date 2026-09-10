/* MusicWave V3 */
const C=window.MUSICWAVE_CONFIG||{};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const audio=$("#audio");

let sb=null,user=null;
let tracks=[],queue=[],queueIndex=-1;
let favs=[],history=[];
let currentItem=null,currentPlayingId=null,currentKind=null;
let ytPlayer=null,ytReady=false,ytPlaying=false,ytVideoId=null;

const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const toast=t=>{const x=$("#toast");x.textContent=t;x.style.opacity=1;x.style.transform="translateY(0)";clearTimeout(toast.t);toast.t=setTimeout(()=>{x.style.opacity=0;x.style.transform="translateY(8px)"},1900)};
const img=u=>u?`<img src="${esc(u)}" loading="lazy" onerror="this.remove()">`:"♪";
const cfgReady=()=>C.supabaseUrl&&C.supabaseAnonKey&&!C.supabaseUrl.includes("YOUR_PROJECT")&&C.supabaseAnonKey!=="PASTE_SUPABASE_ANON_KEY";
const ytReadyCfg=()=>C.youtubeApiKey&&C.youtubeApiKey!=="PASTE_YOUTUBE_API_KEY";
const spotifyReadyCfg=()=>C.spotifyClientId&&C.spotifyClientId!=="PASTE_SPOTIFY_CLIENT_ID";
const vkReadyCfg=()=>C.vkAccessToken&&C.vkAccessToken!=="PASTE_VK_ACCESS_TOKEN";

function itemId(t){return String(t?.id??t?.item_id??"")}
function isFav(id){return favs.some(x=>itemId(x)===String(id))}
function findItem(id){return [...tracks,...favs].find(x=>itemId(x)===String(id))}

function playMarkup(t){
  const id=itemId(t), playing=currentPlayingId===id && currentKind==="track" && (audio.src? !audio.paused : ytPlaying);
  return `<button class="icon-btn play-btn ${playing?"is-playing":""}" data-play="${esc(id)}" aria-label="${playing?"Пауза":"Воспроизвести"}">${playing?"Ⅱ":"▶"}</button>`;
}
function favMarkup(t){
  const fav=isFav(itemId(t));
  return `<button class="icon-btn fav-btn ${fav?"is-fav":""}" data-fav="${esc(itemId(t))}" aria-label="${fav?"Удалить из избранного":"Добавить в избранное"}">${fav?"♥":"♡"}</button>`;
}
function card(t){
 return `<article class="card"><div class="cover">${img(t.artwork)}</div><h3>${esc(t.title)}</h3><p>${esc(t.artist||t.name||t.source||"")}</p><div class="card-actions">${playMarkup(t)}${favMarkup(t)}</div></article>`;
}
function row(t){
 return `<div class="track-row"><div class="cover">${img(t.artwork)}</div><div><strong>${esc(t.title)}</strong><span>${esc(t.artist||"")} • ${esc(t.album||t.source||"")}</span></div>${playMarkup(t)}${favMarkup(t)}</div>`;
}
function bind(el){
  el.querySelectorAll("[data-play]").forEach(b=>b.onclick=()=>toggleItem(b.dataset.play));
  el.querySelectorAll("[data-fav]").forEach(b=>b.onclick=()=>toggleFavorite(b.dataset.fav,b));
}
function refreshPlayButtons(){
  $$("[data-play]").forEach(b=>{
    const active=currentPlayingId===b.dataset.play && currentKind==="track" && ((audio.src&& !audio.paused)||ytPlaying);
    b.textContent=active?"Ⅱ":"▶";b.classList.toggle("is-playing",active);
    b.setAttribute("aria-label",active?"Пауза":"Воспроизвести");
  });
  $("#playBtn").textContent=((audio.src&&!audio.paused)||ytPlaying)?"Ⅱ":"▶";
}
function refreshFavButtons(){
  $$("[data-fav]").forEach(b=>{const yes=isFav(b.dataset.fav);b.textContent=yes?"♥":"♡";b.classList.toggle("is-fav",yes)});
}

async function initCloud(){
  if(!cfgReady()) return;
  try{
    const {createClient}=await import("https://esm.sh/@supabase/supabase-js@2");
    sb=createClient(C.supabaseUrl,C.supabaseAnonKey);
    const {data}=await sb.auth.getUser();
    if(!data?.user){const r=await sb.auth.signInAnonymously();if(r.error)throw r.error;user=r.data.user}else user=data.user;
    const [f,h]=await Promise.all([
      sb.from("favorites").select("*").eq("user_id",user.id).order("created_at",{ascending:false}),
      sb.from("history").select("*").eq("user_id",user.id).order("played_at",{ascending:false}).limit(100)
    ]);
    favs=f.data||[];history=h.data||[];
    $("#accountStatus").textContent="Анонимный аккаунт активен. Вход не нужен.";
  }catch(e){console.warn(e);$("#accountStatus").textContent="Локальный режим. Данные хранятся на этом устройстве."}
}
async function toggleFavorite(id,button){
  const t=findItem(id); if(!t)return;
  if(isFav(id)){await removeFavorite(id);return}
  const row={user_id:user?.id||"local",item_id:String(id),title:t.title||t.name,artist:t.artist||"",artwork:t.artwork||t.favicon||"",url:t.url||"",source:t.source||"radio",radioUrl:t.radioUrl||""};
  if(sb&&user) await sb.from("favorites").insert(row);
  favs=[row,...favs.filter(x=>itemId(x)!==id)];
  localStorage.setItem("mw_favs",JSON.stringify(favs));
  if(button){button.classList.remove("heart-pop");void button.offsetWidth;button.classList.add("heart-pop")}
  refreshFavButtons();renderFavs();toast("♥ Добавлено в избранное");
}
async function removeFavorite(id){
  if(sb&&user) await sb.from("favorites").delete().eq("user_id",user.id).eq("item_id",String(id));
  favs=favs.filter(x=>itemId(x)!==String(id));
  localStorage.setItem("mw_favs",JSON.stringify(favs));
  refreshFavButtons();renderFavs();toast("Удалено из избранного");
}
async function saveHistory(t){
  const row={user_id:user?.id||"local",item_id:itemId(t),title:t.title||t.name,artist:t.artist||"",artwork:t.artwork||"",url:t.url||"",source:t.source||""};
  if(sb&&user) await sb.from("history").insert(row); else {history=[row,...history].slice(0,100);localStorage.setItem("mw_history",JSON.stringify(history))}
}

async function searchItunes(q){
  const r=await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=25`);
  const j=await r.json();
  return (j.results||[]).map(x=>({id:"i"+x.trackId,title:x.trackName,artist:x.artistName,album:x.collectionName,artwork:x.artworkUrl100?.replace("100x100","600x600"),url:x.previewUrl||"",source:"iTunes",preview:!!x.previewUrl})).filter(x=>x.url);
}
async function searchYouTube(q){
  if(!ytReadyCfg())return [];
  const u=new URL("https://www.googleapis.com/youtube/v3/search");
  u.search=new URLSearchParams({part:"snippet",q,type:"video",videoCategoryId:"10",maxResults:"24",key:C.youtubeApiKey});
  const r=await fetch(u);if(!r.ok)throw new Error("YouTube API");
  const j=await r.json();
  return (j.items||[]).map(x=>({id:"y"+x.id.videoId,title:x.snippet.title,artist:x.snippet.channelTitle,album:"YouTube",artwork:x.snippet.thumbnails?.high?.url,url:`https://www.youtube.com/watch?v=${x.id.videoId}`,source:"YouTube",youtubeId:x.id.videoId}));
}
async function searchVK(q){
  if(!vkReadyCfg())return [];
  const p=new URLSearchParams({q,count:"25",access_token:C.vkAccessToken,v:C.vkApiVersion||"5.199"});
  const r=await fetch("https://api.vk.com/method/audio.search?"+p);if(!r.ok)throw new Error("VK API");
  const j=await r.json();if(j.error)throw new Error(j.error.error_msg);
  return (j.response?.items||[]).map(x=>({id:"vk"+x.id+"_"+x.owner_id,title:x.title,artist:x.artist,album:"VK",artwork:"",url:x.url||"",source:"VK"})).filter(x=>x.url);
}
async function searchSpotify(q){
  const token=localStorage.getItem("spotify_token");if(!token)return [];
  try{
    const r=await fetch(`https://api.spotify.com/v1/search?type=track&limit=25&q=${encodeURIComponent(q)}`,{headers:{Authorization:`Bearer ${token}`}});
    if(!r.ok)return [];
    const j=await r.json();
    return (j.tracks?.items||[]).map(x=>({id:"sp"+x.id,title:x.name,artist:x.artists.map(a=>a.name).join(", "),album:x.album?.name,artwork:x.album?.images?.[0]?.url||"",url:x.external_urls?.spotify||"",source:"Spotify",spotifyId:x.id,spotifyUri:x.uri}));
  }catch{return []}
}
async function searchAll(q,target){
  if(!q.trim())return;
  $(target).innerHTML='<div class="empty-state">Ищем сразу по всем доступным источникам…</div>';
  show("search");
  const jobs=await Promise.allSettled([searchItunes(q),searchYouTube(q),searchVK(q),searchSpotify(q)]);
  tracks=jobs.flatMap(x=>x.status==="fulfilled"?x.value:[]);
  const names=jobs.map((x,i)=>x.status==="fulfilled"&&x.value.length?["iTunes","YouTube","VK","Spotify"][i]:null).filter(Boolean);
  $(target).className=target==="#searchResults"?"track-list":"track-grid";
  $(target).innerHTML=tracks.length?tracks.map(target==="#searchResults"?row:card).join(""):"<div class='empty-state'>Ничего не найдено. Проверь API/аккаунты в настройках.</div>";
  bind($(target));refreshPlayButtons();refreshFavButtons();
  $("#searchStatus").textContent=`Найдено ${tracks.length}. Источники: ${names.join(" + ")||"нет доступных"}.`;
}

function stopAudio(){
  audio.pause();audio.removeAttribute("src");audio.load();
}
function ensureYT(){
  if(ytPlayer||!window.YT)return;
  ytPlayer=new YT.Player("youtubePlayer",{height:"100%",width:"100%",videoId:"",playerVars:{autoplay:0,playsinline:1,rel:0},events:{
    onReady:()=>{ytReady=true},
    onStateChange:e=>{ytPlaying=e.data===YT.PlayerState.PLAYING;refreshPlayButtons();$("#playBtn").textContent=ytPlaying?"Ⅱ":"▶"}
  }});
}
window.onYouTubeIframeAPIReady=()=>ensureYT();

function showYT(t){
  ensureYT();
  $("#youtubePlayerWrap").classList.remove("hidden");
  $("#youtubeNowTitle").textContent=`${t.title} • ${t.artist||"YouTube"}`;
  if(ytPlayer?.loadVideoById){ytPlayer.loadVideoById(t.youtubeId);ytVideoId=t.youtubeId}
}
function stopYT(){if(ytPlayer?.stopVideo)ytPlayer.stopVideo();ytPlaying=false}
function toggleYT(){
  if(!ytPlayer)return;
  if(ytPlaying)ytPlayer.pauseVideo();else ytPlayer.playVideo();
}
$("#youtubeClose").onclick=()=>{stopYT();$("#youtubePlayerWrap").classList.add("hidden");if(currentKind==="track"&&currentItem?.source==="YouTube"){currentPlayingId=null;currentKind=null;refreshPlayButtons()}};

async function playRadio(t){
  stopYT();$("#youtubePlayerWrap").classList.add("hidden");
  stopAudio();
  currentItem=t;currentKind="radio";currentPlayingId=t.id;
  audio.src=t.radioUrl||t.url;$("#playerTitle").textContent=t.name;$("#playerArtist").textContent=`${t.country||"World"} • Радио`;
  $("#playerCover").innerHTML=img(t.favicon);$("#duration").textContent="LIVE";$("#progress").value=0;
  try{await audio.play();$("#playBtn").textContent="Ⅱ";toast("Радио играет")}catch{toast("Браузер заблокировал запуск. Нажми Play ещё раз.")}
  refreshPlayButtons();renderFavs();
}
async function playItem(t){
  currentItem=t;currentKind="track";currentPlayingId=itemId(t);queue=tracks;queueIndex=queue.findIndex(x=>itemId(x)===currentPlayingId);
  if(t.source==="YouTube"){stopAudio();showYT(t);ytPlayer?.playVideo();$("#playerTitle").textContent=t.title;$("#playerArtist").textContent=t.artist;$("#playerCover").innerHTML=img(t.artwork);$("#duration").textContent="YouTube";ytPlaying=true;await saveHistory(t);refreshPlayButtons();return}
  if(t.source==="Spotify"){
    window.open(t.url,"_blank","noopener");toast("Spotify открылся. Полный Web Playback подключается после авторизации.");
    return;
  }
  if(!t.url){toast("У этого результата нет доступного потока");return}
  stopYT();$("#youtubePlayerWrap").classList.add("hidden");
  stopAudio();audio.src=t.url;$("#playerTitle").textContent=t.title;$("#playerArtist").textContent=t.artist;$("#playerCover").innerHTML=img(t.artwork);
  try{await audio.play()}catch{}
  $("#duration").textContent=t.preview?"0:30":"—";await saveHistory(t);refreshPlayButtons();renderFavs();
}
async function toggleItem(id){
  const t=findItem(id);if(!t)return;
  if(currentPlayingId===id&&currentKind==="track"){if(t.source==="YouTube")toggleYT();else if(!audio.paused)audio.pause();else audio.play().catch(()=>{});refreshPlayButtons();return}
  if(t.source==="radio")return playRadio(t);
  return playItem(t);
}
$("#playBtn").onclick=()=>{
  if(currentKind==="radio"){if(audio.paused)audio.play().catch(()=>{});else audio.pause();refreshPlayButtons();return}
  if(currentKind==="track"&&currentItem){if(currentItem.source==="YouTube")toggleYT();else if(audio.paused)audio.play().catch(()=>{});else audio.pause();refreshPlayButtons();return}
};
$("#nextBtn").onclick=()=>{if(queue.length){queueIndex=(queueIndex+1)%queue.length;playItem(queue[queueIndex])}};
$("#prevBtn").onclick=()=>{if(queue.length){queueIndex=(queueIndex-1+queue.length)%queue.length;playItem(queue[queueIndex])}};
audio.onplay=()=>refreshPlayButtons();
audio.onpause=()=>refreshPlayButtons();
audio.onended=()=>{currentPlayingId=null;refreshPlayButtons()};
audio.ontimeupdate=()=>{if(isFinite(audio.duration)){ $("#progress").value=audio.currentTime/audio.duration*100;$("#currentTime").textContent=fmt(audio.currentTime);$("#duration").textContent=fmt(audio.duration)}};
$("#progress").oninput=e=>{if(isFinite(audio.duration))audio.currentTime=e.target.value/100*audio.duration};
function fmt(n){n=Math.floor(n||0);return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`}

function show(v){
  $$(".view").forEach(x=>x.classList.add("hidden"));
  $(`#${v}View`).classList.remove("hidden");
  $$(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
  closeMenu();
}
function closeMenu(){ $("#sidebar").classList.remove("open");$("#menuBackdrop").classList.remove("open");document.body.classList.remove("menu-open") }
function openMenu(){ $("#sidebar").classList.add("open");$("#menuBackdrop").classList.add("open");document.body.classList.add("menu-open") }
$$(".nav-item").forEach(b=>b.onclick=()=>show(b.dataset.view));
$("#mobileMenu").onclick=()=>$("#sidebar").classList.contains("open")?closeMenu():openMenu();
$("#menuBackdrop").onclick=closeMenu;
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeMenu()});
document.addEventListener("click",e=>{if(window.innerWidth<=700&&$("#sidebar").classList.contains("open")&&!$("#sidebar").contains(e.target)&&!$("#mobileMenu").contains(e.target))closeMenu()});

$("#searchBtn").onclick=()=>searchAll($("#searchInput").value,"#searchResults");
$("#searchInput").onkeydown=e=>{if(e.key==="Enter")$("#searchBtn").click()};
$("#heroSearch").onclick=()=>{$("#searchInput").focus();show("search")};
$("#discoverBtn").onclick=()=>searchAll("The Weeknd","#homeResults");

async function searchRadio(q=""){
 const el=$("#radioResults");el.innerHTML='<div class="empty-state">Ищем станции…</div>';
 try{
  const r=await fetch(`https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(q)}&limit=36&hidebroken=true&order=clickcount&reverse=true`);
  const a=await r.json();
  el.innerHTML=a.map(s=>{
    const t={id:"r"+s.stationuuid,name:s.name,country:s.country,tags:s.tags,favicon:s.favicon,radioUrl:s.url_resolved||s.url,source:"radio"};
    return `<article class="radio-card"><img class="radio-logo" src="${esc(s.favicon||"")}" onerror="this.style.display='none'"><div><strong>${esc(s.name)}</strong><small>${esc(s.country||"World")} • ${esc(s.tags||"radio")}</small></div><button class="icon-btn play-btn" data-radio="${esc(t.id)}">▶</button><button class="icon-btn fav-btn ${isFav(t.id)?"is-fav":""}" data-radio-fav="${esc(t.id)}">${isFav(t.id)?"♥":"♡"}</button></article>`;
  }).join("")||"<div class='empty-state'>Станции не найдены.</div>";
  const map=new Map(a.map(s=>["r"+s.stationuuid,{id:"r"+s.stationuuid,name:s.name,country:s.country,tags:s.tags,favicon:s.favicon,radioUrl:s.url_resolved||s.url,source:"radio"}]));
  el.querySelectorAll("[data-radio]").forEach(b=>b.onclick=()=>playRadio(map.get(b.dataset.radio)));
  el.querySelectorAll("[data-radio-fav]").forEach(b=>b.onclick=()=>{const t=map.get(b.dataset.radioFav);toggleFavorite(b.dataset.radioFav,b).then(()=>{if(t){} })});
 }catch{el.innerHTML="<div class='empty-state'>Не удалось получить список радио.</div>"}
}
$("#radioBtn").onclick=()=>searchRadio($("#radioSearch").value);
$("#radioSearch").onkeydown=e=>{if(e.key==="Enter")$("#radioBtn").click()};

function renderFavs(){
 const el=$("#favoriteResults");
 if(!favs.length){el.className="track-list empty-state";el.innerHTML="Здесь пока пусто.";return}
 el.className="track-list";
 el.innerHTML=favs.map(t=>t.source==="radio"?`<div class="track-row"><div class="cover">${img(t.artwork)}</div><div><strong>${esc(t.title)}</strong><span>Радио • ${esc(t.artist||"")}</span></div><button data-fav="${esc(itemId(t))}" class="fav-btn is-fav">♥</button><button data-play="${esc(itemId(t))}" class="play-btn">▶</button></div>`:row(t)).join("");
 bind(el);refreshFavButtons();refreshPlayButtons();
}
function renderHistory(){
 const el=$("#historyResults");if(!history.length){el.className="track-list empty-state";el.textContent="История пока пустая.";return}
 el.className="track-list";el.innerHTML=history.map(row).join("");bind(el);refreshPlayButtons();refreshFavButtons();
}

function spotifyLogin(){
 if(!spotifyReadyCfg()){toast("Сначала укажи Spotify Client ID в config.js");return}
 const verifier=crypto.randomUUID()+crypto.randomUUID();localStorage.setItem("sp_verifier",verifier);
 crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)).then(b=>{
   const challenge=btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
   const scopes="streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state";
   const u=new URL("https://accounts.spotify.com/authorize");
   u.search=new URLSearchParams({client_id:C.spotifyClientId,response_type:"code",redirect_uri:C.spotifyRedirectUri,code_challenge_method:"S256",code_challenge:challenge,scope:scopes});
   location.href=u.toString();
 });
}
async function spotifyCallback(){
 const code=new URLSearchParams(location.search).get("code");if(!code||!spotifyReadyCfg())return;
 const verifier=localStorage.getItem("sp_verifier");if(!verifier)return;
 const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:C.spotifyClientId,grant_type:"authorization_code",code,redirect_uri:C.spotifyRedirectUri,code_verifier:verifier})});
 const j=await r.json();if(j.access_token){localStorage.setItem("spotify_token",j.access_token);history.replaceState({},document.title,location.pathname);toast("Spotify подключён")}
}
function updateProviderUI(){
 const yt=ytReadyCfg(),vk=vkReadyCfg(),sp=!!localStorage.getItem("spotify_token");
 $("#youtubeStatus").textContent=yt?"Поиск YouTube доступен без входа Google.":"Укажи YouTube API key, чтобы включить поиск.";
 $("#vkStatus").textContent=vk?"VK-поиск подключён.":"Укажи VK API token, чтобы включить поиск.";
 $("#spotifyStatus").textContent=sp?"Spotify подключён.":"Для полного Spotify Playback нужна авторизация Spotify Premium.";
 $$("[data-provider]").forEach(b=>{const p=b.dataset.provider,ok=p==="youtube"?yt:p==="vk"?vk:sp;b.classList.toggle("connected",ok);b.textContent=ok?"Подключено":"Подключить"});
}
$$("[data-provider]").forEach(b=>b.onclick=()=>{
 const p=b.dataset.provider;
 if(p==="spotify")spotifyLogin();
 else if(p==="youtube"){window.open("https://console.cloud.google.com/apis/credentials","_blank","noopener");toast("Для поиска YouTube нужен API key; Google-вход не обязателен")}
 else {window.open("https://dev.vk.com/","_blank","noopener");toast("Для VK нужен API token")}
});
$("#themeBtn").onclick=()=>{document.body.classList.toggle("light");localStorage.setItem("mw_theme",document.body.classList.contains("light")?"light":"dark")};
if(localStorage.getItem("mw_theme")==="light")document.body.classList.add("light");

const savedVolume=Number(localStorage.getItem("mw_volume")||80);audio.volume=savedVolume/100;$("#volume").value=savedVolume;$("#volumeValue").textContent=savedVolume+"%";
$("#volume").oninput=e=>{const v=Number(e.target.value);audio.volume=v/100;$("#volumeValue").textContent=v+"%";$("#volumeIcon").textContent=v===0?"🔇":v<45?"🔉":"🔊";localStorage.setItem("mw_volume",v)};

async function boot(){
  await spotifyCallback();
  await initCloud();
  if(!favs.length)favs=JSON.parse(localStorage.getItem("mw_favs")||"[]");
  if(!history.length)history=JSON.parse(localStorage.getItem("mw_history")||"[]");
  updateProviderUI();renderFavs();renderHistory();
  searchAll("The Weeknd","#homeResults");searchRadio("");
}
boot();
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
