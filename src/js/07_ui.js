// ── Investigation ─────────────────────────────────────────────────────────

function doInvestigate(){
  const t=document.getElementById('target-input').value.trim();
  if(t) investigate(t);
}

function doMobileInvestigate(){
  const inp=document.getElementById('m-target-input');
  const t=(inp&&inp.value||'').trim();
  if(!t) return;
  const main=document.getElementById('target-input');
  if(main) main.value=t;
  investigate(t);
  mobileTab('ping');
}

function quickInv(t){document.getElementById('target-input').value=t;investigate(t);}

async function investigate(target){
  document.querySelectorAll('.sb-quick').forEach(b=>b.classList.remove('idle'));
  activeTarget=target;
  const _ht=$('hdr-target');_ht.textContent=target;_ht.dataset.target=target;
  const s=getSession(target);
  s.pingResults=[];s.traceHops=[];s.traceRawLines='';
  s.PS={min:null,max:null,sum:0,count:0,loss:0};
  s.wpTarget=null;s.wpResults=[];s.whoisData=null;s.whoisRaw='';s.clusterColors=new Map();
  s.mapMarkers.forEach(m=>m.remove());s.mapMarkers=[];
  if(s.mapPolyline){s.mapPolyline.remove();s.mapPolyline=null;}
  if(s.mapPawMarkers){s.mapPawMarkers.forEach(m=>m.remove());s.mapPawMarkers=[];}
  if(s.originMarker){s.originMarker.remove();s.originMarker=null;}
  if(s.inspectorMarker){s.inspectorMarker.remove();s.inspectorMarker=null;}
  clearPingUI();clearTraceUI();
  $('wp-empty').style.display='flex';
  $('wp-loaded').style.display='none';
  $('wp-ip').textContent='—';
  $('wp-fields').innerHTML='';
  clearAllMapPins();
  addTab(target);

  // Place user origin on map immediately (before any hops arrive)
  try{
    const geoR=await fetch('/api/geo/me');
    const geoD=await geoR.json();
    if(geoD.lat!=null&&geoD.lon!=null) addUserOriginPin(geoD.lat,geoD.lon);
  }catch{}

  startPing(target);
  startTrace(target);
  openWhois(target);
}

// ── Session Tabs ──────────────────────────────────────────────────────────

function addTab(target){
  if(!tabOrder.includes(target)) tabOrder.push(target);
  renderTabs();
}

function switchTab(target){
  if(target===activeTarget) return;
  if(pingWs){try{pingWs.close();}catch{}pingWs=null;}
  if(traceEs){traceEs.close();traceEs=null;}
  clearAllMapPins();
  activeTarget=target;
  const _ht=$('hdr-target');_ht.textContent=target;_ht.dataset.target=target;
  const s=getSession(target);
  clearPingUI();
  $('ping-dots').innerHTML=s.pingResults.slice(-8).map(r=>
    `<span class="pdot ${rttCls(r.rtt,r.timeout)}">${r.timeout?'✕':r.rtt!==null?r.rtt.toFixed(0):'--'}</span>`
  ).join('');
  const valid=s.pingResults.filter(r=>!r.timeout&&r.rtt!==null);
  const avg=valid.length?valid.reduce((a,b)=>a+b.rtt,0)/valid.length:null;
  $('s-min').textContent=s.PS.min!==null?s.PS.min.toFixed(1):'--';
  $('s-avg').textContent=avg!==null?avg.toFixed(1):'--';
  $('s-max').textContent=s.PS.max!==null?s.PS.max.toFixed(1):'--';
  $('s-loss').textContent=s.pingResults.length?
    ((s.pingResults.length-valid.length)/s.pingResults.length*100).toFixed(0)+'%':'0%';
  clearTraceUI();
  if(s.traceHops.length){
    $('trace-empty').style.display='none';
    $('trace-table').style.display='table';
    $('trace-body').innerHTML='';
    s.traceHops.forEach(h=>addTraceRow(h));
    $('trace-stat-lbl').textContent=`${s.traceHops.length} hops`;
  }
  const _trr=$('trace-raw');if(_trr) _trr.textContent=s.traceRawLines||'';
  restoreMapPins(s);
  if(s.mapMarkers.length) fitMapBounds();
  if(s.whoisData){
    $('wp-ip').textContent=s.whoisData.ip;
    $('wp-empty').style.display='none';
    $('wp-loaded').style.display='flex';
    renderWpFields(s.whoisData.ip,s.whoisData.fields);
    const rawEl=$('wp-raw');
    if(rawEl){rawEl.textContent=s.whoisRaw||'';rawEl.style.display='none';}
    $('wp-fields').style.display='flex';
    const rawBtn=$('wp-raw-btn');if(rawBtn)rawBtn.textContent='RAW';
  } else {
    $('wp-ip').textContent='—';
    $('wp-empty').style.display='flex';
    $('wp-loaded').style.display='none';
  }
  startPing(target);
  renderTabs();
}

