// ASCS LD2450 editor. All resources are served by the ESP32, including this file.
const $ = (id) => document.getElementById(id);
const viewport = document.createElement('meta');
viewport.name = 'viewport';
viewport.content = 'width=device-width, initial-scale=1';
document.head.append(viewport);
document.documentElement.lang = 'de';
document.title = 'Radarzonen · ASCS';
const style = document.createElement('style');
style.textContent = `
:root{color-scheme:dark;--page:#0c1218;--panel:#16212b;--line:#354450;--text:#f1f6f8;--muted:#b4c4cd;--accent:#85e6cd;--ink:#092118}
@media(prefers-color-scheme:light){:root{--page:#f1f5f6;--panel:#fff;--line:#c4d1d6;--text:#122833;--muted:#49616c;--accent:#006c59;--ink:#fff}}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--text);font:16px/1.45 system-ui,sans-serif}
main{max-width:720px;margin:auto;padding:22px clamp(12px,4vw,28px) 40px}header,.row,.bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
h1{font-size:clamp(24px,5vw,34px);margin:0;letter-spacing:-.045em}h2{font-size:16px;margin:0}p{margin:6px 0;color:var(--muted)}.brand{color:var(--accent);font-size:13px;font-weight:750;letter-spacing:.08em}
#connection{font-size:13px;color:var(--muted)}#connection[data-live=true]{color:var(--accent)}
.box{margin-top:14px;padding:clamp(12px,3vw,18px);border:1px solid var(--line);border-radius:18px;background:var(--panel)}
button,select{font:inherit;color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;min-height:42px;cursor:pointer}
button:focus-visible,select:focus-visible,canvas:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
button:disabled,select:disabled{opacity:.48;cursor:default}button[aria-pressed=true]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
#save{background:var(--accent);color:var(--ink);border-color:var(--accent);font-weight:700}.tabs,.actions,.tools{display:flex;gap:7px;flex-wrap:wrap}.tabs{margin:12px 0}.tabs button{flex:1;white-space:nowrap;font-weight:650}
.swatch{display:inline-block;width:11px;height:11px;margin-right:6px;border-radius:3px;border:1px solid #667}
.plot{overflow:hidden;border-radius:12px;background:#0b1b25}canvas{display:block;width:100%;aspect-ratio:10.8/8.6;touch-action:none;cursor:crosshair}
.small{font-size:14px}.tools{margin:10px 0 0}.tools button{font-size:14px}.status{min-height:1.5em;margin:12px 0 2px}.bar{align-items:flex-end}
label{font-size:14px;font-weight:600}select{display:block;margin-top:5px;max-width:100%}.actions{margin-top:13px}
`;
document.head.append(style);
const colors = ['#85e6cd', '#ffbd78', '#b5a2ff'];
document.body.innerHTML = `
<main><header><div><div class="brand">ASCS Multisensor</div><h1>Radarzonen</h1></div><span id="connection" role="status">Verbinde …</span></header>
<section class="box" aria-label="Radarkarte"><div class="row"><h2>Radarkarte</h2><span id="targets" class="small"></span></div>
<div class="tabs" aria-label="Aktive Zone">${colors.map((c,i)=>`<button data-zone="${i}" aria-pressed="false"><i class="swatch" style="background:${c}"></i>Zone ${i+1}</button>`).join('')}</div>
<div class="plot"><canvas id="map" tabindex="0" aria-label="Radarkarte, Sensor unten in der Mitte. Pfeiltasten verschieben eine Zone, Umschalt und Pfeiltasten ändern ihre Größe."></canvas></div>
<div class="tools"><button id="draw">Zeichnen</button><button id="adjust">Anpassen</button><button id="clear">Zone leeren</button></div>
<p class="small" id="hint"></p></section>
<section class="box"><label for="mode">Radarfilter für alle drei Zonen</label><select id="mode"><option>Gesamten Bereich erfassen</option><option>Nur innerhalb der Zonen erfassen</option><option>Bereiche in den Zonen ausblenden</option></select>
<div id="status" class="status small" role="status" aria-live="polite"></div>
<div class="actions"><button id="save">Auf Sensor speichern</button><button id="reset">Sensorwerte übernehmen</button></div></section></main>`;

