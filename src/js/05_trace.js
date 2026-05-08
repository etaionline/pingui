// ── Traceroute ────────────────────────────────────────────────────────────

function scheduleTraceFlush(){
  if(traceFlushTimer) return;
  const elapsed=Date.now()-lastTraceRenderAt;
  const wait=Math.max(0,TRACE_ROLL_MS-elapsed);
  if(wait===0){ flushTraceQueue(); }
  else { traceFlushTimer=setTimeout(flushTraceQueue,wait); }
}

function flushTraceQueue(){
  traceFlushTimer=null;
  if(!traceQueue.length) return;
  const hop=traceQueue.shift();
  try{
    addTraceRow(hop);
    if(hop.lat!=null&&hop.lon!=null){ addMapPin(hop); fitMapBounds(); }
  }catch(err){
    console.error('[trace] render error for hop',hop.hop,err);
  }
  lastTraceRenderAt=Date.now();
  if(traceQueue.length) scheduleTraceFlush();
}

function startTrace(target){
  if(traceEs){traceEs.close();traceEs=null;}
  traceDone=false;
  const seq=++traceSeq;
  $('trace-empty').style.display='block';
  $('trace-table').style.display='none';
  $('trace-body').innerHTML='';
  $('trace-stat-lbl').textContent='starting…';
  const _tphdr=document.getElementById('trace-phdr-ip');
  if(_tphdr) _tphdr.textContent=target;

  traceEs=new EventSource(`/api/trace?target=${encodeURIComponent(target)}`);

  traceEs.onmessage=e=>{
    if(traceSeq!==seq) return;
    try{ onTraceMsg(JSON.parse(e.data)); }
    catch(err){ console.error('[trace] parse error',err); }
  };

  traceEs.onerror=()=>{
    if(traceSeq!==seq) return;
    if(traceDone) return;
    if(traceEs){traceEs.close();traceEs=null;}
    $('trace-stat-lbl').textContent='error';
  };
}

function clearTraceUI(){
  traceSeq++;
  traceDone=false;
  traceQueue=[];
  if(traceFlushTimer){clearTimeout(traceFlushTimer);traceFlushTimer=null;}
  if(traceEs){traceEs.close();traceEs=null;}
  $('trace-body').innerHTML='';
  $('trace-table').style.display='none';
  const _tr=$('trace-raw');if(_tr){_tr.textContent='';_tr.style.display='none';}
  const _trb=$('trace-raw-btn');if(_trb)_trb.textContent='RAW';
  $('trace-empty').style.display='block';
  $('trace-empty').textContent='Enter a target to begin';
  $('trace-stat-lbl').textContent='idle';
}

function onTraceMsg(msg){
  if(msg.type==='start'){
    $('trace-stat-lbl').textContent='tracing…';
    $('trace-empty').style.display='none';
    $('trace-table').style.display='table';
  } else if(msg.type==='raw_line'){
    const s=sess();
    const line=msg.line||'';
    if(s) s.traceRawLines+=(s.traceRawLines?'\n':'')+line;
    const el=$('trace-raw');
    if(el) el.textContent+=(el.textContent?'\n':'')+line;
  } else if(msg.type==='hop'){
    const s=sess();
    if(s) s.traceHops.push(msg.data);
    traceQueue.push(msg.data);
    scheduleTraceFlush();
  } else if(msg.type==='done'){
    traceDone=true;
    traceSeq++;  // invalidate seq — any queued onerror event is rejected by the seq check
    const s=sess();
    const n=s?s.traceHops.length:0;
    $('trace-stat-lbl').textContent=`${n} hop${n!==1?'s':''}`;
    if(traceEs){traceEs.close();traceEs=null;}
    fitMapBounds();
    updateMiniCards();
  } else if(msg.type==='error'){
    $('trace-stat-lbl').textContent=`error: ${msg.message}`;
    if(traceEs){traceEs.close();traceEs=null;}
  }
}

