/* GHOST KINGDOM - GAME LOGIC v2
   Requires the existing index.html
   Three.js loads from CDN

   নতুন: ৫০ লেভেল + ফিনিশ লাইন, টাচ স্টিয়ারিং হুইল, ইঞ্জিন ও ভূতের সাউন্ড,
   ল্যাম্পপোস্ট + ভূতের ছায়া, পেছন থেকে ধাওয়া করা ভূতের গাড়ি, দৃশ্যমান শর্টকাট
*/

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const game = $("game");
  const startOverlay = $("startOverlay");
  const startButton = $("startButton");

  const speedValue = $("speedValue");
  const distanceValue = $("distanceValue");
  const scoreValue = $("scoreValue");
  const gameStatus = $("gameStatus");
  const roadMessage = $("roadMessage");
  const shortcutHint = $("shortcutHint");

  const headlightButton = $("headlightButton");
  const headlightBeam = $("headlightBeam");
  const brakeButton = $("brakeButton");
  const accelerateButton = $("accelerateButton");
  const shortcutSteering = $("shortcutSteering");

  // ------------------------------------------------------------
  // CONSTANTS
  // ------------------------------------------------------------
  const TOTAL_LEVELS = 50;
  const PLAYER_Z = 4;
  const ROAD_WIDTH = 13;
  const MAX_SPEED = 300;
  const U = 0.11;               // speed -> world units per second
  const WHEEL_MAX = 135;        // steering wheel max rotation (deg)
  const NORMAL_LIMIT = 5.4;
  const SHORTCUT_LIMIT = 11.4;
  const SC_LEN = 76;
  const SC_LANE_X = 9.8;
  const LAMP_GAP = 26;
  const LAMP_STATIONS = 11;

  const THEMES = [
    { name: "ভুতুড়ে গ্রাম",            sky: 0x050a10, fog: 0x071017 },
    { name: "কুয়াশার হাইওয়ে",          sky: 0x07110f, fog: 0x0b1a17 },
    { name: "রক্তচাঁদের পথ",            sky: 0x12060a, fog: 0x1a090e },
    { name: "নীল শ্মশান",               sky: 0x070815, fog: 0x0c0f24 },
    { name: "ভূত সাম্রাজ্যের দ্বার",     sky: 0x0d0614, fog: 0x160a22 }
  ];

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  let THREE, scene, camera, renderer, rearCam, player;
  let headlights = [];

  let active = false;
  let ended = false;
  let looping = false;

  let speed = 0;
  let distance = 0;
  let score = 0;

  let carX = 0;
  let tiltInput = 0;
  let tiltCenter = null;

  let accelHeld = false;
  let brakeHeld = false;
  let keyAccel = false;
  let keyBrake = false;
  const keys = { left: false, right: false };
  let headlightOn = true;

  let wheelBox = null;
  let wheelRot = null;
  let wheelAngle = 0;
  let wheelDrag = false;
  let wheelPointer = null;
  let wheelStartPtr = 0;
  let wheelStartAngle = 0;

  let ghostCars = [];
  let scenery = [];
  let lamps = [];
  let lampLights = [];
  let obstacles = [];
  let roadSegments = [];

  let level = 1;
  let cfg = null;
  let levelDist = 0;
  let levelStartScore = 0;
  let timeLeft = 0;
  let finishObj = null;
  let finishSpawned = false;
  let lastTick = -1;

  let shortcut = null;
  let shortcutUiShown = false;
  let nextShortcutAt = 200;

  let shake = 0;
  let flash = 0;
  let hauntTimer = 0;
  let heartTimer = 0;
  let lastWarn = 0;

  let audioCtx = null;
  let master = null;
  let noiseBuf = null;
  let engine = null;
  let wind = null;
  let soundTimeout = null;

  let lastFrame = 0;
  let roadTravel = 0;

  let hudEls = {};
  let rearEl = null;
  let vignetteEl = null;
  let flashEl = null;
  let tex = {};

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function setMessage(text) {
    roadMessage.textContent = text;
  }

  // ------------------------------------------------------------
  // LEVEL CONFIG (১ থেকে ৫০, ধীরে ধীরে কঠিন)
  // ------------------------------------------------------------
  function levelConfig(n) {
    const t = n - 1;
    const length = Math.round(520 + t * 26);
    const reqSpeed = 9.5 + t * 0.2;

    return {
      n,
      theme: THEMES[Math.min(THEMES.length - 1, Math.floor(t / 10))],
      length,
      timeLimit: Math.round(length / reqSpeed + 10),
      obstacleTarget: Math.min(12 + Math.floor(t * 0.8), 50),
      ghostSpeed: Math.min(70 + t * 3.2, 235),
      fogDensity: 0.014 + t * 0.00022
    };
  }

  // ------------------------------------------------------------
  // EXTRA UI (স্টিয়ারিং হুইল, লেভেল HUD, রিয়ার ক্যাম)
  // ------------------------------------------------------------
  function injectUI() {
    const style = document.createElement("style");

    style.textContent = `
      #levelHud{position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);
        left:50%;transform:translateX(-50%);z-index:6;pointer-events:none;
        text-align:center;color:#bff7ff;font:700 12px/1.35 system-ui,sans-serif;
        text-shadow:0 0 8px #19baca;min-width:200px}
      #levelHud .lv{font-size:15px;letter-spacing:.08em}
      #levelHud .th{font-size:11px;opacity:.75}
      #levelHud .tm.low{color:#ff6b6b;text-shadow:0 0 8px #ff2d2d}
      #levelHud .bar{height:5px;margin-top:4px;border:1px solid #35dce9aa;
        border-radius:4px;overflow:hidden;background:#0008}
      #levelHud .bar i{display:block;height:100%;width:0;
        background:linear-gradient(90deg,#35dce9,#9c72ff)}

      #rearCam{position:absolute;right:10px;
        top:calc(env(safe-area-inset-top,0px) + 78px);
        width:min(36vw,170px);aspect-ratio:2/1;z-index:5;pointer-events:none;
        border:2px solid #35dce9;border-radius:10px;
        box-shadow:0 0 14px #19baca88, inset 0 0 22px #000b}
      #rearCam span{position:absolute;left:7px;top:3px;font:700 9px system-ui,sans-serif;
        color:#9ff;letter-spacing:.12em}

      #ghostVignette{position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;
        background:radial-gradient(ellipse at center,transparent 45%,#5b1bb7cc 100%)}
      #scareFlash{position:absolute;inset:0;z-index:8;pointer-events:none;opacity:0;
        background:radial-gradient(circle,#dffcff 0%,#35dce9 55%,#1a0a30 100%);
        mix-blend-mode:screen}

      #steeringWheel{position:absolute;left:50%;
        bottom:calc(env(safe-area-inset-bottom,0px) + var(--wheel-bottom,14px));
        width:var(--wheel-size,min(34vw,170px));aspect-ratio:1;
        transform:translateX(-50%);z-index:7;touch-action:none;
        user-select:none;-webkit-user-select:none;cursor:grab;
        filter:drop-shadow(0 6px 10px #000c)}
      #steeringWheel.drag{cursor:grabbing;filter:drop-shadow(0 0 14px #35dce9aa)}
      #steeringWheel .rot{width:100%;height:100%;display:block;pointer-events:none}
    `;

    document.head.appendChild(style);

    const hud = document.createElement("div");
    hud.id = "levelHud";
    hud.innerHTML = `
      <div class="lv" id="hudLevel"></div>
      <div class="th" id="hudTheme"></div>
      <div class="tm" id="hudTime"></div>
      <div class="bar"><i id="hudBar"></i></div>`;
    game.appendChild(hud);

    hudEls = {
      level: $("hudLevel"),
      theme: $("hudTheme"),
      time: $("hudTime"),
      bar: $("hudBar"),
      box: hud
    };

    rearEl = document.createElement("div");
    rearEl.id = "rearCam";
    rearEl.innerHTML = "<span>REAR CAM</span>";
    game.appendChild(rearEl);

    vignetteEl = document.createElement("div");
    vignetteEl.id = "ghostVignette";
    game.appendChild(vignetteEl);

    flashEl = document.createElement("div");
    flashEl.id = "scareFlash";
    game.appendChild(flashEl);

    // Steering wheel
    wheelBox = $("steeringWheel");

    if (!wheelBox) {
      wheelBox = document.createElement("div");
      wheelBox.id = "steeringWheel";
      game.appendChild(wheelBox);
    }

    wheelBox.innerHTML = `
      <svg class="rot" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="86" fill="none" stroke="#0a1115" stroke-width="26"/>
        <circle cx="100" cy="100" r="86" fill="none" stroke="#2a3a42" stroke-width="21"/>
        <circle cx="100" cy="100" r="86" fill="none" stroke="#4c636d"
                stroke-width="3" stroke-dasharray="2 8" opacity=".8"/>
        <path d="M100 100 L26 108 M100 100 L174 108 M100 100 L100 172"
              stroke="#22323a" stroke-width="17" stroke-linecap="round" fill="none"/>
        <path d="M100 100 L26 108 M100 100 L174 108 M100 100 L100 172"
              stroke="#35484f" stroke-width="3" stroke-linecap="round" fill="none"/>
        <circle cx="100" cy="100" r="27" fill="#0d151a" stroke="#35dce9" stroke-width="3"/>
        <circle cx="100" cy="100" r="9" fill="#35dce9" opacity=".85"/>
        <rect x="93" y="5" width="14" height="19" rx="3" fill="#35dce9"/>
      </svg>`;

    wheelRot = wheelBox.querySelector(".rot");

    const pointerAngle = e => {
      const r = wheelBox.getBoundingClientRect();
      return Math.atan2(
        e.clientY - (r.top + r.height / 2),
        e.clientX - (r.left + r.width / 2)
      ) * 180 / Math.PI;
    };

    wheelBox.addEventListener("pointerdown", e => {
      e.preventDefault();

      wheelDrag = true;
      wheelPointer = e.pointerId;
      wheelStartPtr = pointerAngle(e);
      wheelStartAngle = wheelAngle;
      wheelBox.classList.add("drag");

      try { wheelBox.setPointerCapture(e.pointerId); } catch (_) {}
    });

    wheelBox.addEventListener("pointermove", e => {
      if (!wheelDrag || e.pointerId !== wheelPointer) return;
      e.preventDefault();

      let d = pointerAngle(e) - wheelStartPtr;

      while (d > 180) d -= 360;
      while (d < -180) d += 360;

      wheelAngle = clamp(wheelStartAngle + d, -WHEEL_MAX, WHEEL_MAX);
      renderWheel();
    });

    const release = e => {
      if (e && e.pointerId !== wheelPointer) return;
      wheelDrag = false;
      wheelPointer = null;
      wheelBox.classList.remove("drag");
    };

    ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev =>
      wheelBox.addEventListener(ev, release)
    );

    renderWheel();
  }

  function renderWheel() {
    if (wheelRot) wheelRot.style.transform = `rotate(${wheelAngle}deg)`;
  }

  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" +
           String(s % 60).padStart(2, "0");
  }

  function updateHUD() {
    speedValue.textContent = Math.round(speed);
    distanceValue.textContent = (distance / 1000).toFixed(1) + " KM";
    scoreValue.textContent = Math.floor(score);

    if (cfg) {
      hudEls.level.textContent = `LEVEL ${level} / ${TOTAL_LEVELS}`;
      hudEls.theme.textContent = cfg.theme.name;
      hudEls.time.textContent = "⏱ " + fmtTime(timeLeft);
      hudEls.time.classList.toggle("low", timeLeft < 10);
      hudEls.bar.style.width =
        clamp(levelDist / cfg.length * 100, 0, 100) + "%";
    }
  }

  // ------------------------------------------------------------
  // HEADLIGHT
  // ------------------------------------------------------------
  function setHeadlight(on) {
    headlightOn = on;

    headlightButton.setAttribute("aria-pressed", String(on));

    const caption = headlightButton.querySelector(".caption");
    if (caption) caption.textContent = on ? "LIGHT ON" : "LIGHT OFF";

    headlightBeam.style.opacity = on ? "1" : "0.05";

    headlights.forEach(light => { light.visible = on; });
  }

  headlightButton.addEventListener("click", () => {
    setHeadlight(!headlightOn);
  });

  // ------------------------------------------------------------
  // ACCELERATE / BRAKE
  // ------------------------------------------------------------
  function pressHold(button, type) {
    const down = e => {
      e.preventDefault();

      if (!active || ended) return;

      if (type === "accel") accelHeld = true;
      else brakeHeld = true;

      button.setAttribute("aria-pressed", "true");

      try { button.setPointerCapture(e.pointerId); } catch (_) {}
    };

    const up = () => {
      if (type === "accel") accelHeld = false;
      else brakeHeld = false;

      button.setAttribute("aria-pressed", "false");
    };

    button.addEventListener("pointerdown", down);

    ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"]
      .forEach(ev => button.addEventListener(ev, up));
  }

  pressHold(accelerateButton, "accel");
  pressHold(brakeButton, "brake");

  // Keyboard (ডেস্কটপ)
  window.addEventListener("keydown", e => {
    const k = e.key;

    if (k === "ArrowLeft" || k === "a" || k === "A") keys.left = true;
    if (k === "ArrowRight" || k === "d" || k === "D") keys.right = true;
    if (k === "ArrowUp" || k === "w" || k === "W") keyAccel = true;
    if (k === "ArrowDown" || k === "s" || k === "S" || k === " ") keyBrake = true;
    if (k === "h" || k === "H") setHeadlight(!headlightOn);

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k)) {
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", e => {
    const k = e.key;

    if (k === "ArrowLeft" || k === "a" || k === "A") keys.left = false;
    if (k === "ArrowRight" || k === "d" || k === "D") keys.right = false;
    if (k === "ArrowUp" || k === "w" || k === "W") keyAccel = false;
    if (k === "ArrowDown" || k === "s" || k === "S" || k === " ") keyBrake = false;
  });

  // ------------------------------------------------------------
  // TEXTURES
  // ------------------------------------------------------------
  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function buildTextures() {
    // ছায়ার গ্রেডিয়েন্ট: উপরে (ভূতের দিকে) গাঢ়, নিচে ফিকে
    tex.shadow = canvasTex(64, 128, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(0,0,0,0.95)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);

      c.globalCompositeOperation = "destination-in";
      const hg = c.createLinearGradient(0, 0, w, 0);
      hg.addColorStop(0, "rgba(0,0,0,0)");
      hg.addColorStop(0.3, "rgba(0,0,0,1)");
      hg.addColorStop(0.7, "rgba(0,0,0,1)");
      hg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = hg;
      c.fillRect(0, 0, w, h);
    });

    // ল্যাম্পের আলোর বৃত্ত
    tex.pool = canvasTex(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(64, 64, 2, 64, 64, 64);
      g.addColorStop(0, "rgba(190,235,255,0.95)");
      g.addColorStop(0.45, "rgba(120,200,255,0.35)");
      g.addColorStop(1, "rgba(120,200,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });

    // ভূতের ছায়া-মূর্তি
    tex.figure = canvasTex(128, 256, c => {
      c.fillStyle = "#000";
      c.beginPath();
      c.moveTo(34, 236);
      c.quadraticCurveTo(26, 120, 40, 70);
      c.quadraticCurveTo(44, 22, 64, 20);
      c.quadraticCurveTo(84, 22, 88, 70);
      c.quadraticCurveTo(102, 120, 94, 236);
      c.lineTo(84, 222); c.lineTo(74, 240); c.lineTo(64, 222);
      c.lineTo(54, 240); c.lineTo(44, 222);
      c.closePath();
      c.fill();

      c.lineWidth = 7;
      c.strokeStyle = "#000";
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(40, 95); c.lineTo(8, 142);
      c.moveTo(88, 95); c.lineTo(120, 142);
      c.stroke();

      c.globalCompositeOperation = "destination-out";
      c.beginPath();
      c.ellipse(55, 58, 5, 8, 0, 0, 7);
      c.ellipse(73, 58, 5, 8, 0, 0, 7);
      c.fill();
      c.beginPath();
      c.ellipse(64, 82, 5, 10, 0, 0, 7);
      c.fill();
    });
  }

  // ------------------------------------------------------------
  // MATERIALS / MESHES
  // ------------------------------------------------------------
  function makeMaterial(
    color, roughness = 0.48, metalness = 0.22, emissive = 0, emissiveIntensity = 0
  ) {
    return new THREE.MeshStandardMaterial({
      color, roughness, metalness, emissive, emissiveIntensity
    });
  }

  function addBox(parent, material, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    parent.add(mesh);
    return mesh;
  }

  // গাড়ি: সামনের লাইট +z দিকে, লাল টেইল লাইট -z দিকে
  function makeMicroCar(color, ghost = false) {
    const root = new THREE.Group();

    const bodyMat = makeMaterial(
      color, 0.28, 0.42, ghost ? 0x35dce9 : 0, ghost ? 0.65 : 0
    );

    const dark = makeMaterial(0x091116, 0.2, 0.35);

    const glass = makeMaterial(
      ghost ? 0x193e4b : 0x203039, 0.16, 0.4,
      ghost ? 0x19baca : 0, ghost ? 0.3 : 0
    );

    const tire = makeMaterial(0x030506, 0.85, 0.03);

    const rim = makeMaterial(
      ghost ? 0x75f7ff : 0x60727a, 0.24, 0.72,
      ghost ? 0x1bd8e6 : 0, ghost ? 0.7 : 0
    );

    addBox(root, bodyMat, 1.65, 0.52, 2.7, 0, 0.64, 0);
    addBox(root, bodyMat, 1.28, 0.54, 1.32, 0, 1.08, -0.12);
    addBox(root, glass, 1.12, 0.36, 0.86, 0, 1.13, -0.15);
    addBox(root, dark, 1.56, 0.12, 0.24, 0, 0.52, 1.28);
    addBox(root, dark, 1.45, 0.11, 0.2, 0, 0.52, -1.27);

    const wheelGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.17, 18);

    for (const x of [-0.83, 0.83]) {
      for (const z of [-0.86, 0.86]) {
        const wheel = new THREE.Mesh(wheelGeo, tire);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.38, z);
        wheel.castShadow = true;
        root.add(wheel);

        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 0.18, 14), rim
        );
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(wheel.position);
        root.add(hub);
      }
    }

    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xeaffff,
      emissive: 0xb9f5ff,
      emissiveIntensity: ghost ? 2.2 : 1.7
    });

    const tailMat = new THREE.MeshStandardMaterial({
      color: 0x550000,
      emissive: 0xff1a1a,
      emissiveIntensity: 1.6
    });

    for (const x of [-0.48, 0.48]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.06), lampMat);
      lamp.position.set(x, 0.68, 1.37);
      root.add(lamp);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), tailMat);
      tail.position.set(x, 0.68, -1.37);
      root.add(tail);
    }

    if (ghost) {
      const aura = new THREE.PointLight(color, 2.4, 8);
      aura.position.set(0, 1.1, 0);
      root.add(aura);

      const wisps = new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 18, 12),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.075, side: THREE.BackSide
        })
      );

      wisps.scale.set(1.15, 0.8, 1.6);
      wisps.position.y = 0.85;
      root.add(wisps);
    }

    return root;
  }

  // ------------------------------------------------------------
  // ROAD
  // ------------------------------------------------------------
  function makeRoadChunk(z) {
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_WIDTH, 0.15, 50),
      makeMaterial(0x161d20, 0.96, 0.02)
    );

    road.position.set(0, -0.12, z);
    road.receiveShadow = true;
    scene.add(road);
    roadSegments.push(road);

    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.2, 50),
        makeMaterial(0x58676a, 0.7, 0.1)
      );

      edge.position.set(side * ROAD_WIDTH / 2, -0.02, z);
      scene.add(edge);
      roadSegments.push(edge);

      for (let j = 0; j < 2; j++) {
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.025, 3),
          makeMaterial(0xa8b5b5, 0.8)
        );

        line.position.set(side * 1.7, -0.025, z - 12 + j * 23);
        scene.add(line);
        roadSegments.push(line);
      }
    }
  }

  // ------------------------------------------------------------
  // LAMP POSTS (ল্যাম্পপোস্ট + আলোর বৃত্ত + ভূতের ছায়া-মূর্তি)
  // ------------------------------------------------------------
  let lampAssets = null;

  function buildLampAssets() {
    const poolGeo = new THREE.PlaneGeometry(1, 1);
    poolGeo.rotateX(-Math.PI / 2);

    lampAssets = {
      poleMat: makeMaterial(0x2c3b42, 0.6, 0.5, 0x0b1418, 0.6),
      bulbMat: new THREE.MeshBasicMaterial({ color: 0xe6fbff, fog: false }),
      coneGeo: new THREE.ConeGeometry(2.7, 5.4, 20, 1, true),
      coneMat: new THREE.MeshBasicMaterial({
        color: 0x9bdfff,
        transparent: true,
        opacity: 0.085,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      }),
      poolGeo,
      poolMat: new THREE.MeshBasicMaterial({
        map: tex.pool,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }),
      figGeo: poolGeo
    };
  }

  function makeLamp(s, z) {
    const A = lampAssets;
    const pole = new THREE.Group();
    pole.position.set(s * 6.9, 0, z);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.12, 5.6, 8), A.poleMat
    );
    shaft.position.y = 2.8;
    pole.add(shaft);

    const bx = -s * 2.3;

    addBox(pole, A.poleMat, 2.4, 0.14, 0.14, -s * 1.15, 5.5, 0);
    addBox(pole, A.poleMat, 0.75, 0.12, 0.55, bx, 5.62, 0);

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), A.bulbMat);
    bulb.position.set(bx, 5.38, 0);
    pole.add(bulb);

    const cone = new THREE.Mesh(A.coneGeo, A.coneMat);
    cone.position.set(bx, 2.7, 0);
    pole.add(cone);

    const pool = new THREE.Mesh(A.poolGeo, A.poolMat);
    pool.scale.set(9.6, 1, 9.6);
    pool.position.set(bx, 0.015, 0);
    pool.renderOrder = 1;
    pole.add(pool);

    const figMat = new THREE.MeshBasicMaterial({
      map: tex.figure,
      transparent: true,
      depthWrite: false,
      opacity: 0
    });

    const figMesh = new THREE.Mesh(A.figGeo, figMat);
    figMesh.scale.set(1.7, 1, 3.4);
    figMesh.position.set(bx * 1.45, 0.03, 0);
    figMesh.renderOrder = 3;
    pole.add(figMesh);

    scene.add(pole);

    const rec = {
      obj: pole,
      s,
      bulbDX: bx,
      fig: figMat,
      figMesh,
      phase: rand(0, 6.28),
      rate: rand(0.5, 1.2)
    };

    lamps.push(rec);
    scenery.push(rec);
  }

  function updateLamps(now) {
    // সবচেয়ে কাছের ৪টি ল্যাম্পে আসল আলো বসাও
    const sorted = lamps.slice().sort(
      (a, b) => Math.abs(a.obj.position.z + 6) - Math.abs(b.obj.position.z + 6)
    );

    for (let i = 0; i < lampLights.length; i++) {
      const L = sorted[i];
      if (!L) continue;

      lampLights[i].position.set(
        L.obj.position.x + L.bulbDX, 5.2, L.obj.position.z
      );
    }

    const figStrength = 0.5 + (level / TOTAL_LEVELS) * 0.5;

    for (const L of lamps) {
      const v = Math.sin(now * 0.001 * L.rate + L.phase);
      const k = clamp((v - 0.5) * 2.4, 0, 1);
      const z = L.obj.position.z;

      L.fig.opacity = (z > -170 && z < 10) ? k * 0.72 * figStrength : 0;
      L.figMesh.position.z = Math.sin(now * 0.0007 + L.phase) * 0.9;
    }
  }

  // ------------------------------------------------------------
  // DEBRIS
  // ------------------------------------------------------------
  function makeDebris(kind) {
    const group = new THREE.Group();

    if (kind === "wreck") {
      const car = makeMicroCar(
        [0x202a2e, 0x30252b, 0x283b39, 0x39312a][Math.floor(Math.random() * 4)]
      );

      car.scale.set(1.12, 0.85, 1.12);
      car.rotation.z = rand(-0.2, 0.2);
      group.add(car);

    } else if (kind === "tree") {
      const bark = makeMaterial(0x211a18, 0.97);
      const leaf = makeMaterial(0x101b18, 1);

      const trunk = addBox(group, bark, 0.42, 0.45, 3.8, 0, 0.3, 0);
      trunk.rotation.z = rand(-0.3, 0.3);

      for (let i = 0; i < 5; i++) {
        const branch = addBox(
          group, bark, 0.18, 0.2, rand(1, 2),
          rand(-0.8, 0.8), 0.45, rand(-0.8, 0.8)
        );
        branch.rotation.z = rand(-1, 1);
      }

      const tuft = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.8, 7), leaf);
      tuft.position.set(0.1, 0.8, -0.5);
      group.add(tuft);

    } else {
      const stone = makeMaterial(0x4a4e50, 0.95, 0.03);

      for (let i = 0; i < 5; i++) {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(rand(0.18, 0.48), 0), stone
        );

        rock.position.set(rand(-1, 1), rand(0.15, 0.4), rand(-1, 1));
        rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
        rock.castShadow = true;
        group.add(rock);
      }
    }

    return group;
  }

  function spawnObstacle(z) {
    // উঁচু লেভেলে ভাঙা গাড়ি বেশি
    const wreckBias = Math.min(0.5, 0.2 + level * 0.006);
    const r = Math.random();
    const kind = r < wreckBias ? "wreck" : r < (1 + wreckBias) / 2 ? "tree" : "rocks";

    const obj = makeDebris(kind);
    const x = rand(-4.7, 4.7);

    obj.position.set(x, 0, z);
    obj.rotation.y = rand(-0.45, 0.45);

    scene.add(obj);
    obstacles.push({ obj, x, kind, hit: false });
  }

  function clearObstacles() {
    obstacles.forEach(o => scene.remove(o.obj));
    obstacles = [];
  }

  // ------------------------------------------------------------
  // GHOST CARS (পেছন থেকে ধাওয়া করে, ধীরে চললে পাশ কাটিয়ে সামনে যায়)
  // ------------------------------------------------------------
  function spawnGhosts() {
    const colors = [0x48e6f5, 0x9c72ff, 0x85ffcc];

    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);

    ghostCars = colors.map((color, i) => {
      const car = makeMicroCar(color, true);
      car.rotation.y = Math.PI;   // সামনে -z মুখ করে
      scene.add(car);

      const sm = new THREE.MeshBasicMaterial({
        map: tex.shadow, transparent: true, depthWrite: false, opacity: 0
      });

      const shadow = new THREE.Mesh(sg, sm);
      shadow.position.y = 0.03;
      shadow.renderOrder = 2;
      scene.add(shadow);

      return {
        obj: car,
        shadow,
        shadowMat: sm,
        lane: (i - 1) * 2.2,
        side: i === 0 ? -1 : i === 1 ? 1 : (Math.random() < 0.5 ? -1 : 1),
        pace: 0.94 + i * 0.05,
        rel: -80,
        prevRel: -80,
        phase: i * 1.7
      };
    });
  }

  function resetGhosts() {
    ghostCars.forEach((g, i) => {
      g.rel = -(75 + i * 16);
      g.prevRel = g.rel;
      g.obj.position.x = g.lane;
    });
  }

  function ghostPassScare() {
    flash = 0.55;
    shake = Math.max(shake, 0.5);
    hauntTimer = 1.4;

    setMessage("👻 ভূতের গাড়ি পাশ কাটিয়ে গেল!");
    sfxWhisper(1);
    sfxWail(0.8);
  }

  // return: কতটা কাছে ভূত (0..1)
  function updateGhosts(dt, now) {
    const gu = cfg.ghostSpeed * U;
    let nearest = Infinity;

    ghostCars.forEach(g => {
      g.prevRel = g.rel;
      g.rel += (gu * g.pace - speed * U) * dt;

      // অনেক সামনে চলে গেলে আবার পেছনে ফিরে আসে
      if (g.rel > 75) {
        g.rel = -(110 + rand(0, 40));
        g.prevRel = g.rel;
        g.side = Math.random() < 0.5 ? -1 : 1;
      }

      if (g.rel < -150) g.rel = -150;

      // পাশ দিয়ে অতিক্রম করার মুহূর্ত
      if (g.prevRel < 0 && g.rel >= 0) ghostPassScare();

      g.obj.position.z = PLAYER_Z - g.rel;
      g.obj.visible = g.rel > -130 && g.rel < 130;

      // পার্শ্ব-পথ: প্লেয়ারকে ধাক্কা না দিয়ে পাশ দিয়ে যায়
      let tx = g.lane + Math.sin(roadTravel * 0.008 + g.phase) * 0.5;

      if (Math.abs(g.rel) < 16) {
        let t = clamp(carX + g.side * 3.4, -5.6, 5.6);

        if (Math.abs(t - carX) < 2.4) {
          t = clamp(carX - g.side * 3.4, -5.6, 5.6);
        }

        tx = t;
      }

      g.obj.position.x += (tx - g.obj.position.x) * Math.min(1, dt * 2.6);
      g.obj.position.y = 0.05 + Math.sin(now * 0.0015 + g.phase) * 0.035;

      if (g.rel < 0) nearest = Math.min(nearest, -g.rel);
      else if (g.rel < 6) nearest = 0;
    });

    updateGhostShadows();

    return nearest < 30 ? 1 - nearest / 30 : 0;
  }

  // ল্যাম্পের আলোয় ভূতের গাড়ির লম্বা ছায়া
  function updateGhostShadows() {
    ghostCars.forEach(g => {
      let best = null;
      let bd = 1e9;

      for (const L of lamps) {
        const dx = g.obj.position.x - (L.obj.position.x + L.bulbDX);
        const dz = g.obj.position.z - L.obj.position.z;
        const d = Math.hypot(dx, dz);

        if (d < bd) { bd = d; best = { dx, dz }; }
      }

      if (!best || bd > 17 || bd < 0.01 || !g.obj.visible) {
        g.shadowMat.opacity = 0;
        return;
      }

      const dirX = best.dx / bd;
      const dirZ = best.dz / bd;
      const len = 2 + (17 - bd) * 0.5;

      g.shadow.position.x = g.obj.position.x + dirX * len / 2;
      g.shadow.position.z = g.obj.position.z + dirZ * len / 2;
      g.shadow.rotation.y = Math.atan2(dirX, dirZ);
      g.shadow.scale.set(2.2, 1, len);

      g.shadowMat.opacity = 0.25 + (17 - bd) / 17 * 0.65;
    });
  }

  // ------------------------------------------------------------
  // SHORTCUT (দৃশ্যমান পাশের রাস্তা)
  // ------------------------------------------------------------
  function makeShortcutMesh(side) {
    const g = new THREE.Group();
    const cx = side * SC_LANE_X;

    const lane = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 0.15, SC_LEN),
      makeMaterial(0x1b2528, 0.95, 0.02)
    );
    lane.position.set(cx, -0.12, 0);
    lane.receiveShadow = true;
    g.add(lane);

    const glow = new THREE.MeshBasicMaterial({ color: 0xffb347 });

    for (const e of [-1, 1]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.05, SC_LEN), glow
      );
      edge.position.set(cx + e * 2.7, 0.0, 0);
      g.add(edge);
    }

    const arrowGeo = new THREE.ConeGeometry(0.62, 1.3, 3);
    arrowGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < 8; i++) {
      const a = new THREE.Mesh(arrowGeo, glow);
      a.scale.set(1, 0.2, 1);
      a.position.set(cx, 0.03, -SC_LEN / 2 + 6 + i * 9);
      g.add(a);
    }

    // প্রবেশদ্বার
    const postMat = makeMaterial(0x2a3940, 0.6, 0.4, 0x3a2200, 0.8);

    for (const e of [-1, 1]) {
      addBox(g, postMat, 0.3, 6, 0.3, cx + e * 3.0, 3, -SC_LEN / 2);
    }

    const banner = canvasTex(512, 128, (c, w, h) => {
      c.fillStyle = "#1a1002";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#ffb347";
      c.lineWidth = 8;
      c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = "#ffcf7a";
      c.font = "bold 62px system-ui, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(side > 0 ? "শর্টকাট ➜" : "⬅ শর্টকাট", w / 2, h / 2 + 4);
    });

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 1.6),
      new THREE.MeshBasicMaterial({ map: banner, fog: false, side: THREE.DoubleSide })
    );
    sign.position.set(cx, 6.4, -SC_LEN / 2);
    g.add(sign);

    // দূর থেকে দেখার আলোর স্তম্ভ
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffb347,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      })
    );
    beacon.position.set(cx, 17, -SC_LEN / 2);
    g.add(beacon);

    return g;
  }

  function spawnShortcut() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const group = makeShortcutMesh(side);

    group.position.z = PLAYER_Z - 240;
    scene.add(group);

    shortcut = { group, side, used: false, chosen: false };
    shortcutUiShown = false;
  }

  function removeShortcut() {
    if (shortcut) scene.remove(shortcut.group);
    shortcut = null;
    hideShortcutUI();
  }

  function showShortcutUI() {
    if (shortcutUiShown) return;
    shortcutUiShown = true;

    shortcutSteering.disabled = false;
    shortcutSteering.classList.add("is-visible");

    shortcutHint.textContent = "শর্টকাট সামনে! বোতাম চাপুন বা নিজে স্টিয়ার করুন";
    setMessage("⚠ গোপন শর্টকাট সামনে — " + (shortcut.side > 0 ? "ডানে" : "বামে"));
  }

  function hideShortcutUI() {
    shortcutUiShown = false;
    shortcutSteering.classList.remove("is-visible");
    shortcutHint.textContent = "রাস্তার দিকে নজর রাখুন…";
  }

  shortcutSteering.addEventListener("click", () => {
    if (!active || !shortcut || shortcut.used) return;

    shortcut.chosen = true;
    shortcutSteering.classList.remove("is-visible");

    setMessage("শর্টকাটে ঢুকছেন…");
    shortcutHint.textContent = "বিকল্প পথে চলছেন";
  });

  function shortcutReward() {
    const remaining = cfg.length - levelDist;
    const bonus = Math.min(60 + level * 4, Math.max(0, remaining - 130));

    levelDist += bonus;
    distance += bonus;
    if (finishObj) finishObj.position.z += bonus;

    timeLeft += 5;
    score += 150;

    sfxChime([660, 880, 1320]);
    setMessage(`🚀 শর্টকাট! +${Math.round(bonus)} মিটার ও +৫ সেকেন্ড`);
  }

  // ------------------------------------------------------------
  // FINISH LINE
  // ------------------------------------------------------------
  function makeFinish(z) {
    const g = new THREE.Group();
    g.position.set(0, 0, z);

    const checker = canvasTex(256, 64, (c, w, h) => {
      const n = 16;
      const sw = w / n;
      const sh = h / 2;

      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < n; i++) {
          c.fillStyle = (i + r) % 2 ? "#ffffff" : "#05080a";
          c.fillRect(i * sw, r * sh, sw, sh);
        }
      }
    });

    const stripGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 3);
    stripGeo.rotateX(-Math.PI / 2);

    const strip = new THREE.Mesh(
      stripGeo, new THREE.MeshBasicMaterial({ map: checker })
    );
    strip.position.y = 0.01;
    g.add(strip);

    const poleMat = makeMaterial(0x2a3940, 0.6, 0.4, 0x0a1a1f, 0.8);

    for (const s of [-1, 1]) {
      addBox(g, poleMat, 0.35, 7.4, 0.35, s * (ROAD_WIDTH / 2 + 0.5), 3.7, 0);
    }

    const banner = canvasTex(512, 128, (c, w, h) => {
      c.fillStyle = "#05080a";
      c.fillRect(0, 0, w, h);

      for (let i = 0; i < 32; i++) {
        c.fillStyle = i % 2 ? "#fff" : "#000";
        c.fillRect(i * 16, 0, 16, 14);
        c.fillStyle = i % 2 ? "#000" : "#fff";
        c.fillRect(i * 16, h - 14, 16, 14);
      }

      c.fillStyle = "#7df5ff";
      c.font = "bold 66px system-ui, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("FINISH", w / 2, h / 2);
    });

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH + 1.4, 2.2),
      new THREE.MeshBasicMaterial({ map: banner, fog: false, side: THREE.DoubleSide })
    );
    sign.position.set(0, 7.1, 0);
    g.add(sign);

    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_WIDTH + 1.4, 0.3, 0.3), poleMat
    );
    beam.position.set(0, 6.0, 0);
    g.add(beam);

    scene.add(g);
    return g;
  }

  // ------------------------------------------------------------
  // PHONE TILT (বিকল্প)
  // ------------------------------------------------------------
  function setupTilt() {
    window.addEventListener("deviceorientation", event => {
      if (!active) return;

      const val = Number.isFinite(event.gamma) ? event.gamma : 0;

      if (tiltCenter === null) tiltCenter = val;

      const angle = clamp((val - tiltCenter) / 28, -1, 1);

      tiltInput = Math.abs(angle) < 0.055
        ? 0
        : Math.sign(angle) * (Math.abs(angle) - 0.055) / 0.945;
    }, true);
  }

  async function requestMotionPermission() {
    try {
      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== "granted") return false;
      }

      tiltCenter = null;
      return true;

    } catch (error) {
      console.warn("Motion permission:", error);
      return false;
    }
  }

  setupTilt();

  // ------------------------------------------------------------
  // AUDIO (ইঞ্জিন + বাতাস + ভূতের শব্দ)
  // ------------------------------------------------------------
  function initAudio() {
    if (audioCtx) return;

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;

      audioCtx = new AC();

      master = audioCtx.createGain();
      master.gain.value = 0.9;

      const comp = audioCtx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(audioCtx.destination);

      // নয়েজ বাফার
      const len = audioCtx.sampleRate * 2;
      noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // হালকা ভুতুড়ে ড্রোন (ফোন স্পিকারেও শোনা যায় এমন ফ্রিকোয়েন্সি)
      [110, 164.8, 220.6].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const lfo = audioCtx.createOscillator();
        const lg = audioCtx.createGain();

        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.value = 0.035;

        lfo.frequency.value = 0.15 + i * 0.07;
        lg.gain.value = 0.025;
        lfo.connect(lg);
        lg.connect(gain.gain);

        osc.connect(gain);
        gain.connect(master);

        osc.start();
        lfo.start();
      });

      // ইঞ্জিন
      const o1 = audioCtx.createOscillator();
      const o2 = audioCtx.createOscillator();
      const eFilter = audioCtx.createBiquadFilter();
      const eGain = audioCtx.createGain();

      o1.type = "sawtooth";
      o2.type = "square";
      eFilter.type = "lowpass";
      eFilter.frequency.value = 500;
      eGain.gain.value = 0;

      o1.connect(eFilter);
      o2.connect(eFilter);
      eFilter.connect(eGain);
      eGain.connect(master);

      o1.start();
      o2.start();

      engine = { o1, o2, filter: eFilter, gain: eGain };

      // বাতাসের শব্দ
      const ws = audioCtx.createBufferSource();
      ws.buffer = noiseBuf;
      ws.loop = true;

      const wFilter = audioCtx.createBiquadFilter();
      const wGain = audioCtx.createGain();

      wFilter.type = "bandpass";
      wFilter.frequency.value = 500;
      wFilter.Q.value = 0.8;
      wGain.gain.value = 0;

      ws.connect(wFilter);
      wFilter.connect(wGain);
      wGain.connect(master);
      ws.start();

      wind = { filter: wFilter, gain: wGain };

    } catch (error) {
      console.warn("Audio unavailable:", error);
      audioCtx = null;
    }
  }

  function resumeAudio() {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function updateEngineAudio(accelOn) {
    if (!audioCtx || !engine) return;

    const t = audioCtx.currentTime;
    const sp = speed / MAX_SPEED;

    engine.o1.frequency.setTargetAtTime(70 + speed * 0.8 + (accelOn ? 12 : 0), t, 0.08);
    engine.o2.frequency.setTargetAtTime(35 + speed * 0.4, t, 0.08);
    engine.filter.frequency.setTargetAtTime(380 + speed * 5 + (accelOn ? 350 : 0), t, 0.1);
    engine.gain.gain.setTargetAtTime(0.07 + sp * 0.09 + (accelOn ? 0.04 : 0), t, 0.1);

    wind.filter.frequency.setTargetAtTime(350 + speed * 6, t, 0.2);
    wind.gain.gain.setTargetAtTime(sp * 0.2, t, 0.2);
  }

  function silenceEngine() {
    if (!audioCtx || !engine) return;

    const t = audioCtx.currentTime;
    engine.gain.gain.setTargetAtTime(0, t, 0.15);
    wind.gain.gain.setTargetAtTime(0, t, 0.15);
  }

  function panNode(out, amount) {
    if (audioCtx.createStereoPanner) {
      const p = audioCtx.createStereoPanner();
      p.pan.value = amount;
      out.connect(p);
      p.connect(master);
    } else {
      out.connect(master);
    }
  }

  function envelope(g, t, peak, attack, release) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  // ভূতের কান্না / বিলাপ (৩০০–৬০০ Hz, ফোনেও শোনা যায়)
  function sfxWail(vol = 1) {
    if (!audioCtx) return;

    const t = audioCtx.currentTime;
    const dur = rand(2.4, 3.6);
    const base = rand(380, 620);

    const o1 = audioCtx.createOscillator();
    const o2 = audioCtx.createOscillator();
    const lfo = audioCtx.createOscillator();
    const lg = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    const g = audioCtx.createGain();

    o1.type = "sine";
    o2.type = "triangle";

    o1.frequency.setValueAtTime(base, t);
    o1.frequency.exponentialRampToValueAtTime(base * 0.55, t + dur);
    o2.frequency.setValueAtTime(base * 1.01, t);
    o2.frequency.exponentialRampToValueAtTime(base * 0.56, t + dur);

    lfo.frequency.value = rand(4.5, 7);
    lg.gain.value = base * 0.035;
    lfo.connect(lg);
    lg.connect(o1.frequency);
    lg.connect(o2.frequency);

    bp.type = "bandpass";
    bp.frequency.value = base * 1.5;
    bp.Q.value = 1.2;

    envelope(g, t, 0.32 * vol, 0.5, dur - 0.5);

    o1.connect(bp);
    o2.connect(bp);
    bp.connect(g);
    panNode(g, rand(-0.7, 0.7));

    [o1, o2, lfo].forEach(o => { o.start(t); o.stop(t + dur + 0.1); });
  }

  // ফিসফিসানি
  function sfxWhisper(vol = 1) {
    if (!audioCtx) return;

    const t = audioCtx.currentTime;
    const dur = rand(1.6, 2.4);

    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuf;

    const bp = audioCtx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 4;
    bp.frequency.setValueAtTime(1300, t);
    bp.frequency.exponentialRampToValueAtTime(rand(2400, 3400), t + dur);

    const g = audioCtx.createGain();
    envelope(g, t, 0.4 * vol, 0.45, dur - 0.45);

    src.connect(bp);
    bp.connect(g);
    panNode(g, rand(-0.9, 0.9));

    src.start(t);
    src.stop(t + dur + 0.1);
  }

  function sfxThump(vol = 1) {
    if (!audioCtx) return;

    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    o.type = "sine";
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.16);

    envelope(g, t, 0.55 * vol, 0.01, 0.2);

    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.25);
  }

  function sfxCrash() {
    if (!audioCtx) return;

    const t = audioCtx.currentTime;

    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuf;

    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;

    const g = audioCtx.createGain();
    envelope(g, t, 0.6, 0.005, 0.45);

    src.connect(lp);
    lp.connect(g);
    g.connect(master);

    src.start(t);
    src.stop(t + 0.6);

    sfxThump(1);
  }

  function sfxChime(notes) {
    if (!audioCtx) return;

    notes.forEach((f, i) => {
      const t = audioCtx.currentTime + i * 0.13;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();

      o.type = "triangle";
      o.frequency.value = f;

      envelope(g, t, 0.25, 0.01, 0.5);

      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 0.6);
    });
  }

  function sfxTick() {
    if (!audioCtx) return;

    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    o.type = "square";
    o.frequency.value = 880;

    envelope(g, t, 0.1, 0.005, 0.08);

    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.12);
  }

  function hauntSound() {
    const r = Math.random();

    if (r < 0.45) {
      sfxWail(1);
    } else if (r < 0.8) {
      sfxWhisper(1);
    } else {
      sfxWail(0.8);
      setTimeout(() => sfxWhisper(0.8), 700);
    }
  }

  function scheduleHaunt(first) {
    clearTimeout(soundTimeout);

    if (!active) return;

    soundTimeout = setTimeout(() => {
      if (!active) return;
      hauntSound();
      scheduleHaunt();
    }, first || rand(7000, 15000));
  }

  // ------------------------------------------------------------
  // THREE.JS INIT
  // ------------------------------------------------------------
  async function loadThree() {
    THREE = await import(
      "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js"
    );

    buildTextures();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050a10);
    scene.fog = new THREE.FogExp2(0x071017, 0.016);

    camera = new THREE.PerspectiveCamera(
      62, innerWidth / innerHeight, 0.1, 380
    );
    camera.position.set(0, 4.4, 9.6);
    camera.lookAt(0, 0.5, -11);

    rearCam = new THREE.PerspectiveCamera(68, 2, 0.1, 220);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });

    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
    renderer.setSize(innerWidth, innerHeight);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    renderer.domElement.id = "ghost3DCanvas";

    Object.assign(renderer.domElement.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      zIndex: "0",
      pointerEvents: "none"
    });

    game.insertBefore(renderer.domElement, game.firstChild);

    scene.add(new THREE.HemisphereLight(0x8aa8bd, 0x101116, 1.15));

    const moon = new THREE.DirectionalLight(0x8bc8ff, 1.4);
    moon.position.set(-7, 15, -15);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    scene.add(moon);

    // ল্যাম্পপোস্ট: রাস্তার দুই পাশে
    buildLampAssets();

    for (let i = 0; i < LAMP_STATIONS; i++) {
      const z = -i * LAMP_GAP - 4;
      makeLamp(-1, z);
      makeLamp(1, z);
    }

    for (let i = 0; i < 4; i++) {
      const pl = new THREE.PointLight(0x9bdfff, 2.6, 15, 2);
      scene.add(pl);
      lampLights.push(pl);
    }

    for (let i = 0; i < 6; i++) makeRoadChunk(-i * 48 - 15);

    // প্লেয়ারের গাড়ি (সামনে -z মুখ)
    player = new THREE.Group();
    player.position.set(0, 0, PLAYER_Z);

    const body = makeMicroCar(0x21aeb8, false);
    body.rotation.y = Math.PI;
    player.add(body);

    // হেডলাইট গাড়ির সাথে সরে
    const headL = new THREE.SpotLight(0xc8f4ff, 190, 78, Math.PI / 7, 0.5, 1.35);
    headL.position.set(-0.48, 1, -1.4);
    headL.target.position.set(-1, 0.1, -30);

    const headR = new THREE.SpotLight(0xc8f4ff, 190, 78, Math.PI / 7, 0.5, 1.35);
    headR.position.set(0.48, 1, -1.4);
    headR.target.position.set(1, 0.1, -30);

    player.add(headL, headL.target, headR, headR.target);
    scene.add(player);

    headlights = [headL, headR];

    spawnGhosts();

    window.addEventListener("resize", onResize);
    onResize();
  }

  function onResize() {
    if (!renderer || !camera) return;

    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  }

  // ------------------------------------------------------------
  // LEVEL FLOW
  // ------------------------------------------------------------
  function beginLevel(n) {
    level = n;
    cfg = levelConfig(n);

    levelDist = 0;
    levelStartScore = score;
    timeLeft = cfg.timeLimit;
    lastTick = -1;

    finishSpawned = false;
    if (finishObj) { scene.remove(finishObj); finishObj = null; }
    removeShortcut();

    speed = Math.min(speed, 90);
    carX = 0;
    wheelAngle = 0;
    renderWheel();

    shake = 0;
    flash = 0;
    hauntTimer = 0;
    lastWarn = 0;
    heartTimer = 0;

    // থিম
    scene.background.setHex(cfg.theme.sky);
    scene.fog.color.setHex(cfg.theme.fog);
    scene.fog.density = cfg.fogDensity;

    clearObstacles();
    for (let i = 0; i < cfg.obstacleTarget; i++) {
      spawnObstacle(-rand(30, 260));
    }

    resetGhosts();

    nextShortcutAt = rand(140, 300);

    gameStatus.textContent = `LEVEL ${n} / ${TOTAL_LEVELS}`;
    setMessage(`লেভেল ${n} • ${cfg.theme.name}`);

    updateHUD();
  }

  function showPanel(id, eyebrow, title, lines, btnText, onClick) {
    const old = $(id);
    if (old) old.remove();

    const panel = document.createElement("section");
    panel.className = "overlay";
    panel.id = id;

    panel.innerHTML = `
      <div class="overlay-card">
        <div class="eyebrow">${eyebrow}</div>
        <h1>${title}</h1>
        ${lines.map(l => `<p class="intro">${l}</p>`).join("")}
        <button class="start-btn" type="button">${btnText}</button>
      </div>`;

    game.appendChild(panel);

    panel.querySelector("button").addEventListener("click", () => {
      panel.remove();
      onClick();
    });
  }

  function stopPlaying() {
    active = false;
    accelHeld = false;
    brakeHeld = false;
    keyAccel = false;
    keyBrake = false;

    clearTimeout(soundTimeout);
    silenceEngine();

    if (vignetteEl) vignetteEl.style.opacity = "0";
  }

  function resumePlaying() {
    resumeAudio();
    active = true;
    scheduleHaunt(3500);
    startLoop();
  }

  function completeLevel() {
    stopPlaying();

    const timeBonus = Math.floor(timeLeft * 10);
    const levelBonus = 500 + level * 50;
    score += timeBonus + levelBonus;

    sfxChime([523, 659, 784, 1047]);
    gameStatus.textContent = "FINISH!";
    updateHUD();

    if (level >= TOTAL_LEVELS) {
      ended = true;

      showPanel(
        "winOverlay",
        "ভূত সাম্রাজ্য জয়!",
        "YOU<br>WIN",
        [
          "আপনি ৫০টি লেভেলই শেষ করেছেন!",
          `মোট স্কোর: ${Math.floor(score)}`
        ],
        "আবার শুরু করুন",
        () => location.reload()
      );
      return;
    }

    showPanel(
      "levelOverlay",
      `LEVEL ${level} সম্পন্ন`,
      "FINISH<br>LINE!",
      [
        `সময় বোনাস: +${timeBonus} · লেভেল বোনাস: +${levelBonus}`,
        `স্কোর: ${Math.floor(score)}`,
        `পরের লেভেল: ${level + 1} — ${levelConfig(level + 1).theme.name}`
      ],
      `লেভেল ${level + 1} শুরু`,
      () => {
        beginLevel(level + 1);
        resumePlaying();
      }
    );
  }

  function finishGame(reason) {
    if (ended) return;

    ended = true;
    stopPlaying();

    sfxCrash();
    gameStatus.textContent = "GAME OVER";
    setMessage(reason);

    showPanel(
      "gameOverOverlay",
      "THE ROAD HAS CLAIMED YOU",
      "GAME<br>OVER",
      [
        reason,
        `লেভেল ${level} · দূরত্ব: ${(distance / 1000).toFixed(1)} KM · স্কোর: ${Math.floor(score)}`
      ],
      "এই লেভেল আবার",
      () => {
        ended = false;
        score = levelStartScore;
        speed = 0;
        beginLevel(level);
        resumePlaying();
      }
    );
  }

  // ------------------------------------------------------------
  // UPDATE
  // ------------------------------------------------------------
  function update(dt, now) {
    if (!renderer || !scene || !cfg) return;

    const accelOn = accelHeld || keyAccel;
    const brakeOn = brakeHeld || keyBrake;

    speed = clamp(
      speed +
        ((accelOn ? 72 : 0) - (brakeOn ? 125 : 0) -
          (accelOn || brakeOn ? 0 : 10)) * dt,
      0, MAX_SPEED
    );

    // ---- স্টিয়ারিং হুইল ----
    const keyDir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

    if (!wheelDrag) {
      const tgt = keyDir * WHEEL_MAX * 0.75;
      wheelAngle += (tgt - wheelAngle) * Math.min(1, dt * (keyDir ? 8 : 7));
      if (Math.abs(wheelAngle) < 0.2) wheelAngle = 0;
    }

    renderWheel();

    let input = wheelAngle / WHEEL_MAX;

    if (!wheelDrag && Math.abs(input) < 0.04) input = tiltInput;

    input = clamp(input, -1, 1);

    // ---- শর্টকাট জোন ----
    const half = SC_LEN / 2;
    let inZone = false;

    if (shortcut) {
      const sz = shortcut.group.position.z;
      inZone = Math.abs(sz - PLAYER_Z) < half - 2;

      // বোতাম চাপলে অটো-স্টিয়ার
      if (shortcut.chosen && !shortcut.used && !wheelDrag && Math.abs(input) < 0.2) {
        const laneX = shortcut.side * (inZone ? SC_LANE_X : 5.2);
        input = clamp((laneX - carX) * 0.6, -1, 1);
      }
    }

    // ---- গাড়ির পাশে সরা ----
    const grip = Math.min(12, 1 + speed * 0.055);
    carX += input * grip * dt;

    if (hauntTimer > 0) {
      hauntTimer -= dt;
      carX += Math.sin(now * 0.045) * (0.8 + level * 0.04) * dt * 3;
    }

    let minX = -NORMAL_LIMIT;
    let maxX = NORMAL_LIMIT;

    if (shortcut && inZone) {
      if (shortcut.side > 0) maxX = SHORTCUT_LIMIT;
      else minX = -SHORTCUT_LIMIT;
    }

    if (carX > maxX) carX = Math.max(maxX, carX - 7 * dt);
    if (carX < minX) carX = Math.min(minX, carX + 7 * dt);

    player.position.x = carX;
    player.rotation.y = -input * 0.2;
    player.rotation.z = clamp(-input * 0.06, -0.08, 0.08);

    // ---- রাস্তা এগোনো ----
    const travel = speed * U * dt;

    roadTravel += travel;
    levelDist += travel;
    distance += travel;
    score += travel * 0.16;

    for (const o of roadSegments) o.position.z += travel;
    for (const s of scenery) s.obj.position.z += travel;
    for (const o of obstacles) o.obj.position.z += travel;
    if (shortcut) shortcut.group.position.z += travel;
    if (finishObj) finishObj.position.z += travel;

    // ---- ধাক্কা ----
    for (const o of obstacles) {
      if (
        !o.hit &&
        Math.abs(o.obj.position.z - 3.8) < 1.8 &&
        Math.abs(o.obj.position.x - carX) < 1.45
      ) {
        o.hit = true;

        speed = Math.max(18, speed * 0.56);
        score = Math.max(0, score - 8);
        shake = 1;

        setMessage("ধাক্কা! গতি কমেছে—সাবধানে চালান");
        sfxCrash();

        o.obj.position.x += o.obj.position.x >= carX ? 2.5 : -2.5;
      }

      if (o.obj.position.z > 13) {
        scene.remove(o.obj);
        o.dead = true;
      }
    }

    obstacles = obstacles.filter(o => !o.dead);

    const remaining = cfg.length - levelDist;

    if (obstacles.length < cfg.obstacleTarget && remaining > 140) {
      spawnObstacle(-rand(190, 310));
    }

    // ---- রিসাইকেল ----
    for (const s of scenery) {
      if (s.obj.position.z > 22) s.obj.position.z -= LAMP_GAP * LAMP_STATIONS;
    }

    for (const o of roadSegments) {
      if (o.position.z > 40) o.position.z -= 288;
    }

    // ---- শর্টকাট লজিক ----
    if (!shortcut && remaining > 420 && levelDist >= nextShortcutAt) {
      spawnShortcut();
      nextShortcutAt = levelDist + rand(300, 520);
    }

    if (shortcut) {
      const sz = shortcut.group.position.z;

      if (!shortcut.used && !shortcutUiShown && sz - half > PLAYER_Z - 150) {
        showShortcutUI();
      }

      if (!shortcut.used && inZone && carX * shortcut.side > 7.6) {
        shortcut.used = true;
        hideShortcutUI();
        shortcutHint.textContent = "বিকল্প পথে চলছেন";
        shortcutReward();
      }

      if (sz - half > PLAYER_Z + 36) removeShortcut();
    }

    // ---- ফিনিশ লাইন ----
    const left = cfg.length - levelDist;

    if (!finishSpawned && left <= 260) {
      finishObj = makeFinish(PLAYER_Z - left);
      finishSpawned = true;
      setMessage("🏁 ফিনিশ লাইন সামনে!");
    }

    if (levelDist >= cfg.length + 8) {
      completeLevel();
      return;
    }

    // ---- সময় ----
    timeLeft -= dt;

    if (timeLeft < 10) {
      const sec = Math.ceil(timeLeft);

      if (sec !== lastTick && sec > 0) {
        lastTick = sec;
        sfxTick();
      }
    }

    if (timeLeft <= 0) {
      finishGame("সময় শেষ! ফিনিশ লাইনে পৌঁছাতে পারেননি");
      return;
    }

    // ---- ভূতের গাড়ি ----
    const prox = updateGhosts(dt, now);

    if (prox > 0.45 && now - lastWarn > 7000) {
      lastWarn = now;
      setMessage("⚠ পেছন থেকে ভূতের গাড়ি ধেয়ে আসছে!");
      sfxWail(0.7);
    }

    if (prox > 0.05) {
      heartTimer -= dt;

      if (heartTimer <= 0) {
        sfxThump(0.5 + prox * 0.5);
        setTimeout(() => sfxThump(0.35 + prox * 0.4), 180);
        heartTimer = 1.2 - prox * 0.7;
      }
    }

    vignetteEl.style.opacity = String(prox * 0.9);

    flash = Math.max(0, flash - dt * 1.6);
    flashEl.style.opacity = String(flash);

    updateLamps(now);
    updateEngineAudio(accelOn);

    // ---- ক্যামেরা ----
    camera.position.x += (carX * 0.24 - camera.position.x) * dt * 0.8;
    camera.position.y = 4.4 + (Math.random() - 0.5) * shake * 0.35;
    shake = Math.max(0, shake - dt * 2);

    camera.lookAt(carX * 0.13, 0.4, -12);

    updateHUD();

    renderer.render(scene, camera);
    renderRearCam();
  }

  // পেছনের ক্যামেরা (ভূতের গাড়ি পেছনে দেখা যাবে)
  function renderRearCam() {
    if (!rearEl || !rearCam) return;

    const r = rearEl.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;

    rearCam.aspect = r.width / r.height;
    rearCam.updateProjectionMatrix();

    rearCam.position.set(carX, 1.5, PLAYER_Z + 1.8);
    rearCam.lookAt(carX, 1.1, PLAYER_Z + 40);

    const y = innerHeight - r.bottom;

    renderer.setScissorTest(true);
    renderer.setViewport(r.left, y, r.width, r.height);
    renderer.setScissor(r.left, y, r.width, r.height);
    renderer.render(scene, rearCam);

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
  }

  function startLoop() {
    if (looping) return;

    looping = true;
    lastFrame = performance.now();
    requestAnimationFrame(loop);
  }

  function loop(now) {
    if (!active) {
      looping = false;
      return;
    }

    const dt = Math.min(0.045, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;

    update(dt, now);

    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------
  // START GAME
  // ------------------------------------------------------------
  async function startGame() {
    if (active || ended) return;

    // অডিও অবশ্যই ক্লিকের সাথে সাথেই তৈরি/চালু করতে হবে (নাহলে ফোনে শব্দ আসে না)
    initAudio();
    resumeAudio();

    active = true;

    startOverlay.style.display = "none";
    gameStatus.textContent = "NIGHT DRIVE";

    const motion = requestMotionPermission();

    setHeadlight(true);
    setMessage("অন্ধকার রাস্তা • সামনে এগিয়ে যান");

    try {
      if (!renderer) {
        setMessage("3D দৃশ্য লোড হচ্ছে…");
        await loadThree();
      }

      await motion;

      level = 1;
      score = 0;
      speed = 0;
      distance = 0;

      beginLevel(1);

      scheduleHaunt(3500);
      startLoop();

    } catch (error) {
      console.error(error);

      active = false;
      startOverlay.style.display = "";

      setMessage("3D লোড হয়নি • ইন্টারনেট সংযোগ দেখুন");
    }
  }

  startButton.addEventListener("click", startGame);

  // Initial UI
  injectUI();
  setHeadlight(true);
  updateHUD();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      accelHeld = false;
      brakeHeld = false;
      keyAccel = false;
      keyBrake = false;
      silenceEngine();
    } else {
      resumeAudio();
    }
  });

})();
