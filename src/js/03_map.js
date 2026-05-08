// ── Map ───────────────────────────────────────────────────────────────────

function initMap(){
  map=L.map('map',{center:[30,0],zoom:2,zoomControl:true,attributionControl:false});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:18}).addTo(map);
}

const CLUSTER_D=0.5;

function makePinHtml(hop){
  const col=hopClusterColor(hop);
  const avg=hop.rtts&&hop.rtts.length?hop.rtts.reduce((a,b)=>a+b,0)/hop.rtts.length:null;
  const glow=hop.timeout||avg===null?`0 0 4px ${col}44`:
    avg<30?`0 0 12px ${col}bb`:avg<100?`0 0 18px ${col}99`:`0 0 26px ${col}77`;
  return `<div style="width:22px;height:22px;border-radius:50%;background:${col};
    border:1px solid rgba(255,255,255,.2);box-shadow:${glow};
    display:flex;align-items:center;justify-content:center;
    font-size:8px;font-weight:900;color:#fff;
    text-shadow:0 1px 4px rgba(0,0,0,.95),0 0 10px rgba(255,255,255,.5);
    font-family:'JetBrains Mono',monospace;cursor:pointer">${hop.hop}</div>`;
}

function bearingDeg(lat1,lon1,lat2,lon2){
  const r=Math.PI/180;
  const dL=(lon2-lon1)*r;
  const y=Math.sin(dL)*Math.cos(lat2*r);
  const x=Math.cos(lat1*r)*Math.sin(lat2*r)-Math.sin(lat1*r)*Math.cos(lat2*r)*Math.cos(dL);
  return(Math.atan2(y,x)*180/Math.PI+360)%360;
}

// Glowing white paw with radioactive yellow tinge — tiny, dense trail
function mapPawSVG(rot){
  const c='rgba(255,255,230,0.72)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 44" width="5" height="6"
    style="display:block;transform:rotate(${rot}deg);transform-origin:center;
    filter:drop-shadow(0 0 1px rgba(255,255,255,.65)) drop-shadow(0 0 2px rgba(220,255,80,.35))">
    <ellipse cx="20" cy="32" rx="11" ry="9" fill="${c}"/>
    <ellipse cx="9"  cy="20" rx="5"  ry="6" fill="${c}"/>
    <ellipse cx="20" cy="17" rx="5"  ry="6" fill="${c}"/>
    <ellipse cx="31" cy="20" rx="5"  ry="6" fill="${c}"/>
    <ellipse cx="5"  cy="32" rx="4"  ry="5" fill="${c}"/>
    <ellipse cx="35" cy="32" rx="4"  ry="5" fill="${c}"/>
  </svg>`;
}

function geoDistDeg(lat1,lon1,lat2,lon2){
  const dLat=lat2-lat1;
  const dLon=(lon2-lon1)*Math.cos((lat1+lat2)/2*Math.PI/180);
  return Math.sqrt(dLat*dLat+dLon*dLon);
}

// Place a pulsing "you are here" origin pin for the user's own location
function addUserOriginPin(lat, lon){
  if(!map||lat==null||lon==null) return;
  const s=sess();
  if(!s) return;
  if(s.originMarker){s.originMarker.remove();s.originMarker=null;}
  const icon=L.divIcon({
    className:'',
    html:`<div style="width:14px;height:14px;border-radius:50%;
      background:#00d4ff;border:2px solid rgba(255,255,255,.6);
      box-shadow:0 0 0 4px rgba(0,212,255,.25),0 0 12px rgba(0,212,255,.6);
      animation:origin-pulse 2s ease-in-out infinite"></div>`,
    iconSize:[14,14],iconAnchor:[7,7],
  });
  s.originMarker=L.marker([lat,lon],{icon,interactive:false,keyboard:false}).addTo(map);
  // If no other markers yet, center the map here
  if(s.mapMarkers.length===0) map.setView([lat,lon],4);
}

// Place or update an "inspector" pin when the WHOIS panel resolves a location
function addInspectorPin(lat, lon, ip){
  if(!map||lat==null||lon==null) return;
  const s=sess();
  if(!s) return;
  if(s.inspectorMarker){s.inspectorMarker.remove();s.inspectorMarker=null;}
  const icon=L.divIcon({
    className:'',
    html:`<div style="width:12px;height:12px;border-radius:2px;transform:rotate(45deg);
      background:rgba(255,255,255,.9);border:1px solid rgba(0,212,255,.8);
      box-shadow:0 0 8px rgba(0,212,255,.6)"></div>`,
    iconSize:[12,12],iconAnchor:[6,6],
  });
  s.inspectorMarker=L.marker([lat,lon],{icon,interactive:false,keyboard:false}).addTo(map);
}