function toggleTraceRaw(){
  const rawEl=$('trace-raw');
  const tableEl=$('trace-table');
  const emptyEl=$('trace-empty');
  const btn=$('trace-raw-btn');
  if(!rawEl||!btn) return;
  const showing=rawEl.style.display!=='none';
  if(showing){
    rawEl.style.display='none';
    const hasHops=tableEl&&tableEl.querySelector('tbody tr');
    if(hasHops) tableEl.style.display='table';
    else if(emptyEl) emptyEl.style.display='block';
    btn.textContent='RAW';
  } else {
    tableEl&&(tableEl.style.display='none');
    emptyEl&&(emptyEl.style.display='none');
    rawEl.style.display='block';
    btn.textContent='FIELDS';
  }
}

function addTraceRow(hop){
  const tbody=$('trace-body');
  if(!tbody){ console.error('[trace] trace-body not found'); return; }
  const avg=hop.rtts&&hop.rtts.length?hop.rtts.reduce((a,b)=>a+b,0)/hop.rtts.length:null;
  const cls=rttCls(avg,hop.timeout);
  const barW=avg!==null?Math.min(avg/300*100,100):0;
  const barCol=rttColor(avg,hop.timeout);
  const isPriv=hop.ip?isPrivateIp(hop.ip):false;

  const rttDisp=hop.timeout||avg===null
    ?'<span class="rtt-val loss">∞</span>'
    :`<span class="rtt-val ${cls}">${avg.toFixed(1)} ms</span>`;

  const ipDisp=hop.ip
    ?`<span class="hop-ip${isPriv?' priv':''}">${hop.ip}</span>`
    :`<span style="color:var(--muted2);font-family:'JetBrains Mono',monospace;letter-spacing:3px;font-size:11px">* * *</span>`;

  const countryFull=hop.country?((()=>{
    try{return new Intl.DisplayNames(['en'],{type:'region'}).of(hop.country)||hop.country;}
    catch{return hop.country;}
  })()):'';

  const hcol=hopClusterColor(hop);
  const isTimeout=hop.timeout||!hop.ip;
  const tr=document.createElement('tr');
  if(isTimeout) tr.classList.add('hop-timeout');
  tr.innerHTML=`
    <td class="td-n"><div class="hop-ball"
      style="background:${hcol};box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 0 7px ${hcol}88"
      data-hop-ip="${hop.ip||''}" data-hop-lat="${hop.lat??''}" data-hop-lon="${hop.lon??''}"
      title="Inspect ${hop.ip||'no ip'}">${hop.hop}</div></td>
    <td class="td-main">
      <div class="row-a">
        ${ipDisp}
        ${hop.host&&hop.host!==hop.ip?`<span class="hop-host">${esc(hop.host)}</span>`:''}
        <div class="rtt-wrap">
          <div class="rtt-bar-bg"><div class="rtt-bar-fill" style="width:${barW}%;background:${barCol}"></div></div>
          ${rttDisp}
        </div>
      </div>
      <div class="row-b">
        ${hop.country?`<span class="hop-cc">${flag(hop.country)} ${esc(countryFull)}</span>`:''}
        ${hop.org?`<span class="hop-org">${esc(hop.org)}</span>`:''}
        ${isPriv?`<span style="font-size:8px;color:#a78bfa;background:rgba(139,92,246,.1);padding:1px 5px;border-radius:3px">${privateIpDesc(hop.ip)}</span>`:''}
      </div>
    </td>
  `;
  tbody.appendChild(tr);
  if(!isTimeout) tr.querySelectorAll('td').forEach(td=>td.style.background=`${hcol}0d`);
  const sw=$('trace-scroll');
  if(sw&&sw.scrollTop+sw.clientHeight>=sw.scrollHeight-40) sw.scrollTop=sw.scrollHeight;
}

function isPrivateIp(ip){
  const p=ip.split('.').map(Number);
  if(p.length!==4) return false;
  return p[0]===10||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||p[0]===127;
}

function ipNewTab(ip){
  if(ip) investigate(ip);
}
