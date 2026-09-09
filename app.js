const state={tracks:[],index:-1,favs:JSON.parse(localStorage.getItem('mw_favs')||'[]'),radioFavs:JSON.parse(localStorage.getItem('mw_radio_favs')||'[]')};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const audio=$('#audio');

function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function toast(t){const x=$('#toast');x.textContent=t;x.style.opacity=1;x.style.transform='translateY(0)';setTimeout(()=>{x.style.opacity=0;x.style.transform='translateY(8px)'},1800)}
function isFav(id){return state.favs.some(x=>x.id===id)}
function save(){localStorage.setItem('mw_favs',JSON.stringify(state.favs));localStorage.setItem('mw_radio_favs',JSON.stringify(state.radioFavs))}
function toggleFav(t){const i=state.favs.findIndex(x=>x.id===t.id);i>=0?state.favs.splice(i,1):state.favs.push(t);save();toast(i>=0?'Удалено из избранного':'Добавлено в избранное');renderFavs()}
function imgOrNote(url){return url?`<img src="${esc(url)}" loading="lazy" onerror="this.remove()">`:'♪'}

function card(t){
 return `<article class="card"><div class="cover">${imgOrNote(t.artwork)}</div><h3 title="${esc(t.title)}">${esc(t.title)}</h3><p>${esc(t.artist)} • ${esc(t.album||'Single')}</p><div class="card-actions"><button class="icon-btn play" data-play="${esc(t.id)}">▶</button><button class="icon-btn" data-fav="${esc(t.id)}">${isFav(t.id)?'♥':'♡'}</button></div></article>`;
}
function row(t){
 return `<div class="track-row"><div class="cover">${imgOrNote(t.artwork)}</div><div><strong>${esc(t.title)}</strong><span>${esc(t.artist)} • ${esc(t.album||'Single')}</span></div><button data-play="${esc(t.id)}">▶</button><button data-fav="${esc(t.id)}">${isFav(t.id)?'♥':'♡'}</button></div>`;
}
function bindResults(root){
 root.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>playById(b.dataset.play));
 root.querySelectorAll('[data-fav]').forEach(b=>b.onclick=()=>{const t=[...state.tracks,...state.favs].find(x=>String(x.id)===String(b.dataset.fav));if(t)toggleFav(t)});
}
async function searchMusic(q,target='#searchResults'){
 if(!q.trim())return;
 $('#searchStatus').textContent=`Ищем «${q}»…`;
 try{
   const r=await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=30`);
   const j=await r.json();
   const tracks=j.results.filter(x=>x.previewUrl).map(x=>({id:String(x.trackId),title:x.trackName,artist:x.artistName,album:x.collectionName,artwork:x.artworkUrl100?.replace('100x100','600x600'),url:x.previewUrl}));
   state.tracks=tracks;
   $(target).className=target==='#searchResults'?'track-list':'track-grid';
   $(target).innerHTML=tracks.length?tracks.map(target==='#searchResults'?row:card).join(''):'<div class="empty-state">Ничего не найдено.</div>';
   bindResults($(target));
   if(target==='#searchResults')$('#searchStatus').textContent=`Найдено ${tracks.length} треков с доступным 30-секундным превью.`;
 }catch(e){$(target).innerHTML='<div class="empty-state">Не удалось выполнить поиск. Проверь соединение.</div>'}
}
function playById(id){
 const t=[...state.tracks,...state.favs].find(x=>String(x.id)===String(id)); if(!t)return;
 $('#audio').src=t.url; $('#playerTitle').textContent=t.title; $('#playerArtist').textContent=t.artist;
 $('#playerCover').innerHTML=imgOrNote(t.artwork); audio.play(); $('#playBtn').textContent='Ⅱ'; toast(`▶ ${t.title}`);
 state.index=state.tracks.findIndex(x=>x.id===t.id);
}
$('#playBtn').onclick=()=>{if(!audio.src)return;if(audio.paused){audio.play();$('#playBtn').textContent='Ⅱ'}else{audio.pause();$('#playBtn').textContent='▶'}};
audio.addEventListener('ended',()=>$('#playBtn').textContent='▶');
audio.addEventListener('timeupdate',()=>{$('#progress').value=audio.duration?audio.currentTime/audio.duration*100:0;$('#currentTime').textContent=fmt(audio.currentTime)});
$('#progress').oninput=e=>{if(audio.duration)audio.currentTime=e.target.value/100*audio.duration};
function fmt(n){n=Math.floor(n||0);return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`}
$('#nextBtn').onclick=()=>{if(state.tracks.length){state.index=(state.index+1)%state.tracks.length;playById(state.tracks[state.index].id)}};
$('#prevBtn').onclick=()=>{if(state.tracks.length){state.index=(state.index-1+state.tracks.length)%state.tracks.length;playById(state.tracks[state.index].id)}};

function show(view){
 $$('.view').forEach(x=>x.classList.add('hidden'));$(`#${view}View`).classList.remove('hidden');
 $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
}
$$('.nav-item').forEach(b=>b.onclick=()=>show(b.dataset.view));
$('#mobileMenu').onclick=()=>$('.sidebar').classList.toggle('open');
$('#searchBtn').onclick=()=>{show('search');searchMusic($('#searchInput').value)};
$('#searchInput').onkeydown=e=>{if(e.key==='Enter'){show('search');searchMusic(e.target.value)}};
$('#heroSearch').onclick=()=>{$('#searchInput').focus();show('search')};
$('#discoverBtn').onclick=()=>searchMusic('The Weeknd','#homeResults');

function renderFavs(){
 const el=$('#favoriteResults'); const all=state.favs;
 el.className='track-list';
 el.innerHTML=all.length?all.map(row).join(''):'<div class="empty-state">Добавляй треки сердечком, и они появятся здесь.</div>';
 bindResults(el);
}
async function searchRadio(q=''){
 const el=$('#radioResults');el.innerHTML='<div class="empty-state">Ищем станции…</div>';
 try{
  const r=await fetch(`https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(q)}&limit=36&hidebroken=true&order=clickcount&reverse=true`);
  const arr=await r.json();
  el.innerHTML=arr.map(s=>`<article class="radio-card"><img class="radio-logo" src="${esc(s.favicon||'')}" onerror="this.style.display='none'"><div><strong>${esc(s.name)}</strong><small>${esc(s.country||'World')} • ${esc(s.tags||'radio')}</small></div><button class="icon-btn play" data-radio="${esc(s.stationuuid)}">▶</button></article>`).join('')||'<div class="empty-state">Станции не найдены.</div>';
  el.querySelectorAll('[data-radio]').forEach(b=>b.onclick=()=>playRadio(arr.find(s=>s.stationuuid===b.dataset.radio)));
 }catch(e){el.innerHTML='<div class="empty-state">Радио API недоступно.</div>'}
}
function playRadio(s){audio.src=s.url_resolved||s.url;$('#playerTitle').textContent=s.name;$('#playerArtist').textContent=`${s.country||'World'} • Live radio`;$('#playerCover').textContent='◉';audio.play().then(()=>toast(`◉ ${s.name}`)).catch(()=>toast('Браузер заблокировал автозапуск'))}
$('#radioBtn').onclick=()=>searchRadio($('#radioSearch').value);
$('#radioSearch').onkeydown=e=>{if(e.key==='Enter')searchRadio(e.target.value)};
$('#themeBtn').onclick=()=>{document.body.classList.toggle('light');localStorage.setItem('mw_theme',document.body.classList.contains('light')?'light':'dark')};
if(localStorage.getItem('mw_theme')==='light')document.body.classList.add('light');

searchMusic('The Weeknd','#homeResults');searchRadio('');renderFavs();