function addMapPin(hop){
  if(!map||hop.lat==null||hop.lon==null) return;
  const s=sess();
  if(!s) return;

  try{
    const sameSpot=s.mapMarkers.filter(
      m=>Math.abs(m._ll[0]-hop.lat)<CLUSTER_D&&Math.abs(m._ll[1]-hop.lon)<CLUSTER_D
    );
    const STEP=0.012;
    const placeLat=sameSpot.length>0?hop.lat+sameSpot.length*STEP:hop.lat;
    const placeLon=sameSpot.length>0?hop.lon+sameSpot.length*STEP*0.6:hop.lon;

    const icon=L.divIcon({className:'',html:makePinHtml(hop),iconSize:[22,22],iconAnchor:[11,11]});
    const marker=L.marker([placeLat,placeLon],{icon}).addTo(map);
    marker._ll=[placeLat,placeLon];

    const avg=hop.rtts&&hop.rtts.length?hop.rtts.reduce((a,b)=>a+b,0)/hop.rtts.length:null;
    marker.bindPopup(`
      <div class="lpu-ip">${esc(hop.ip||'—')}</div>
      <div class="lpu-meta">${esc(hop.org||'')}${hop.country?` · ${flag(hop.country)} ${hop.country}`:''}</div>
      <div class="lpu-rtt">${avg!==null?avg.toFixed(1)+' ms':'∞'}</div>
    `,{maxWidth:220});

    // Draw dense paw trail between previous geo-located hop and this one
    // Use origin marker as the first anchor if it's the very first hop marker
    const prevLL = s.mapMarkers.length>=1
      ? s.mapMarkers[s.mapMarkers.length-1]._ll
      : (s.originMarker ? s.originMarker.getLatLng() : null);

    if(prevLL){
      const prev=[prevLL[0]!==undefined?prevLL[0]:prevLL.lat, prevLL[1]!==undefined?prevLL[1]:prevLL.lng];
      const curr=[placeLat,placeLon];
      const bear=bearingDeg(prev[0],prev[1],curr[0],curr[1]);
      const PAW_COUNT=Math.max(2,Math.min(24,Math.round(geoDistDeg(prev[0],prev[1],curr[0],curr[1])/2.0)));
      for(let i=1;i<=PAW_COUNT;i++){
        const t=i/(PAW_COUNT+1);
        const wiggle=Math.sin(i*1.1)*0.003;
        const lat=prev[0]+(curr[0]-prev[0])*t+wiggle;
        const lon=prev[1]+(curr[1]-prev[1])*t+wiggle;
        const pawIcon=L.divIcon({
          className:'',html:mapPawSVG(bear),
          iconSize:[5,6],iconAnchor:[2,3]
        });
        const pm=L.marker([lat,lon],{icon:pawIcon,interactive:false,keyboard:false}).addTo(map);
        if(!s.mapPawMarkers) s.mapPawMarkers=[];
        s.mapPawMarkers.push(pm);
      }
    }

    s.mapMarkers.push(marker);
  }catch(err){
    console.error('[map] addMapPin error',err);
  }
}

function fitMapBounds(){
  const s=sess();
  if(!map||!s) return;
  const all=[
    ...s.mapMarkers.map(m=>m._ll),
    ...(s.originMarker?[[s.originMarker.getLatLng().lat,s.originMarker.getLatLng().lng]]:[]),
  ];
  if(all.length===0) return;
  if(all.length===1){map.setView(all[0],6);return;}
  map.fitBounds(L.latLngBounds(all),{padding:[30,30]});
}

function clearAllMapPins(){
  for(const s of sessionStore.values()){
    s.mapMarkers.forEach(m=>m.remove());
    if(s.mapPolyline){s.mapPolyline.remove();}
    if(s.mapPawMarkers){s.mapPawMarkers.forEach(m=>m.remove());}
    if(s.originMarker){s.originMarker.remove();}
    if(s.inspectorMarker){s.inspectorMarker.remove();}
  }
}

function restoreMapPins(s){
  s.mapMarkers.forEach(m=>m.addTo(map));
  if(s.mapPolyline) s.mapPolyline.addTo(map);
  if(s.mapPawMarkers) s.mapPawMarkers.forEach(m=>m.addTo(map));
  if(s.originMarker) s.originMarker.addTo(map);
  if(s.inspectorMarker) s.inspectorMarker.addTo(map);
}
