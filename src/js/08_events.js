// ── Click delegation ──────────────────────────────────────────────────────

document.addEventListener('click', e=>{
  // Ball click → open WHOIS in inspector + zoom map to hop
  const ball=e.target.closest('.hop-ball[data-hop-ip]');
  if(ball){
    const ip=ball.dataset.hopIp;
    if(ip) openWhois(ip);
    const lat=parseFloat(ball.dataset.hopLat);
    const lon=parseFloat(ball.dataset.hopLon);
    if(!isNaN(lat)&&!isNaN(lon)&&map) map.flyTo([lat,lon],8,{duration:1.2});
    return;
  }
  // IP text click → load into search bar (user then hits Go or Enter)
  const el=e.target.closest('.hop-ip,.lpu-ip');
  if(!el) return;
  const ip=el.textContent.trim().replace(/[^0-9.a-zA-Z:\-]/g,'');
  if(!ip||ip==='—') return;
  if(e.metaKey||e.ctrlKey){
    window.open(`/?target=${encodeURIComponent(ip)}`,'_blank');
  } else {
    const inp=document.getElementById('target-input');
    const minp=document.getElementById('m-target-input');
    if(inp){inp.value=ip;inp.focus();}
    if(minp) minp.value=ip;
  }
},{capture:true});

// Close mobile quick-popup when clicking outside
document.addEventListener('click',e=>{
  const popup=document.getElementById('m-quick-popup');
  const toggle=document.getElementById('m-quick-toggle');
  if(popup&&popup.classList.contains('open')&&!popup.contains(e.target)&&e.target!==toggle)
    closeMQuick();
},{capture:false});

// Make map popup IPs work
window.ipNewTab=ipNewTab;

// CSS animation for origin pin (injected at runtime since it's dynamic)
(function(){
  const style=document.createElement('style');
  style.textContent=`@keyframes origin-pulse{
    0%,100%{box-shadow:0 0 0 4px rgba(0,212,255,.25),0 0 12px rgba(0,212,255,.6);}
    50%{box-shadow:0 0 0 8px rgba(0,212,255,.12),0 0 20px rgba(0,212,255,.4);}
  }`;
  document.head.appendChild(style);
})();

// ── App init ──────────────────────────────────────────────────────────────

addEventListener('load',()=>{
  sessionId='sess_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
  document.getElementById('landing').style.display='none';
  const inv=document.getElementById('investigate');
  inv.classList.remove('hidden');inv.style.display='flex';
  if(!map) initMap();
  loadMyIp();
  setTimeout(sizeWaveform,80);
  mobileTab('ping');
});

// Mobile overlay closes drawers
const _ov=document.getElementById('m-overlay');
if(_ov) _ov.addEventListener('click',closeDrawers);
