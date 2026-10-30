/* GHOST KINGDOM - GAME LOGIC
   Requires the existing index.html
   Three.js loads from CDN
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

  let THREE, scene, camera, renderer, player;
  let headlights = [];

  let active = false;
  let ended = false;

  let speed = 0;
  let distance = 0;
  let score = 0;

  let carX = 0;
  let steerTarget = 0;
  let tiltInput = 0;
  let tiltCenter = null;

  let accelHeld = false;
  let brakeHeld = false;
  let headlightOn = true;

  let ghostCars = [];
  let scenery = [];
  let obstacles = [];
  let roadSegments = [];

  let ghostPressure = 0;
  let ghostBlock = false;
  let lastGhostEvent = 0;

  let shortcut = null;
  let shortcutTimer = 0;
  let nextShortcutAt = 500 + Math.random() * 250;

  let audioCtx = null;
  let ambientGain = null;
  let droneNodes = [];
  let soundTimeout = null;

  let lastFrame = 0;
  let roadTravel = 0;

  const MAX_SPEED = 300;
  const ROAD_WIDTH = 13;

  const clamp = (v, a, b) =>
    Math.max(a, Math.min(b, v));

  const rand = (a, b) =>
    a + Math.random() * (b - a);

  function setMessage(text) {
    roadMessage.textContent = text;
  }

  function updateHUD() {
    speedValue.textContent = Math.round(speed);
    distanceValue.textContent =
      (distance / 1000).toFixed(1) + " KM";
    scoreValue.textContent = Math.floor(score);
  }

  // HEADLIGHT
  function setHeadlight(on) {
    headlightOn = on;

    headlightButton.setAttribute(
      "aria-pressed",
      String(on)
    );

    const caption =
      headlightButton.querySelector(".caption");

    if (caption) {
      caption.textContent =
        on ? "LIGHT ON" : "LIGHT OFF";
    }

    headlightBeam.style.opacity =
      on ? "1" : "0.05";

    headlights.forEach(light => {
      light.visible = on;
    });
  }

  headlightButton.addEventListener("click", () => {
    setHeadlight(!headlightOn);
  });

  // ACCELERATE / BRAKE
  function pressHold(button, type) {
    const down = e => {
      e.preventDefault();

      if (!active || ended) return;

      if (type === "accel") {
        accelHeld = true;
      } else {
        brakeHeld = true;
      }

      button.setAttribute("aria-pressed", "true");

      try {
        button.setPointerCapture(e.pointerId);
      } catch (_) {}
    };

    const up = () => {
      if (type === "accel") {
        accelHeld = false;
      } else {
        brakeHeld = false;
      }

      button.setAttribute("aria-pressed", "false");
    };

    button.addEventListener("pointerdown", down);

    [
      "pointerup",
      "pointercancel",
      "lostpointercapture",
      "pointerleave"
    ].forEach(event => {
      button.addEventListener(event, up);
    });
  }

  pressHold(accelerateButton, "accel");
  pressHold(brakeButton, "brake");

  // MATERIALS
  function makeMaterial(
    color,
    roughness = 0.48,
    metalness = 0.22,
    emissive = 0,
    emissiveIntensity = 0
  ) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive,
      emissiveIntensity
    });
  }

  function addBox(
    parent, material,
    w, h, d,
    x, y, z
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      material
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    parent.add(mesh);
    return mesh;
  }

  // MICRO CAR
  function makeMicroCar(color, ghost = false) {
    const root = new THREE.Group();

    const bodyMat = makeMaterial(
      color, 0.28, 0.42,
      ghost ? 0x35dce9 : 0,
      ghost ? 0.65 : 0
    );

    const dark = makeMaterial(0x091116, 0.2, 0.35);

    const glass = makeMaterial(
      ghost ? 0x193e4b : 0x203039,
      0.16, 0.4,
      ghost ? 0x19baca : 0,
      ghost ? 0.3 : 0
    );

    const tire = makeMaterial(0x030506, 0.85, 0.03);

    const rim = makeMaterial(
      ghost ? 0x75f7ff : 0x60727a,
      0.24, 0.72,
      ghost ? 0x1bd8e6 : 0,
      ghost ? 0.7 : 0
    );

    addBox(root, bodyMat,
      1.65, 0.52, 2.7, 0, 0.64, 0);

    addBox(root, bodyMat,
      1.28, 0.54, 1.32, 0, 1.08, -0.12);

    addBox(root, glass,
      1.12, 0.36, 0.86, 0, 1.13, -0.15);

    addBox(root, dark,
      1.56, 0.12, 0.24, 0, 0.52, 1.28);

    addBox(root, dark,
      1.45, 0.11, 0.2, 0, 0.52, -1.27);

    const wheelGeo = new THREE.CylinderGeometry(
      0.27, 0.27, 0.17, 18
    );

    for (const x of [-0.83, 0.83]) {
      for (const z of [-0.86, 0.86]) {
        const wheel = new THREE.Mesh(
          wheelGeo, tire
        );

        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.38, z);
        wheel.castShadow = true;
        root.add(wheel);

        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.12, 0.12, 0.18, 14
          ),
          rim
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

    for (const x of [-0.48, 0.48]) {
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.12, 0.06),
        lampMat
      );

      lamp.position.set(x, 0.68, 1.37);
      root.add(lamp);
    }

    if (ghost) {
      const aura = new THREE.PointLight(
        color, 2.4, 8
      );

      aura.position.set(0, 1.1, 0);
      root.add(aura);

      const wisps = new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 18, 12),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.075,
          side: THREE.BackSide
        })
      );

      wisps.scale.set(1.15, 0.8, 1.6);
      wisps.position.y = 0.85;
      root.add(wisps);
    }

    return root;
  }

  // ROAD
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

      edge.position.set(
        side * ROAD_WIDTH / 2, -0.02, z
      );

      scene.add(edge);
      roadSegments.push(edge);

      for (let j = 0; j < 2; j++) {
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.025, 3),
          makeMaterial(0xa8b5b5, 0.8)
        );

        line.position.set(
          side * 1.7,
          -0.025,
          z - 12 + j * 23
        );

        scene.add(line);
        roadSegments.push(line);
      }
    }
  }

  // ROAD LAMPS
  function makeLamp(x, z) {
    const pole = new THREE.Group();
    pole.position.set(x, 0, z);

    const poleMat = makeMaterial(
      0x10191d, 0.7, 0.45
    );

    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xc9f5ff,
      emissive: 0x7ddcff,
      emissiveIntensity: 2.8
    });

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.055, 0.09, 5.6, 8
      ),
      poleMat
    );

    shaft.position.y = 2.8;
    pole.add(shaft);

    const arm = addBox(
      pole, poleMat,
      0.12, 0.12, 1.2,
      0, 5.45, x > 0 ? -0.5 : 0.5
    );

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 8),
      bulbMat
    );

    bulb.position.set(
      0, 5.36, x > 0 ? -0.95 : 0.95
    );

    pole.add(bulb);

    const glow = new THREE.PointLight(
      0x9bdfff, 1.6, 11, 2
    );

    glow.position.copy(bulb.position);
    pole.add(glow);

    scene.add(pole);
    scenery.push({ obj: pole });
  }

  // DEBRIS
  function makeDebris(kind) {
    const group = new THREE.Group();

    if (kind === "wreck") {
      const car = makeMicroCar(
        [0x202a2e, 0x30252b, 0x283b39, 0x39312a]
        [Math.floor(Math.random() * 4)]
      );

      car.scale.set(1.12, 0.85, 1.12);
      car.rotation.z = rand(-0.2, 0.2);
      group.add(car);

    } else if (kind === "tree") {
      const bark = makeMaterial(0x211a18, 0.97);
      const leaf = makeMaterial(0x101b18, 1);

      const trunk = addBox(
        group, bark, 0.42, 0.45, 3.8,
        0, 0.3, 0
      );

      trunk.rotation.z = rand(-0.3, 0.3);

      for (let i = 0; i < 5; i++) {
        const branch = addBox(
          group, bark,
          0.18, 0.2, rand(1, 2),
          rand(-0.8, 0.8), 0.45, rand(-0.8, 0.8)
        );

        branch.rotation.z = rand(-1, 1);
      }

      const tuft = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 1.8, 7),
        leaf
      );

      tuft.position.set(0.1, 0.8, -0.5);
      group.add(tuft);

    } else {
      const stone = makeMaterial(0x4a4e50, 0.95, 0.03);

      for (let i = 0; i < 5; i++) {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(
            rand(0.18, 0.48), 0
          ),
          stone
        );

        rock.position.set(
          rand(-1, 1), rand(0.15, 0.4), rand(-1, 1)
        );

        rock.rotation.set(
          rand(0, 3), rand(0, 3), rand(0, 3)
        );

        rock.castShadow = true;
        group.add(rock);
      }
    }

    return group;
  }

  function spawnObstacle(z) {
    const types = ["wreck", "tree", "rocks"];
    const kind = types[
      Math.floor(Math.random() * types.length)
    ];

    const obj = makeDebris(kind);
    const x = rand(-4.7, 4.7);

    obj.position.set(x, 0, z);
    obj.rotation.y = rand(-0.45, 0.45);

    scene.add(obj);

    obstacles.push({
      obj, x, kind, hit: false
    });
  }

  // GHOST CARS
  function spawnGhosts() {
    const colors = [
      0x48e6f5,
      0x9c72ff,
      0x85ffcc
    ];

    ghostCars = colors.map((color, i) => {
      const car = makeMicroCar(color, true);

      car.position.set(
        (i - 1) * 2.2,
        0.05,
        16 + i * 4
      );

      car.rotation.y = Math.PI;
      scene.add(car);

      return {
        obj: car,
        baseX: (i - 1) * 2.2,
        slot: i
      };
    });
  }

  // SHORTCUT
  function showShortcut() {
    if (shortcut) return;

    shortcut = {
      side: Math.random() < 0.5 ? -1 : 1,
      chosen: false
    };

    shortcutTimer = 0;

    shortcutSteering.disabled = false;
    shortcutSteering.classList.add("is-visible");

    shortcutHint.textContent =
      "শর্টকাট সামনে! স্টিয়ারিং ঘুরিয়ে নিন";

    setMessage("⚠ গোপন শর্টকাট সামনে");
  }

  function hideShortcut() {
    shortcutSteering.classList.remove("is-visible");

    shortcut = null;

    shortcutHint.textContent =
      "রাস্তার দিকে নজর রাখুন…";
  }

  shortcutSteering.addEventListener("click", () => {
    if (!active || !shortcut || shortcut.chosen) {
      return;
    }

    shortcut.chosen = true;
    shortcutTimer = 0;

    steerTarget = shortcut.side * 4.25;

    shortcutSteering.classList.remove("is-visible");

    setMessage("শর্টকাটে ঢুকছেন…");
    shortcutHint.textContent = "বিকল্প পথে চলছেন";

    score += 75;
  });

  // PHONE TILT STEERING
  function setupTilt() {
    window.addEventListener(
      "deviceorientation",
      event => {
        if (!active) return;

        const val = Number.isFinite(event.gamma)
          ? event.gamma
          : 0;

        if (tiltCenter === null) {
          tiltCenter = val;
        }

        const angle = clamp(
          (val - tiltCenter) / 28,
          -1, 1
        );

        tiltInput =
          Math.abs(angle) < 0.055
            ? 0
            : Math.sign(angle) *
              (Math.abs(angle) - 0.055) / 0.945;
      },
      true
    );
  }

  async function requestMotionPermission() {
    try {
      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        const result =
          await DeviceOrientationEvent.requestPermission();

        if (result !== "granted") {
          setMessage("মোশন পারমিশন পাওয়া যায়নি");
          return false;
        }
      }

      tiltCenter = null;
      return true;

    } catch (error) {
      console.warn("Motion permission:", error);
      return false;
    }
  }

  setupTilt();

  // SPOOKY AUDIO
  function initAudio() {
    try {
      audioCtx = new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

      ambientGain = audioCtx.createGain();
      ambientGain.gain.value = 0.14;
      ambientGain.connect(audioCtx.destination);

      [54, 55.4, 82.4].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        osc.type = i === 2 ? "triangle" : "sine";
        osc.frequency.value = freq;
        gain.gain.value = i === 2 ? 0.12 : 0.24;

        filter.type = "lowpass";
        filter.frequency.value = 190;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ambientGain);

        osc.start();
        droneNodes.push(osc);
      });

      scheduleHaunt();

    } catch (error) {
      console.warn("Audio unavailable:", error);
    }
  }

  function ghostSound() {
    if (!audioCtx || !active) return;

    const now = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = [
      "sawtooth", "sine", "triangle"
    ][Math.floor(Math.random() * 3)];

    osc.frequency.setValueAtTime(rand(95, 360), now);

    osc.frequency.exponentialRampToValueAtTime(
      rand(38, 85), now + rand(1.8, 3.7)
    );

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(rand(350, 1100), now);

    filter.frequency.exponentialRampToValueAtTime(
      120, now + 3.2
    );

    gain.gain.setValueAtTime(0.0001, now);

    gain.gain.exponentialRampToValueAtTime(
      rand(0.12, 0.24), now + 0.18
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001, now + 3.6
    );

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 3.7);
  }

  function scheduleHaunt() {
    if (!active) return;

    soundTimeout = setTimeout(() => {
      ghostSound();
      scheduleHaunt();
    }, rand(16000, 39000));
  }

  // THREE.JS INITIALIZATION
  async function loadThree() {
    THREE = await import(
      "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js"
    );

    scene = new THREE.Scene();

    scene.background = new THREE.Color(0x050a10);

    scene.fog = new THREE.FogExp2(
      0x071017, 0.016
    );

    camera = new THREE.PerspectiveCamera(
      62, innerWidth / innerHeight, 0.1, 380
    );

    camera.position.set(0, 4.4, 9.6);
    camera.lookAt(0, 0.5, -11);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });

    renderer.setPixelRatio(
      Math.min(devicePixelRatio, 1.8)
    );

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

    game.insertBefore(
      renderer.domElement,
      game.firstChild
    );

    const ambient = new THREE.HemisphereLight(
      0x8aa8bd, 0x101116, 1.15
    );

    scene.add(ambient);

    const moon = new THREE.DirectionalLight(
      0x8bc8ff, 1.4
    );

    moon.position.set(-7, 15, -15);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    scene.add(moon);

    for (let i = 0; i < 12; i++) {
      makeLamp(
        i % 2 ? 6.9 : -6.9,
        -i * 23 - 6
      );
    }

    for (let i = 0; i < 6; i++) {
      makeRoadChunk(-i * 48 - 15);
    }

    player = makeMicroCar(0x21aeb8, false);
    player.position.set(0, 0, 4);
    scene.add(player);

    const headL = new THREE.SpotLight(
      0xc8f4ff, 190, 78, Math.PI / 7, 0.5, 1.35
    );

    headL.position.set(-0.48, 1, 5);
    headL.target.position.set(-1, 0.1, -24);

    scene.add(headL, headL.target);

    const headR = headL.clone();
    headR.position.x = 0.48;
    headR.target.position.x = 1;

    scene.add(headR, headR.target);

    headlights = [headL, headR];

    spawnGhosts();

    for (let i = 0; i < 13; i++) {
      spawnObstacle(-rand(20, 245));
    }

    window.addEventListener("resize", onResize);
    onResize();
  }

  function onResize() {
    if (!renderer || !camera) return;

    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(innerWidth, innerHeight);

    renderer.setPixelRatio(
      Math.min(devicePixelRatio, 1.8)
    );
  }

  // GAME OVER
  function finishGame(reason) {
    if (ended) return;

    ended = true;
    active = false;

    accelHeld = false;
    brakeHeld = false;

    clearTimeout(soundTimeout);

    gameStatus.textContent = "GAME OVER";

    setMessage(reason);

    const panel = document.createElement("section");
    panel.className = "overlay";
    panel.id = "gameOverOverlay";

    panel.innerHTML = `
      <div class="overlay-card">
        <div class="eyebrow">THE ROAD HAS CLAIMED YOU</div>
        <h1>GAME<br>OVER</h1>
        <p class="intro">${reason}</p>
        <p class="intro">
          DISTANCE: ${(distance / 1000).toFixed(1)} KM
          · SCORE: ${Math.floor(score)}
        </p>
        <button class="start-btn" id="retryButton">
          DRIVE AGAIN
        </button>
      </div>
    `;

    game.appendChild(panel);

    $("retryButton").addEventListener(
      "click",
      () => location.reload()
    );
  }

  // GAME UPDATE
  function update(dt) {
    if (!renderer || !scene) return;

    const speedUp = accelHeld ? 72 : 0;
    const braking = brakeHeld ? 125 : 0;

    speed = clamp(
      speed +
      (speedUp - braking -
      (accelHeld || brakeHeld ? 0 : 10)) * dt,
      0, MAX_SPEED
    );

    // Tilt steering
    const wanted = tiltInput * 5.15;

    steerTarget +=
      (wanted - steerTarget) *
      Math.min(1, dt * 3.5);

    if (shortcut && shortcut.chosen) {
      steerTarget +=
        (shortcut.side * 4.1 - steerTarget) *
        Math.min(1, dt * 2.2);
    }

    carX +=
      (steerTarget - carX) *
      Math.min(1, dt * 1.65);

    carX = clamp(carX, -5.4, 5.4);

    player.position.x = carX;

    player.rotation.z =
      clamp(-tiltInput * 0.11, -0.12, 0.12);

    const travel = speed * 0.11 * dt;

    roadTravel += travel;
    distance += travel;
    score += travel * 0.16;

    // Move road and debris
    [
      ...roadSegments,
      ...scenery.map(o => o.obj),
      ...obstacles.map(o => o.obj)
    ].forEach(obj => {
      obj.position.z += travel;
    });

    // Ghosts approach
    ghostCars.forEach((ghost, i) => {
      if (ghostBlock) return;

      const desiredZ =
        -13 + i * 1.7 +
        Math.sin(roadTravel * 0.012 + i) * 0.7;

      ghost.obj.position.z +=
        (desiredZ - ghost.obj.position.z) *
        dt * 0.4;

      ghost.obj.position.x +=
        (
          ghost.baseX +
          Math.sin(roadTravel * 0.008 + i * 1.5) * 0.5 -
          ghost.obj.position.x
        ) * dt * 0.5;

      ghost.obj.position.y =
        0.05 + Math.sin(performance.now() * 0.0015 + i) * 0.035;
    });

    // Obstacle collisions slow down
    for (const o of obstacles) {
      if (
        !o.hit &&
        Math.abs(o.obj.position.z - 3.8) < 1.8 &&
        Math.abs(o.obj.position.x - carX) < 1.45
      ) {
        o.hit = true;

        speed = Math.max(18, speed * 0.56);
        score = Math.max(0, score - 8);

        setMessage(
          "ধাক্কা! গতি কমেছে—সাবধানে চালান"
        );

        o.obj.position.x +=
          o.obj.position.x >= carX ? 2.5 : -2.5;
      }

      if (o.obj.position.z > 13) {
        scene.remove(o.obj);
        o.dead = true;
      }
    }

    obstacles = obstacles.filter(o => !o.dead);

    if (obstacles.length < 15) {
      spawnObstacle(-rand(190, 310));
    }

    // Recycle scenery
    scenery.forEach(o => {
      if (o.obj.position.z > 22) {
        o.obj.position.z -= 340;
      }
    });

    roadSegments.forEach(o => {
      if (o.position.z > 40) {
        o.position.z -= 288;
      }
    });

    // Ghost pressure
    if (speed < 46) {
      ghostPressure += dt;
    } else {
      ghostPressure = Math.max(
        0, ghostPressure - dt * 0.85
      );
    }

    if (ghostPressure > 14 && !ghostBlock) {
      ghostBlock = true;

      setMessage(
        "তিন ভূতের গাড়ি সামনে চলে আসছে!"
      );

      ghostCars.forEach((g, i) => {
        g.obj.position.z = -4.5;
        g.obj.position.x = (i - 1) * 2.4;
      });

      lastGhostEvent = performance.now();
    }

    if (ghostBlock) {
      ghostCars.forEach((g, i) => {
        g.obj.position.z = Math.min(
          2.5,
          g.obj.position.z + dt * (3.2 + speed * 0.012)
        );

        g.obj.position.x +=
          (
            (i - 1) * 2.5 -
            carX * 0.1 -
            g.obj.position.x
          ) * dt * 1.2;
      });

      if (
        performance.now() - lastGhostEvent > 4300
      ) {
        finishGame(
          "তিন ভূতের গাড়ি সামনে এসে রাস্তা আটকে দিয়েছে!"
        );
        return;
      }
    }

    // Shortcut indicator
    if (
      !shortcut &&
      distance >= nextShortcutAt
    ) {
      if (Math.random() < 0.68) {
        showShortcut();
      }

      nextShortcutAt = distance + rand(380, 950);
    }

    if (shortcut) {
      shortcutTimer += dt;

      if (!shortcut.chosen && shortcutTimer > 9) {
        hideShortcut();
        nextShortcutAt = distance + rand(260, 600);
      }

      if (shortcut && shortcut.chosen) {
        if (Math.abs(carX - shortcut.side * 4.25) < 0.9) {
          setMessage("বিকল্প পথে চলছেন");

          hideShortcut();
          nextShortcutAt = distance + rand(420, 900);

        } else if (shortcutTimer > 6) {
          hideShortcut();
          nextShortcutAt = distance + rand(280, 650);
        }
      }
    }

    // Follow camera
    camera.position.x +=
      (carX * 0.24 - camera.position.x) *
      dt * 0.8;

    camera.lookAt(carX * 0.13, 0.4, -12);

    updateHUD();
    renderer.render(scene, camera);
  }

  function loop(now) {
    if (!active) return;

    const dt = Math.min(
      0.045,
      Math.max(0, (now - lastFrame) / 1000)
    );

    lastFrame = now;

    if (renderer) update(dt);

    requestAnimationFrame(loop);
  }

  // START GAME
  async function startGame() {
    if (active || ended) return;

    active = true;

    // FIX: Hide start overlay
    startOverlay.style.display = "none";

    gameStatus.textContent = "NIGHT DRIVE";

    await requestMotionPermission();

    if (!audioCtx) initAudio();

    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    setHeadlight(true);

    setMessage("অন্ধকার রাস্তা • সামনে এগিয়ে যান");

    try {
      if (!renderer) {
        setMessage("3D দৃশ্য লোড হচ্ছে…");
        await loadThree();
      }

      lastFrame = performance.now();
      requestAnimationFrame(loop);

    } catch (error) {
      console.error(error);

      active = false;
      startOverlay.style.display = "";

      setMessage(
        "3D লোড হয়নি • ইন্টারনেট সংযোগ দেখুন"
      );
    }
  }

  startButton.addEventListener("click", startGame);

  // Initial UI
  setHeadlight(true);
  updateHUD();

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        accelHeld = false;
        brakeHeld = false;
      }
    }
  );

})();
