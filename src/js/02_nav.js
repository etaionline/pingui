// ── Navigation ────────────────────────────────────────────────────────────

function showLanding(){
  document.getElementById('landing').classList.remove('out');
  document.getElementById('landing').style.display='flex';
  document.getElementById('investigate').classList.add('hidden');
}

async function enterInvestigate(){
  sessionId='sess_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
  document.getElementById('landing').classList.add('out');
  setTimeout(()=>{
    document.getElementById('landing').style.display='none';
    const inv=document.getElementById('investigate');
    inv.classList.remove('hidden');inv.style.display='flex';
    if(!map) initMap();
    sizeWaveform();
    loadMyIp();
  },380);
}

// Auto-investigate if ?target= in URL
window.addEventListener('DOMContentLoaded',()=>{
  const t=new URLSearchParams(location.search).get('target');
  if(t){
    document.getElementById('landing').style.display='none';
    const inv=document.getElementById('investigate');
    inv.classList.remove('hidden');inv.style.display='flex';
    if(!map) initMap();
    sizeWaveform();
    loadMyIp();
    document.getElementById('target-input').value=t;
    doInvestigate();
  }
});

// ── My IP ─────────────────────────────────────────────────────────────────

async function loadMyIp(){
  try{
    const r=await fetch('/api/myip');
    const d=await r.json();
    myIp=d.ip;
    const el=document.getElementById('myip-val');
    if(el) el.textContent=myIp||'?';
    const elM=document.getElementById('m-side-myip-val');
    if(elM) elM.textContent=myIp||'?';
    const inp=document.getElementById('target-input');
    if(inp&&!inp.value&&myIp) inp.value=myIp;
  }catch{}
}

function investigateMyIp(){
  if(myIp){
    document.getElementById('target-input').value=myIp;
    doInvestigate();
  }
}