const modeNames = ['Disabled','Detection','Filter'];
const coordNames = ['X1','Y1','X2','Y2'];
const keyIndex = new Map([['select/Zonen Typ', 0]]);
for (let z = 0; z < 3; z++) coordNames.forEach((name,i) => keyIndex.set('number/Zone-'+(z+1)+' '+name, 1+4*z+i));
const commandName = 'ASCS Zonenauftrag';
const received = Array(13).fill(null);
let baseline = null, draft = null, active = 0, tool = 'draw';
let connected = false, pending = null, drag = null, refresh = 0, lastMessage = '';
let points = Array.from({length:3}, () => [null,null]);
const same = (a,b) => a && b && a.every((v,i) => v === b[i]);
const dirty = () => draft && !same(draft,baseline);
const complete = () => received.every(Number.isInteger);
const editable = () => connected && complete() && !!draft && !pending;
const zone = (data,index=active) => data.slice(1+4*index,5+4*index);
const empty = (r) => r[0] === r[2] || r[1] === r[3];
const setZone = (r) => draft.splice(1+4*active,4,...r);
const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
const limits = [4860,7560];
function sync() {
  if (complete() && !pending && !drag && !dirty()) {
    baseline = received.slice(); draft = received.slice();
  }
  render();
}
function adopt() {
  if (!complete() || pending) return;
  baseline = received.slice(); draft = received.slice(); lastMessage = '';
  tool = empty(zone(draft)) ? 'draw' : 'adjust';
  render();
}
function render() {
  const can = editable();
  $('connection').textContent = connected ? '● Lokal verbunden' : '○ Verbindung unterbrochen';
  $('connection').dataset.live = String(connected);
  const count = points.filter(p=>p.every(Number.isFinite)).length;
  $('targets').textContent = count === 1 ? '1 Ziel' : count+' Ziele';
  document.querySelectorAll('[data-zone]').forEach((b,i) => {
    b.disabled = !can; b.setAttribute('aria-pressed',String(active===i));
  });
  $('draw').disabled = !can;
  $('adjust').disabled = $('clear').disabled = !can || empty(zone(draft));
  $('draw').setAttribute('aria-pressed',String(tool==='draw'));
  $('adjust').setAttribute('aria-pressed',String(tool==='adjust'));
  $('mode').disabled = !can;
  if (draft) $('mode').selectedIndex = draft[0];
  $('save').disabled = !can || !dirty() || !same(received,baseline);
  $('reset').disabled = !can || (!dirty() && same(received,baseline));
  $('hint').textContent = tool==='draw' ? 'Ziehe auf der Karte ein Rechteck für Zone '+(active+1)+' auf.' : 'Ziehe die Fläche zum Verschieben oder eine Ecke zum Vergrößern.';
  $('status').textContent = pending ? 'Warte auf die Bestätigung des Radars …'
    : !connected ? 'Warte auf die Verbindung zum Sensor.'
    : !complete() ? 'Lese die Zonen vom LD2450 …'
    : dirty() && !same(received,baseline) ? 'Die Sensorwerte haben sich geändert. Übernimm die neuen Werte und zeichne erneut.'
    : lastMessage || (dirty() ? 'Ungespeicherte Änderungen.' : 'Zonen vom Sensor geladen.');
  paint();
}