function removeTab(e,target){
  e.stopPropagation();
  tabOrder=tabOrder.filter(t=>t!==target);
  sessionStore.delete(target);
  if(activeTarget===target){
    activeTarget=tabOrder[0]||null;
    if(activeTarget) switchTab(activeTarget);
    else{ clearPingUI();clearTraceUI();clearAllMapPins();$('hdr-target').textContent=''; }
  }
  renderTabs();
}

function renderTabs(){
  const html=tabOrder.map(t=>`
    <div class="tab-item${t===activeTarget?' active':''}" onclick="switchTab('${escAttr(t)}')">
      <span class="tab-ip">${esc(t)}</span>
      <button class="tab-x" onclick="removeTab(event,'${escAttr(t)}')">✕</button>
    </div>
  `).join('');
  const list=$('tab-list');if(list)list.innerHTML=html;
  const mList=$('m-side-session-list');if(mList)mList.innerHTML=html;
  const count=$('m-sess-count');if(count)count.textContent=tabOrder.length;
}

// ── Export ────────────────────────────────────────────────────────────────

async function takeSnapshot(){
  if(!sessionId||typeof html2canvas==='undefined') return;
  const btn=$('cam-btn');if(btn)btn.style.opacity='.5';
  try{
    const canvas=await html2canvas(document.body,{
      backgroundColor:'#0a0a1f',scale:1,logging:false,useCORS:true
    });
    const notes=($('notes-area')||{}).value||'';
    let finalCanvas=canvas;
    if(notes.trim()){
      const pad=14,lh=17,lines=notes.trim().split('\n');
      const oh=lines.length*lh+pad*2+8;
      const nc=document.createElement('canvas');
      nc.width=canvas.width;nc.height=canvas.height+oh;
      const nx=nc.getContext('2d');
      nx.drawImage(canvas,0,0);
      nx.fillStyle='rgba(6,14,28,.97)';nx.fillRect(0,canvas.height,canvas.width,oh);
      nx.strokeStyle='rgba(0,212,255,.25)';
      nx.beginPath();nx.moveTo(0,canvas.height);nx.lineTo(canvas.width,canvas.height);nx.stroke();
      nx.fillStyle='#8eaacb';nx.font='11px Montserrat,Inter,sans-serif';
      nx.fillText('Notes',pad,canvas.height+pad+11);
      nx.fillStyle='#dde6f5';nx.font='12px Montserrat,Inter,sans-serif';
      lines.forEach((ln,i)=>nx.fillText(ln,pad,canvas.height+pad+26+i*lh));
      finalCanvas=nc;
    }
    const b64=await new Promise(resolve=>{
      finalCanvas.toBlob(blob=>{
        const r=new FileReader();
        r.onload=()=>resolve(r.result.split(',')[1]);
        r.readAsDataURL(blob);
      },'image/png');
    });
    const res=await fetch('/api/export/snapshot',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({session_id:sessionId,png:b64})
    });
    const d=await res.json();
    snapshotCount=d.count||snapshotCount+1;
    const badge=$('cam-badge');if(badge){badge.textContent=snapshotCount;badge.style.display='flex';}
  }catch(err){console.error('Snapshot failed',err);}
  finally{if(btn)btn.style.opacity='1';}
}

