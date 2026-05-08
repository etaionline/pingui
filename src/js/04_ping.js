// ── Cluster colours & RTT helpers ─────────────────────────────────────────

const CLUSTER_PALETTE=['#c084fc','#e879f9','#818cf8','#f472b6','#60a5fa','#a78bfa','#ec4899','#6366f1','#2dd4bf','#f9a8d4'];
const CLUSTER_PRIVATE='#a78bfa';
const CLUSTER_TIMEOUT='#334155';

function hopClusterColor(hop){
  if(hop.timeout||!hop.ip) return CLUSTER_TIMEOUT;
  if(isPrivateIp(hop.ip)) return CLUSTER_PRIVATE;
  const s=sess();
  const key=hop.org||hop.ip;
  if(!s||!s.clusterColors) return CLUSTER_PALETTE[0];
  if(!s.clusterColors.has(key))
    s.clusterColors.set(key,CLUSTER_PALETTE[s.clusterColors.size%CLUSTER_PALETTE.length]);
  return s.clusterColors.get(key);
}

function rttCls(rtt,timeout){
  if(timeout||rtt===null) return 'loss';
  if(rtt<5)   return 'exceptional';
  if(rtt<12)  return 'fast';
  if(rtt<30)  return 'normal';
  if(rtt<70)  return 'sluggish';
  if(rtt<170) return 'slow';
  return 'critical';
}

function rttColor(rtt,timeout){
  const m={exceptional:'#00f5d4',fast:'#22d3ee',normal:'#a3e635',
    sluggish:'#fbbf24',slow:'#fb923c',critical:'#f87171',loss:'#475569'};
  return m[rttCls(rtt,timeout)];
}

// ── Ping WebSocket ────────────────────────────────────────────────────────

function startPing(target){
  stopPing();
  const _pphdr=document.getElementById('ping-phdr-ip');
  if(_pphdr) _pphdr.textContent=target;
  document.getElementById('ping-led').className='pdot-led run';
  document.getElementById('ping-stat-lbl').textContent='running';
  document.getElementById('ping-stop-btn').classList.add('active');
  const proto=location.protocol==='https:'?'wss:':'ws:';
  pingWs=new WebSocket(`${proto}//${location.host}/api/ping?target=${encodeURIComponent(target)}`);
  pingWs.onmessage=e=>{try{onPingMsg(JSON.parse(e.data));}catch{}};
  pingWs.onclose=()=>{
    document.getElementById('ping-led').className='pdot-led';
    document.getElementById('ping-stat-lbl').textContent='stopped';
    document.getElementById('ping-stop-btn').classList.remove('active');
  };
}

function stopPing(){
  if(pingWs){try{pingWs.close();}catch{}pingWs=null;}
  clearTimeout(window._seekTimer);
  document.getElementById('ping-rtt').classList.remove('seeking');
  document.getElementById('ping-led').className='pdot-led';
  document.getElementById('ping-stat-lbl').textContent='stopped';
  document.getElementById('ping-stop-btn').classList.remove('active');
}

function onPingMsg(d){
  if(d.error) return;
  const s=sess();
  if(!s) return;
  const {rtt,timeout}=d;
  s.pingResults.push({rtt,timeout});
  if(s.pingResults.length>60) s.pingResults.shift();
  if(!timeout&&rtt!==null){
    if(s.PS.min===null||rtt<s.PS.min) s.PS.min=rtt;
    if(s.PS.max===null||rtt>s.PS.max) s.PS.max=rtt;
    s.PS.sum+=rtt;s.PS.count++;
  } else s.PS.loss++;
  const valid=s.pingResults.filter(r=>!r.timeout&&r.rtt!==null);
  const avg=valid.length?valid.reduce((a,b)=>a+b.rtt,0)/valid.length:null;
  let jitter=null;
  if(valid.length>=2){
    const diffs=valid.slice(1).map((v,i)=>Math.abs(v.rtt-valid[i].rtt));
    jitter=diffs.reduce((a,b)=>a+b,0)/diffs.length;
  }
  const lossP=(s.pingResults.length-valid.length)/s.pingResults.length*100;
  const rttEl=document.getElementById('ping-rtt');
  const cls=rttCls(rtt,timeout);
  rttEl.className=cls;
  rttEl.innerHTML=timeout?'∞':`${rtt.toFixed(1)}<span id="ping-unit">ms</span>`;
  $('s-min').textContent=s.PS.min!==null?s.PS.min.toFixed(1):'--';
  $('s-avg').textContent=avg!==null?avg.toFixed(1):'--';
  $('s-max').textContent=s.PS.max!==null?s.PS.max.toFixed(1):'--';
  $('s-loss').textContent=lossP.toFixed(0)+'%';
  $('s-jitter').textContent=jitter!==null?jitter.toFixed(1):'--';
  $('ping-dots').innerHTML=s.pingResults.slice(-8).map(r=>
    `<span class="pdot ${rttCls(r.rtt,r.timeout)}">${r.timeout?'✕':r.rtt!==null?r.rtt.toFixed(0):'--'}</span>`
  ).join('');
  drawWaveform();
  rttEl.classList.remove('seeking');
  clearTimeout(window._seekTimer);
  window._seekTimer=setTimeout(()=>{ if(pingWs) rttEl.classList.add('seeking'); },800);
}

function clearPingUI(){
  const r=$('ping-rtt');r.className='';r.textContent='--';
  const _pcl=document.getElementById('ping-phdr-ip');if(_pcl)_pcl.textContent='';
  $('ping-dots').innerHTML='';
  ['s-min','s-avg','s-max','s-jitter'].forEach(id=>$(id).textContent='--');
  $('s-loss').textContent='0%';
  const c=$('waveform');c.getContext('2d').clearRect(0,0,c.width,c.height);
}

// ── Waveform ──────────────────────────────────────────────────────────────

function sizeWaveform(){
  const c=$('waveform');
  c.width=$('ping-panel').offsetWidth||280;
  c.height=84;
}
addEventListener('resize',sizeWaveform);

function drawWaveform(){
  const c=$('waveform'),ctx=c.getContext('2d'),w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h);
  const pingResults=(sess()||{pingResults:[]}).pingResults;
  const valid=pingResults.filter(r=>!r.timeout&&r.rtt!==null);
  if(valid.length<2) return;
  const maxR=Math.max(...valid.map(r=>r.rtt),1);
  const sl=pingResults.slice(-50);
  const sx=w/Math.max(sl.length-1,1);
  const pts=sl.map((r,i)=>({
    x:i*sx,
    y:(r.timeout||r.rtt===null)?h-3:h-(r.rtt/maxR)*(h-10)-5
  }));
  const g=ctx.createLinearGradient(0,0,w,0);
  g.addColorStop(0,'rgba(0,212,255,.3)');g.addColorStop(1,'rgba(0,212,255,.95)');
  ctx.beginPath();pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
  ctx.strokeStyle=g;ctx.lineWidth=1.8;ctx.shadowColor='rgba(0,212,255,.5)';ctx.shadowBlur=6;ctx.stroke();
  ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
  pts.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.lineTo(pts[pts.length-1].x,h);ctx.lineTo(pts[0].x,h);ctx.closePath();
  ctx.fillStyle='rgba(0,212,255,.06)';ctx.shadowBlur=0;ctx.fill();
}