const canvas = $('map'), ctx = canvas.getContext('2d');
function geometry() {
  const w=canvas.clientWidth,h=canvas.clientHeight;
  const scale=Math.min((w-42)/(2*limits[0]),(h-45)/limits[1]);
  return {w,h,scale,ox:w/2,oy:h-25};
}
function paint() {
  const {w,h,scale,ox,oy}=geometry();
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio||1,3);
  if (canvas.width!==Math.round(w*dpr) || canvas.height!==Math.round(h*dpr)) {
    canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
  }
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  const px=x=>ox+x*scale, py=y=>oy-y*scale;
  const line=(x1,y1,x2,y2)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
  ctx.font='11px system-ui'; ctx.textAlign='center';ctx.strokeStyle='#263d49';ctx.fillStyle='#a6bdc7';ctx.lineWidth=1;
  for(let x=-4000;x<=4000;x+=1000) {
    line(px(x),py(0),px(x),py(limits[1]));
    if(x && x%2000===0) ctx.fillText(x/1000+' m',px(x),oy+16);
  }
  for(let y=0;y<=7000;y+=1000) {
    line(px(-limits[0]),py(y),px(limits[0]),py(y));
    if(y && y%2000===0) {ctx.textAlign='left';ctx.fillText(y/1000+' m',3,py(y)-3);ctx.textAlign='center';}
  }
  if(draft) [0,1,2].filter(i=>i!==active).concat(active).forEach(i=>{
    const r=zone(draft,i); if(empty(r))return;
    const l=px(Math.min(r[0],r[2])),t=py(Math.max(r[1],r[3])),rw=Math.abs(r[2]-r[0])*scale,rh=Math.abs(r[3]-r[1])*scale;
    ctx.fillStyle=colors[i]+(i===active?'37':'1c');ctx.fillRect(l,t,rw,rh);
    ctx.strokeStyle=colors[i];ctx.lineWidth=i===active?2.5:1.5;ctx.strokeRect(l,t,rw,rh);
    ctx.fillStyle=colors[i]; if(rw>23&&rh>18) ctx.fillText('Z'+(i+1),l+12,t+14);
    if(i===active && tool==='adjust') for(const x of [l,l+rw]) for(const y of [t,t+rh]) ctx.fillRect(x-4,y-4,8,8);
  });
  points.forEach(([x,y],i)=>{
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    ctx.beginPath();ctx.arc(px(x),py(y),5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#112832';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#fff';ctx.fillText('Ziel '+(i+1),px(x),py(y)-9);
  });
  ctx.fillStyle='#e0edf0';ctx.beginPath();ctx.moveTo(ox,oy-8);ctx.lineTo(ox-6,oy+2);ctx.lineTo(ox+6,oy+2);ctx.fill();ctx.fillText('Sensor',ox,oy+17);
}
function coord(event) {
  const {scale,ox,oy}=geometry(),bounds=canvas.getBoundingClientRect();
  const snap=v=>Math.round(v/50)*50;
  return [clamp(snap((event.clientX-bounds.left-ox)/scale),-4860,4860),clamp(snap((oy-event.clientY+bounds.top)/scale),0,7560)];
}
const ordered = ([x1,y1],[x2,y2]) => [Math.min(x1,x2),Math.min(y1,y2),Math.max(x1,x2),Math.max(y1,y2)];
function shifted(r,dx,dy) {
  dx=clamp(dx,-4860-r[0],4860-r[2]);dy=clamp(dy,-r[1],7560-r[3]);
  return [r[0]+dx,r[1]+dy,r[2]+dx,r[3]+dy];
}
canvas.onpointerdown=e=>{
  if(!editable() || drag || e.button!==0)return;
  const pos=coord(e),old=zone(draft),r=ordered(old.slice(0,2),old.slice(2));
  let action='draw', anchor=pos;
  if(tool==='adjust' && !empty(r)){
    const corners=[[r[0],r[1]],[r[2],r[1]],[r[2],r[3]],[r[0],r[3]]];
    const d=corners.map(c=>Math.hypot(c[0]-pos[0],c[1]-pos[1]));
    const nearest=d.indexOf(Math.min(...d));
    if(d[nearest]*geometry().scale<=15){anchor=corners[(nearest+2)%4];action='resize';}
    else if(pos[0]>=r[0]&&pos[0]<=r[2]&&pos[1]>=r[1]&&pos[1]<=r[3])action='move';
    else return;
  }
  drag={id:e.pointerId,pos,anchor,old,r,action,moved:false};canvas.setPointerCapture(e.pointerId);
};
canvas.onpointermove=e=>{
  if(!drag || drag.id!==e.pointerId)return;
  const p=coord(e),dx=p[0]-drag.pos[0],dy=p[1]-drag.pos[1];
  if(!drag.moved && !dx && !dy)return;
  drag.moved=true;
  setZone(drag.action==='move'?shifted(drag.r,dx,dy):ordered(drag.anchor,p));paint();
};
function finishDrag(e,cancel=false){
  if(!drag||drag.id!==e.pointerId)return;
  if(cancel||!drag.moved||empty(zone(draft)))setZone(drag.old);
  else {tool='adjust';lastMessage='';}
  drag=null;sync();
}
canvas.onpointerup=e=>{canvas.onpointermove(e);finishDrag(e);};
canvas.onpointercancel=e=>finishDrag(e,true);
canvas.onlostpointercapture=e=>finishDrag(e,true);
canvas.onkeydown=e=>{
  if(!editable()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();let r=zone(draft);
  const dx=({'ArrowLeft':-100,'ArrowRight':100})[e.key]||0,dy=({'ArrowDown':-100,'ArrowUp':100})[e.key]||0;
  if(empty(r))r=[-500,500,500,1500];
  else r=ordered(r.slice(0,2),r.slice(2));
  setZone(e.shiftKey?[r[0],r[1],clamp(r[2]+dx,r[0]+1,4860),clamp(r[3]+dy,r[1]+1,7560)]:shifted(r,dx,dy));
  lastMessage='';render();
};
document.querySelectorAll('[data-zone]').forEach((b,i)=>b.onclick=()=>{active=i;tool=empty(zone(draft))?'draw':'adjust';render();});
$('draw').onclick=()=>{tool='draw';render();}; $('adjust').onclick=()=>{tool='adjust';render();};
$('clear').onclick=()=>{setZone([0,0,0,0]);tool='draw';lastMessage='';render();};
$('mode').onchange=()=>{draft[0]=$('mode').selectedIndex;lastMessage='';render();};
$('reset').onclick=adopt;
const reasons={busy:'Ein anderer Speichervorgang läuft.',conflict:'Die Werte wurden inzwischen geändert. Übernimm die Sensorwerte erneut.',
  invalid:'Die Zone ist ungültig.',unavailable:'Das Radar liefert noch keine Konfiguration.',
  timeout:'Der LD2450 hat nicht rechtzeitig geantwortet.',mismatch:'Die vom Radar zurückgelesenen Werte weichen ab.'};
function result(token,code){
  if(!pending || pending.token!==token)return;
  clearTimeout(pending.timer); const saved=pending.values; pending=null;
  if(code==='ok'){
    // This message is produced only after a matching radar readback.
    baseline=saved.slice();draft=saved.slice(); received.splice(0,13,...saved);
    lastMessage='Auf dem LD2450 gespeichert und bestätigt.';
  } else lastMessage=reasons[code]||'Speichern unbestätigt. Prüfe die Sensorwerte.';
  render();
}
$('save').onclick=async()=>{
  if(!editable()||!dirty()||!same(received,baseline))return;
  const token=Array.from(crypto.getRandomValues(new Uint8Array(4)),v=>v.toString(16).padStart(2,'0')).join('');
  const command=[token,baseline.join(','),draft.join(',')].join('|');
  pending={token,values:draft.slice(),timer:setTimeout(()=>result(token,'unknown'),9000)};render();
  try{
    const path='/text/'+encodeURIComponent(commandName)+'/set?'+new URLSearchParams({value:command});
    const response=await fetch(path,{method:'POST',cache:'no-store'});
    if(!response.ok)result(token,'network');
  }catch{result(token,'network');}
};
const events=new EventSource('/events');
events.onopen=()=>{connected=true;render();};
events.onerror=()=>{
  connected=false;received.fill(null);points=Array.from({length:3},()=>[null,null]);
  if(drag){setZone(drag.old);drag=null;}
  if(pending)result(pending.token,'network');render();
};
events.addEventListener('state',e=>{
  let data;try{data=JSON.parse(e.data);}catch{return;}
  const id=data.id||'',raw=data.value;
  if(id==='text/'+commandName && typeof raw==='string'){const [token,code]=raw.split('|');result(token,code);return;}
  const index=keyIndex.get(id);
  if(index!==undefined){
    const n=index===0?modeNames.indexOf(raw):Number(raw);
    received[index]=(raw!==null&&raw!==undefined&&raw!==''&&Number.isInteger(n)&&(index!==0||n>=0))?n:null;
  }else{
    const match=/^sensor\/Ziel-([123]) ([XY])$/.exec(id);
    if(!match)return;
    points[+match[1]-1][match[2]==='X'?0:1]=(raw!==null&&raw!==''&&Number.isFinite(Number(raw)))?Number(raw):null;
  }
  if(!refresh)refresh=setTimeout(()=>{refresh=0;sync();},65);
});
new ResizeObserver(paint).observe(canvas);
render();
