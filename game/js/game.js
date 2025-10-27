(() => {
  const cvs = document.getElementById('canvas');
  const ctx = cvs.getContext('2d');
  const hud = document.getElementById('hud');
  const mini = document.getElementById('mini');
  const mctx = mini.getContext('2d');

  // ---------- Config ----------
  const FOV = Math.PI / 3;           // 60°
  const MAX_DEPTH = 20;
  const WALL_SIZE = 1;
  const MOVE_SPEED = 3.0;
  const ROT_SPEED = 2.4;
  const STRAFE_SPEED = 2.4;
  const BULLET_COOLDOWN = 0.22;
  const ENEMY_SPEED = 0.9;
  const ENEMY_HITBOX = 0.35;

  // ---------- Map ----------
  const MAP = [
    '111111111111111111',
    '1...........2....1',
    '1..111..1........1',
    '1..1....1..11....1',
    '1..1....1........1',
    '1..1....1111.....1',
    '1............3...1',
    '1..1111..........1',
    '1..1..1..111.....1',
    '1..1..1..........1',
    '1..1..1111..111..1',
    '1............1...1',
    '1..2........1...31',
    '1...........1....1',
    '1....111.........1',
    '1..............E.1',
    '1................1',
    '111111111111111111',
  ].map(r => r.split(''));

  const H = MAP.length, W = MAP[0].length;

  // Enemies from markers
  const enemies = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = MAP[y][x];
    if (t === '2' || t === '3' || t === 'E') {
      enemies.push({
        x: x + 0.5, y: y + 0.5,
        hp: (t === 'E') ? 5 : (t === '3') ? 3 : 2,
        color: (t === 'E') ? '#ff4444' : (t === '3') ? '#ff8844' : '#ffaa33'
      });
      MAP[y][x] = '.';
    }
  }

  // Player
  const player = { x: 2.5, y: 2.5, angle: 0, hp: 100, ammo: 99, lastShot: -999 };

  // Input (A/D turn; Q/E strafe)
  const keys = { w:false, s:false, strafeL:false, strafeR:false, left:false, right:false, fire:false };
  let dragging = false, lastDragX = null;

  // Resize
  function resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rectW = window.innerWidth;
    const rectH = window.innerHeight - 46; // header approx
    cvs.width = Math.floor(rectW * dpr);
    cvs.height = Math.floor(rectH * dpr);
    cvs.style.width = rectW + 'px';
    cvs.style.height = rectH + 'px';
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  // Helpers
  function isWall(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (yi < 0 || yi >= H || xi < 0 || xi >= W) return true;
    return MAP[yi][xi] === '1';
  }
  function castRay(px, py, angle) {
    const sin = Math.sin(angle), cos = Math.cos(angle);
    let dist = 0, hit = false, hitX=0, hitY=0, side=0;
    while (!hit && dist < MAX_DEPTH) {
      dist += 0.01;
      hitX = px + cos * dist; hitY = py + sin * dist;
      if (isWall(hitX, hitY)) {
        hit = true;
        const fx = hitX - Math.floor(hitX), fy = hitY - Math.floor(hitY);
        side = (fx < 0.02 || fx > 0.98) ? 1 : (fy < 0.02 || fy > 0.98) ? 0 : 0.5;
      }
    }
    return { dist, hitX, hitY, side };
  }
  function canMove(nx, ny) {
    const pad = 0.2;
    return !(isWall(nx - pad, ny - pad) || isWall(nx + pad, ny - pad) || isWall(nx - pad, ny + pad) || isWall(nx + pad, ny + pad));
  }

  // Shooting
  function tryShoot(time) {
    if (time - player.lastShot < BULLET_COOLDOWN || player.ammo <= 0) return;
    player.lastShot = time; player.ammo--;

    let closest = null, cDist = Infinity, idxHit = -1;
    enemies.forEach((e, i) => {
      const dx = e.x - player.x, dy = e.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > MAX_DEPTH) return;
      let ang = Math.atan2(dy, dx) - player.angle;
      ang = (ang + Math.PI*3) % (Math.PI*2) - Math.PI;
      if (Math.abs(ang) < (FOV * 0.5) * 0.4) {
        const steps = Math.ceil(dist / 0.05);
        let blocked = false;
        for (let s=1; s<=steps; s++) {
          const tx = player.x + (dx * s/steps);
          const ty = player.y + (dy * s/steps);
          if (isWall(tx, ty)) { blocked = true; break; }
        }
        if (!blocked && dist < cDist) { cDist = dist; closest = e; idxHit = i; }
      }
    });
    if (closest) { closest.hp -= 1; if (closest.hp <= 0) enemies.splice(idxHit, 1); }
  }

  // Enemies
  function updateEnemies(dt) {
    enemies.forEach(e => {
      const dx = player.x - e.x, dy = player.y - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        const step = Math.min(ENEMY_SPEED * dt, dist - 0.001);
        const nx = e.x + (dx / dist) * step * 0.6;
        const ny = e.y + (dy / dist) * step * 0.6;
        if (!isWall(nx, e.y)) e.x = nx;
        if (!isWall(e.x, ny)) e.y = ny;
      }
      if (dist < ENEMY_HITBOX + 0.2) player.hp = Math.max(0, player.hp - 10 * dt);
    });
  }

  // Keyboard
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyW') keys.w = true;
    if (e.code === 'KeyS') keys.s = true;
    if (e.code === 'KeyA') keys.left = true;     // turn
    if (e.code === 'KeyD') keys.right = true;    // turn
    if (e.code === 'KeyQ') keys.strafeL = true;  // strafe
    if (e.code === 'KeyE') keys.strafeR = true;  // strafe
    if (e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'Space') { keys.fire = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'KeyW') keys.w = false;
    if (e.code === 'KeyS') keys.s = false;
    if (e.code === 'KeyA') keys.left = false;
    if (e.code === 'KeyD') keys.right = false;
    if (e.code === 'KeyQ') keys.strafeL = false;
    if (e.code === 'KeyE') keys.strafeR = false;
    if (e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'Space') keys.fire = false;
  });

  // Mouse look + click fire
  cvs.addEventListener('mousedown', e => { dragging = true; lastDragX = e.clientX; });
  window.addEventListener('mouseup', () => { dragging = false; lastDragX = null; });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    if (lastDragX != null) player.angle += (e.clientX - lastDragX) * 0.003;
    lastDragX = e.clientX;
  });
  cvs.addEventListener('click', () => tryShoot(performance.now()/1000));
  window.addEventListener('contextmenu', e => e.preventDefault());

  // Touch controls
  const controls = document.getElementById('controls');
  controls.addEventListener('touchstart', onTouch, {passive:false});
  controls.addEventListener('touchend', onTouchEnd, {passive:false});
  controls.addEventListener('touchmove', onTouchMove, {passive:false});
  let touchLookId = null, touchLookLastX = null;

  function onTouch(e){
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (!el || !el.dataset) continue;
      const act = el.dataset.act;
      if (!act) continue;
      if (act === 'fire') { keys.fire = true; }
      if (act === 'moveF') keys.w = true;
      if (act === 'moveB') keys.s = true;
      if (act === 'strafeL') keys.strafeL = true;
      if (act === 'strafeR') keys.strafeR = true;
      if (act === 'turnL') keys.left = true;
      if (act === 'turnR') keys.right = true;
      if (act === 'look') { touchLookId = t.identifier; touchLookLastX = t.clientX; }
    }
    e.preventDefault();
  }
  function onTouchMove(e){
    for (const t of e.changedTouches) {
      if (t.identifier === touchLookId && touchLookLastX != null) {
        player.angle += (t.clientX - touchLookLastX) * 0.004;
        touchLookLastX = t.clientX;
      }
    }
    e.preventDefault();
  }
  function onTouchEnd(e){
    keys.fire = false; keys.w=false; keys.s=false; keys.strafeL=false; keys.strafeR=false; keys.left=false; keys.right=false;
    for (const t of e.changedTouches) if (t.identifier === touchLookId) { touchLookId = null; touchLookLastX = null; }
    e.preventDefault();
  }

  // Loop
  let last = performance.now() / 1000;
  function step() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.033, now - last);
    last = now;

    // Movement
    let moveX = 0, moveY = 0;
    const cos = Math.cos(player.angle), sin = Math.sin(player.angle);
    if (keys.w) { moveX += cos * MOVE_SPEED * dt; moveY += sin * MOVE_SPEED * dt; }
    if (keys.s) { moveX -= cos * MOVE_SPEED * dt; moveY -= sin * MOVE_SPEED * dt; }
    if (keys.strafeL) { moveX += -sin * STRAFE_SPEED * dt; moveY +=  cos * STRAFE_SPEED * dt; }
    if (keys.strafeR) { moveX +=  sin * STRAFE_SPEED * dt; moveY += -cos * STRAFE_SPEED * dt; }
    const nx = player.x + moveX, ny = player.y + moveY;
    if (canMove(nx, player.y)) player.x = nx;
    if (canMove(player.x, ny)) player.y = ny;

    if (keys.left)  player.angle -= ROT_SPEED * dt;
    if (keys.right) player.angle += ROT_SPEED * dt;

    if (keys.fire) tryShoot(now);

    updateEnemies(dt);
    render();
    requestAnimationFrame(step);
  }

  function render() {
    const w = cvs.width, h = cvs.height, half = h >> 1;

    // Ceiling
    const gTop = ctx.createLinearGradient(0,0,0,half);
    gTop.addColorStop(0, '#0a0a0e'); gTop.addColorStop(1, '#0d0f17');
    ctx.fillStyle = gTop; ctx.fillRect(0,0,w,half);
    // Floor
    const gBot = ctx.createLinearGradient(0,half,0,h);
    gBot.addColorStop(0, '#0d0f17'); gBot.addColorStop(1, '#10151c');
    ctx.fillStyle = gBot; ctx.fillRect(0,half,w,h-half);

    // Walls
    const rays = Math.floor(180 * (w / 800));
    const colWidth = w / rays;
    const startAngle = player.angle - FOV/2;
    for (let i = 0; i < rays; i++) {
      const rayAng = startAngle + (i / rays) * FOV;
      const { dist, side } = castRay(player.x, player.y, rayAng);
      const corrected = dist * Math.cos(rayAng - player.angle);
      const wallH = Math.min(h, (WALL_SIZE / corrected) * (h / (2 * Math.tan(FOV/2))));
      const shade = Math.max(0, 1 - corrected / MAX_DEPTH);
      const wallCol = side < 0.5 ? 170 : 200;
      const x = Math.floor(i * colWidth);
      ctx.fillStyle = `rgba(${wallCol},${Math.floor(120+50*shade)},${Math.floor(140+20*shade)},${0.85})`;
      ctx.fillRect(x, (half - wallH/2), Math.ceil(colWidth+1), wallH);
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.25, 0.005 * corrected)})`;
      ctx.fillRect(x, 0, 1, h);
    }

    // Sprites (enemies)
    const spr = enemies.map(e => {
      const dx = e.x - player.x, dy = e.y - player.y;
      const dist = Math.hypot(dx, dy);
      let angle = Math.atan2(dy, dx) - player.angle;
      angle = (angle + Math.PI*3) % (Math.PI*2) - Math.PI;
      return { e, dist, angle };
    }).filter(s => Math.abs(s.angle) < FOV/1.2)
      .sort((a,b) => b.dist - a.dist);

    spr.forEach(s => {
      const { e, dist, angle } = s;
      const size = Math.min(h, (1.4 / dist) * (h / (2 * Math.tan(FOV/2))) * 1.8);
      const screenX = (angle / FOV + 0.5) * cvs.width;
      const top = (h/2) - size*0.9;
      const alpha = Math.max(0.15, 1 - dist / (MAX_DEPTH*0.9));
      ctx.fillStyle = hexWithAlpha(e.color, alpha);
      ctx.fillRect(screenX - size/2, top, size, size);
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.5, 0.2 + dist*0.02)})`;
      ctx.fillRect(screenX - size/2, top + size*0.4, size, size*0.15);
    });

    // Crosshair
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w/2 - 10, h/2); ctx.lineTo(w/2 + 10, h/2);
    ctx.moveTo(w/2, h/2 - 10); ctx.lineTo(w/2, h/2 + 10);
    ctx.stroke();

    // HUD + minimap
    hud.textContent = `HP ${Math.round(player.hp)}  •  Ammo ${player.ammo}  •  Demons ${enemies.length}`;
    renderMini();
  }

  function renderMini() {
    const mw = mini.width, mh = mini.height;
    mctx.clearRect(0,0,mw,mh);
    const cellX = mw / (W), cellY = mh / (H);
    for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
      mctx.fillStyle = (MAP[y][x] === '1') ? '#3a3f47' : '#13161b';
      mctx.fillRect(x*cellX, y*cellY, cellX, cellY);
    }
    enemies.forEach(e => {
      mctx.fillStyle = '#ff6464';
      mctx.beginPath(); mctx.arc(e.x*cellX, e.y*cellY, 3, 0, Math.PI*2); mctx.fill();
    });
    mctx.fillStyle = '#9ee37d';
    mctx.beginPath(); mctx.arc(player.x*cellX, player.y*cellY, 3, 0, Math.PI*2); mctx.fill();
    mctx.strokeStyle = '#9ee37d';
    mctx.beginPath();
    mctx.moveTo(player.x*cellX, player.y*cellY);
    mctx.lineTo((player.x + Math.cos(player.angle)*0.8)*cellX, (player.y + Math.sin(player.angle)*0.8)*cellY);
    mctx.stroke();
  }

  function hexWithAlpha(hex, a){
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  requestAnimationFrame(step);
})();
