// ── Landing constellation ──────────────────────────────────────────────────
(function(){
  const c=document.getElementById('cstar');
  if(!c) return;
  const ctx=c.getContext('2d');
  let pts=[];
  function resize(){c.width=innerWidth;c.height=innerHeight;}
  addEventListener('resize',resize);resize();
  for(let i=0;i<55;i++) pts.push({
    x:Math.random()*c.width,y:Math.random()*c.height,
    vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,
    r:1+Math.random()*1.4
  });
  function draw(){
    ctx.clearRect(0,0,c.width,c.height);
    pts.forEach(p=>{
      p.x+=p.vx;p.y+=p.vy;
      if(p.x<0)p.x=c.width;if(p.x>c.width)p.x=0;
      if(p.y<0)p.y=c.height;if(p.y>c.height)p.y=0;
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle='rgba(0,212,255,.55)';ctx.fill();
    });
    for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
      const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy);
      if(d<115){
        ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);
        ctx.strokeStyle=`rgba(0,212,255,${.18*(1-d/115)})`;ctx.lineWidth=.65;ctx.stroke();
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
})();

// ── App background particles ───────────────────────────────────────────────
(function(){
  const canvas=document.getElementById('app-bg');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  let pts=[];
  function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
  window.addEventListener('resize',resize);resize();
  for(let i=0;i<85;i++) pts.push({
    x:Math.random()*canvas.width,y:Math.random()*canvas.height,
    vx:(Math.random()-.5)*.35,vy:(Math.random()-.5)*.35,
    r:1+Math.random()*1.8
  });
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pts.forEach(p=>{
      p.x+=p.vx;p.y+=p.vy;
      if(p.x<0)p.x=canvas.width;if(p.x>canvas.width)p.x=0;
      if(p.y<0)p.y=canvas.height;if(p.y>canvas.height)p.y=0;
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle='rgba(0,212,255,.7)';ctx.fill();
    });
    for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
      const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy);
      if(d<145){
        ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);
        ctx.strokeStyle=`rgba(0,212,255,${.22*(1-d/145)})`;ctx.lineWidth=.7;ctx.stroke();
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
})();