async function downloadExport(){
  if(!sessionId){alert('Start an investigation first.');return;}
  const data={target:activeTarget,exported_at:new Date().toISOString(),sessions:{}};
  for(const[t,s]of sessionStore.entries()){
    data.sessions[t]={
      target:s.target,ping_stats:s.PS,
      ping_results:s.pingResults.slice(-60),
      trace_hops:s.traceHops,whois:s.whoisData,
    };
  }
  const title=($('session-title')||{}).value||'';
  const notes=($('notes-area')||{}).value||'';
  const res=await fetch('/api/export/package',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({session_id:sessionId,title,notes,data})
  });
  if(!res.ok){alert('Export failed.');return;}
  const blob=await res.blob();
  const cd=res.headers.get('content-disposition')||'';
  const fname=cd.match(/filename="([^"]+)"/)?.[1]||'pingui-export.zip';
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=fname;
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}

// ── Beta modal ────────────────────────────────────────────────────────────

function openBeta(){
  $('beta-overlay').classList.add('open');$('beta-modal').classList.add('open');
  setTimeout(()=>$('beta-email').focus(),50);
}
function closeBeta(){
  $('beta-overlay').classList.remove('open');$('beta-modal').classList.remove('open');
}
async function submitBeta(){
  const email=$('beta-email').value.trim();if(!email)return;
  const btn=$('beta-submit');btn.disabled=true;btn.textContent='Sending…';
  try{
    const r=await fetch('/api/beta/signup',{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    const d=await r.json();
    $('beta-msg').textContent=d.message||'Done!';
    $('beta-email').value='';btn.textContent='✓ Done';
    setTimeout(closeBeta,1800);
  }catch{
    $('beta-msg').textContent='Something went wrong.';
    btn.disabled=false;btn.textContent='Request Access';
  }
}

// ── Mobile ────────────────────────────────────────────────────────────────

function mobileTab(name){
  ['ping','map','trace'].forEach(t=>{
    const btn=document.getElementById('m-tab-'+t);
    if(btn) btn.classList.toggle('active',t===name);
  });
  const grid=document.getElementById('main-grid');
  if(grid) grid.dataset.mtab=name;
  const quick=document.getElementById('m-side-quick');
  if(quick) quick.style.display=name==='ping'?'flex':'none';
  if(name==='map') setTimeout(()=>{if(map)map.invalidateSize();},50);
  if(name==='ping') setTimeout(sizeWaveform,50);
}

function mDrawer(side){
  const el=document.getElementById('m-drawer-'+side);
  const open=el.classList.toggle('open');
  document.getElementById('m-overlay').classList.toggle('show',open);
}

function closeDrawers(){
  document.getElementById('m-drawer-left').classList.remove('open');
  document.getElementById('m-drawer-right').classList.remove('open');
  document.getElementById('m-overlay').classList.remove('show');
  closeMQuick();
}

function toggleMQuick(e){
  if(e) e.stopPropagation();
  document.getElementById('m-quick-popup').classList.toggle('open');
}

function closeMQuick(){
  const p=document.getElementById('m-quick-popup');
  if(p) p.classList.remove('open');
}

function updateMiniCards(){
  const s=sess();if(!s)return;
  const traceInner=document.getElementById('m-mini-trace-inner');
  const traceTable=document.getElementById('trace-table');
  if(traceInner&&traceTable&&traceTable.style.display!=='none')
    traceInner.innerHTML=traceTable.outerHTML;
  const whoisInner=document.getElementById('m-mini-whois-inner');
  const wpFields=document.getElementById('wp-fields');
  if(whoisInner&&wpFields&&s.whoisData)
    whoisInner.innerHTML='<div style="padding:10px 12px">'+wpFields.innerHTML+'</div>';
}
