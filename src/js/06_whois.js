// ── IP Inspector / WHOIS ──────────────────────────────────────────────────

async function openWhois(ip){
  if(!ip) return;
  const s=sess();
  if(s){s.wpTarget=ip;s.wpResults=[];}
  $('wp-ip').textContent=ip;
  $('wp-empty').style.display='none';
  $('wp-loaded').style.display='flex';
  $('wp-fields').innerHTML='<div style="font-size:11px;color:var(--muted);padding:12px;animation:pulse 1.2s infinite">Loading…</div>';
  const rawEl0=$('wp-raw');if(rawEl0){rawEl0.style.display='none';rawEl0.textContent='';}
  $('wp-fields').style.display='flex';
  const rawBtn0=$('wp-raw-btn');if(rawBtn0)rawBtn0.textContent='RAW';
  try{
    const r=await fetch(`/api/whois?target=${encodeURIComponent(ip)}`);
    const d=await r.json();
    const f=d.fields||{};
    renderWpFields(ip,f);
    const s2=sess();
    if(s2){s2.whoisData={ip,fields:f};s2.wpTarget=ip;s2.whoisRaw=d.raw||'';}
    const rawEl=$('wp-raw');
    if(rawEl) rawEl.textContent=d.raw||'(no raw output)';
    // If geo resolved, place inspector pin on map
    if(f.lat!=null&&f.lon!=null) addInspectorPin(f.lat,f.lon,ip);
    updateMiniCards();
  }catch{
    $('wp-fields').innerHTML='<div style="padding:12px;font-size:11px;color:var(--muted)">No data.</div>';
  }
}

function renderWpFields(ip,f){
  const row=(k,v)=>v?`<div class="wf-row"><span class="wf-k">${k}</span><span class="wf-v">${esc(String(v))}</span></div>`:'';
  $('wp-fields').innerHTML=`
    <div class="wf-sec">
      <div class="wf-sec-lbl">Identity</div>
      <div class="wf-row"><span class="wf-k">IP</span><span class="wf-v hop-ip" style="cursor:pointer">${esc(ip)}</span></div>
      ${row('Organization',f.org)}
      ${f.country?`<div class="wf-row"><span class="wf-k">Country</span><span class="wf-v">${flag(f.country)} ${f.country}</span></div>`:''}
      ${row('City',f.city)}
      ${row('Region',f.region)}
    </div>
    <div class="wf-sec">
      <div class="wf-sec-lbl">Network</div>
      ${row('ASN',f.asn)}
      ${row('Hostname',f.hostname)}
      ${row('Postal',f.postal)}
      ${row('Timezone',f.timezone)}
    </div>
    ${f.lat&&f.lon?`<div class="wf-sec"><div class="wf-sec-lbl">Geo</div>${row('Lat',f.lat)}${row('Lon',f.lon)}</div>`:''}
  `;
}

function toggleWpRaw(){
  const rawEl=$('wp-raw');
  const fieldsEl=$('wp-fields');
  const btn=$('wp-raw-btn');
  if(!rawEl||!fieldsEl||!btn) return;
  const showing=rawEl.style.display!=='none';
  rawEl.style.display=showing?'none':'block';
  fieldsEl.style.display=showing?'flex':'none';
  btn.textContent=showing?'RAW':'FIELDS';
}
