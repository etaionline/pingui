// ── Globals & Session ──────────────────────────────────────────────────────

let pingWs            = null;
let traceEs           = null;
let traceSeq          = 0;
let traceQueue        = [];
let traceFlushTimer   = null;
let lastTraceRenderAt = 0;
let traceDone         = false;   // tracks whether current trace received 'done'
const TRACE_ROLL_MS   = 140;
let map               = null;
let myIp              = null;
let activeTarget      = null;
let sessionId         = null;
let snapshotCount     = 0;
let tabOrder          = [];

const sessionStore = new Map();

function getSession(target) {
  if (!sessionStore.has(target)) {
    sessionStore.set(target, {
      target,
      pingResults:   [],
      traceHops:     [],
      traceRawLines: '',
      mapMarkers:    [],
      mapPolyline:   null,
      mapPawMarkers: [],
      originMarker:  null,
      inspectorMarker: null,
      wpTarget:      null,
      wpResults:     [],
      whoisData:     null,
      whoisRaw:      '',
      PS: {min:null, max:null, sum:0, count:0, loss:0},
      clusterColors: new Map(),
    });
  }
  return sessionStore.get(target);
}

function sess() {
  return activeTarget ? getSession(activeTarget) : null;
}

// ── Utils ──────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function escAttr(s) {
  return String(s)
    .replace(/'/g,'&#39;')
    .replace(/"/g,'&quot;');
}

function flag(cc) {
  if (!cc || cc.length !== 2) return '';
  return String.fromCodePoint(
    ...cc.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
  );
}

function privateIpDesc(ip){
  const p=ip.split('.').map(Number);
  if(p.length!==4) return 'Private';
  if(p[0]===127) return 'Loopback';
  if(p[0]===10) return 'Private · Class A';
  if(p[0]===172&&p[1]>=16&&p[1]<=31) return 'Private · Class B';
  if(p[0]===192&&p[1]===168) return 'Private · LAN';
  return 'Private';
}
