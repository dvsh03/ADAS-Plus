/**
 * ADAS-Plus Interactive Vehicle Simulation Engine (v5.0)
 * Synchronized Dual Viewports: Top-Down Aerial View & Driver Cockpit Windshield View
 * Mode-Specific Range Awareness: Prototype (0.2–6m) vs Planned (0.2–250m)
 * Automated Adaptive Cruising Speeds, Realistic Physics & Integrated Audio Synthesizer
 * Interactive Hazard Scenarios: Cattle, Dog, Pedestrian, Cargo Debris, Small Item (<15cm)
 * Moving (Crossing) vs Steady (Standing Stationary) Obstacle Behaviors
 * Direct Alert State Demonstrations: Caution, Danger, Safe Stop in Both Modes
 * Photorealistic Canvas Characters with Anatomical Shading & ADAS HUD Reticle
 */

(function () {
  'use strict';

  // --- Range Constants (Mode-Specific) ---
  const PROTOTYPE_RANGE_M = 6.0;        // Stated prototype detection limit (0.2 m - 6 m)
  const PLANNED_RANGE_M = 250.0;        // Planned target range: 200-250 m (design target, not built)
  const MIN_DETECTION_RANGE_M = 0.2;    // Modern vehicle near-field minimum bumper range (0.2 m / 20 cm)

  // Road & Vehicle Dimensions
  const ROAD_WIDTH_METERS = 7.0;  // 2-lane road
  const CAR_WIDTH_METERS = 1.9;
  const CAR_LENGTH_METERS = 4.2;

  // Automated Cruise Speeds per Mode
  const PROTOTYPE_CRUISE_KMH = 14.0; // Realistic low-speed demonstration speed (3.89 m/s)
  const PLANNED_CRUISE_KMH = 80.0;   // Highway cruising speed for long-range radar testing (22.2 m/s)

  // Physics Parameters
  const PROTOTYPE_REACTION_SEC = 0.8;  // Driver perception-reaction delay
  const PROTOTYPE_BRAKE_MS2 = 6.0;     // Human emergency braking deceleration
  const PLANNED_REACTION_SEC = 0.05;   // AEB electronic trigger latency (near-zero)
  const PLANNED_BRAKE_MS2 = 7.5;       // Automotive AEB hydraulic deceleration
  const ACCEL_MS2 = 4.0;               // Smooth acceleration to resume cruising

  // Trajectory Entry Sides
  const SIDES = ['left', 'right', 'center'];

  // Simulation State Enum
  const STATE = {
    CLEAR: 'CLEAR',
    DETECTED: 'DETECTED',
    CAUTION: 'CAUTION',
    DANGER: 'DANGER',
    SAFE_STOP: 'SAFE STOP',
    COLLISION: 'COLLISION'
  };

  // Modes
  const MODE = {
    PROTOTYPE: 'prototype',
    PLANNED: 'planned'
  };

  // DOM Elements
  const topCanvas = document.getElementById('topViewCanvas');
  const driverCanvas = document.getElementById('driverViewCanvas');
  const flashOverlay = document.getElementById('windshieldFlash');

  // Controls DOM
  const btnPrototypeMode = document.getElementById('btnModePrototype');
  const btnPlannedMode = document.getElementById('btnModePlanned');
  const btnToggleNight = document.getElementById('btnToggleNight');
  const btnToggleSound = document.getElementById('btnToggleSound');
  const soundIcon = document.getElementById('soundIcon');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const btnResetSim = document.getElementById('btnResetSim');
  const autoSpeedVal = document.getElementById('autoSpeedVal');
  const speedModeContext = document.getElementById('speedModeContext');
  const simRangeCaption = document.getElementById('simRangeCaption');

  // Scenario Buttons DOM
  const scenarioBtns = {
    cow: document.getElementById('scenarioCow'),
    dog: document.getElementById('scenarioDog'),
    pedestrian: document.getElementById('scenarioPedestrian'),
    debris: document.getElementById('scenarioDebris'),
    small: document.getElementById('scenarioSmall')
  };

  // Motion Mode Buttons DOM (Moving vs Steady)
  const btnMotionMoving = document.getElementById('btnMotionMoving');
  const btnMotionSteady = document.getElementById('btnMotionSteady');

  // State Demo Buttons DOM
  const btnDemoAuto = document.getElementById('btnDemoAuto');
  const btnDemoCaution = document.getElementById('btnDemoCaution');
  const btnDemoDanger = document.getElementById('btnDemoDanger');
  const btnDemoSafeStop = document.getElementById('btnDemoSafeStop');

  // Ruler DOM
  const rulerActiveBadge = document.getElementById('rulerActiveBadge');
  const rulerZoneProto = document.getElementById('rulerZoneProto');
  const rulerZonePlanned = document.getElementById('rulerZonePlanned');

  // Telemetry HUD DOM
  const hudStatePill = document.getElementById('hudStatePill');
  const hudDistanceVal = document.getElementById('hudDistanceVal');
  const hudSpeedVal = document.getElementById('hudSpeedVal');
  const hudStoppingVal = document.getElementById('hudStoppingVal');
  const hudWarningTimeVal = document.getElementById('hudWarningTimeVal');
  const hudBuzzerVal = document.getElementById('hudBuzzerVal');
  const hudScoreboardVal = document.getElementById('hudScoreboardVal');
  const simOutcomeText = document.getElementById('simOutcomeText');
  const simOutcomeNote = document.getElementById('simOutcomeNote');
  const simLiveAnnouncer = document.getElementById('simLiveAnnouncer');

  if (!topCanvas || !driverCanvas) return;

  const topCtx = topCanvas.getContext('2d');
  const driverCtx = driverCanvas.getContext('2d');

  // --- Audio Synthesis Setup (Web Audio API) ---
  let audioCtx = null;
  let soundEnabled = true;
  let lastSoundTime = 0;

  function initAudio() {
    if (!audioCtx && typeof window.AudioContext !== 'undefined') {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        audioCtx = null;
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playAlertSound(type) {
    if (!soundEnabled || !audioCtx) return;
    const now = performance.now();
    if (now - lastSoundTime < 180) return; // Debounce audio chirps
    lastSoundTime = now;

    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const t = audioCtx.currentTime;

      if (type === 'caution') {
        // High-pitched warning chirp (750 Hz)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(750, t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t);
        osc.stop(t + 0.12);
      } else if (type === 'danger') {
        // Urgent acoustic buzzer alarm (1050 Hz dual pulse)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1050, t);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t);
        osc.stop(t + 0.18);
      } else if (type === 'planned_chime') {
        // Modern European electronic seatbelt/radar chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, t); // D5
        osc.frequency.exponentialRampToValueAtTime(880, t + 0.15); // A5
        gain.gain.setValueAtTime(0.14, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t);
        osc.stop(t + 0.22);
      } else if (type === 'safe_stop') {
        // Gentle dual confirmation chime on safe halt
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, t); // C5
        osc.frequency.setValueAtTime(659.25, t + 0.1); // E5
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.start(t);
        osc.stop(t + 0.28);
      } else if (type === 'click') {
        // UI select blip
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, t);
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.start(t);
        osc.stop(t + 0.05);
      }
    } catch (err) {
      // Audio playback fails gracefully if user hasn't interacted
    }
  }

  // --- Simulation State Variables ---
  let isRunning = true;
  let isNightMode = false;
  let currentMode = MODE.PROTOTYPE;
  let currentState = STATE.CLEAR;
  let currentScenario = 'cow'; // 'cow', 'dog', 'pedestrian', 'debris', 'small'
  let isSteadyMode = false;    // false = Moving (crossing road), true = Steady (standing stationary in lane)
  let activeDemoState = 'auto'; // 'auto', 'caution', 'danger', 'safestop'

  // Car State
  let targetCruiseKmh = PROTOTYPE_CRUISE_KMH;
  let currentSpeedKmh = PROTOTYPE_CRUISE_KMH;
  let carSpeedMs = targetCruiseKmh / 3.6;
  let carDecelerating = false;
  let alertTriggerTime = null;
  let roadScrollOffset = 0;

  // Scoreboard
  let score = {
    safeStops: 0,
    cleared: 0,
    collisions: 0
  };

  // Obstacle State
  let animal = {
    x: -3.5,
    z: 7.0,
    vx: 1.1,
    type: 'cow',
    side: 'left',
    walkCycle: 0,
    widthMeters: 1.8,
    lengthMeters: 2.2,
    crossingActive: true,
    resolved: false
  };

  let outcomeTimer = 0;

  // Motion preference check
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    isRunning = false;
    if (btnPlayPause) {
      btnPlayPause.textContent = '▶ Play';
      btnPlayPause.classList.remove('active');
    }
  }

  // --- High-DPI Canvas Sizing ---
  function resizeCanvas(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.resetTransform?.();
      ctx.scale(dpr, dpr);
    }
    return { width, height };
  }

  // --- Mode Configuration Setup ---
  function applyModeSettings(mode) {
    currentMode = mode;
    resetScoreboard();

    const isProto = mode === MODE.PROTOTYPE;

    if (btnPrototypeMode && btnPlannedMode) {
      btnPrototypeMode.classList.toggle('active', isProto);
      btnPlannedMode.classList.toggle('active', !isProto);
      btnPrototypeMode.setAttribute('aria-pressed', isProto ? 'true' : 'false');
      btnPlannedMode.setAttribute('aria-pressed', !isProto ? 'true' : 'false');
    }

    if (rulerActiveBadge && rulerZoneProto && rulerZonePlanned) {
      if (isProto) {
        rulerActiveBadge.textContent = 'Active: Prototype Envelope (0.2–6.0 m)';
        rulerActiveBadge.className = 'ruler-status-badge badge-proto';
        rulerZoneProto.classList.add('active');
        rulerZonePlanned.classList.remove('active');
      } else {
        rulerActiveBadge.textContent = 'Active: Production Target (0.2–250 m)';
        rulerActiveBadge.className = 'ruler-status-badge badge-planned';
        rulerZonePlanned.classList.add('active');
        rulerZoneProto.classList.remove('active');
      }
    }

    if (isProto) {
      targetCruiseKmh = PROTOTYPE_CRUISE_KMH;
      if (autoSpeedVal) autoSpeedVal.textContent = '14 km/h';
      if (speedModeContext) speedModeContext.textContent = '(Low-Speed Test)';
      if (simRangeCaption) {
        simRangeCaption.textContent = 'Tested Range: 0.2–6 m (Optical + Ultrasonic)';
      }
    } else {
      targetCruiseKmh = PLANNED_CRUISE_KMH;
      if (autoSpeedVal) autoSpeedVal.textContent = '80 km/h';
      if (speedModeContext) speedModeContext.textContent = '(Highway Radar Target)';
      if (simRangeCaption) {
        simRangeCaption.textContent = 'Target Range: 0.2–250 m (77 GHz Long-Range Radar)';
      }
    }

    currentSpeedKmh = targetCruiseKmh;
    carSpeedMs = currentSpeedKmh / 3.6;

    if (activeDemoState === 'auto') {
      spawnAnimal(currentScenario);
    } else {
      triggerDemoState(activeDemoState);
    }
  }

  function resetScoreboard() {
    score.safeStops = 0;
    score.cleared = 0;
    score.collisions = 0;
    updateScoreboardUI();
  }

  function updateScoreboardUI() {
    if (hudScoreboardVal) {
      hudScoreboardVal.textContent = `Stops: ${score.safeStops} | Cleared: ${score.cleared} | Hits: ${score.collisions}`;
    }
  }

  // --- Scenario Selection ---
  function selectScenario(scenarioType) {
    currentScenario = scenarioType;
    Object.keys(scenarioBtns).forEach(key => {
      const btn = scenarioBtns[key];
      if (btn) {
        const isActive = key === scenarioType;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      }
    });
    playAlertSound('click');

    if (activeDemoState === 'auto') {
      spawnAnimal(scenarioType);
    } else {
      triggerDemoState(activeDemoState);
    }
  }

  // --- Motion Mode Toggle (Moving vs Steady) ---
  function setMotionMode(isSteady) {
    isSteadyMode = isSteady;
    if (btnMotionMoving && btnMotionSteady) {
      btnMotionMoving.classList.toggle('active', !isSteady);
      btnMotionSteady.classList.toggle('active', isSteady);
      btnMotionMoving.setAttribute('aria-pressed', !isSteady ? 'true' : 'false');
      btnMotionSteady.setAttribute('aria-pressed', isSteady ? 'true' : 'false');
    }
    playAlertSound('click');
    if (activeDemoState === 'auto') {
      spawnAnimal(currentScenario);
    } else {
      triggerDemoState(activeDemoState);
    }
  }

  // --- State Demo Selector (Auto, Caution, Danger, Safe Stop) ---
  function setDemoState(stateName) {
    activeDemoState = stateName;
    [btnDemoAuto, btnDemoCaution, btnDemoDanger, btnDemoSafeStop].forEach(btn => {
      if (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-state') === stateName);
      }
    });
    playAlertSound('click');

    if (stateName === 'auto') {
      spawnAnimal(currentScenario);
    } else {
      triggerDemoState(stateName);
    }
  }

  function triggerDemoState(stateName) {
    const isProto = currentMode === MODE.PROTOTYPE;
    animal.type = currentScenario;
    animal.walkCycle = 0;
    animal.resolved = false;
    outcomeTimer = 0;

    const isSmall = animal.type === 'small';
    const isDebris = animal.type === 'debris';
    const canMove = !isSmall && !isDebris && !isSteadyMode;
    animal.crossingActive = canMove;

    let moveSpeed = 1.5;
    if (animal.type === 'dog') moveSpeed = 2.5;
    else if (animal.type === 'pedestrian') moveSpeed = 1.5;
    else if (animal.type === 'cow') moveSpeed = 1.6;

    if (stateName === 'caution') {
      // Position obstacle at CAUTION threshold
      animal.z = isProto ? 4.8 : 175.0;
      targetCruiseKmh = isProto ? PROTOTYPE_CRUISE_KMH : PLANNED_CRUISE_KMH;
      currentSpeedKmh = targetCruiseKmh;
      carSpeedMs = currentSpeedKmh / 3.6;
      carDecelerating = false;
      alertTriggerTime = performance.now();
      currentState = STATE.CAUTION;

      if (canMove) {
        animal.side = 'left';
        animal.x = -1.8; // visibly crossing in from left into caution zone
        animal.vx = moveSpeed; // walking LEFT TO RIGHT
      } else {
        animal.side = 'center';
        animal.x = 0;
        animal.vx = 0;
      }

      playAlertSound(isProto ? 'caution' : 'planned_chime');
      setOutcome('CAUTION', isProto ?
        'Caution Demo: Prototype optical + ultrasonic detection triggered! Driver warned via buzzer chimes.' :
        'Caution Demo: Planned 77 GHz radar target locked at long range! Forward Collision Warning active.');

    } else if (stateName === 'danger') {
      // Position obstacle inside critical DANGER braking envelope
      animal.z = isProto ? 2.4 : 65.0;
      targetCruiseKmh = isProto ? PROTOTYPE_CRUISE_KMH : PLANNED_CRUISE_KMH;
      currentSpeedKmh = targetCruiseKmh * 0.75;
      carSpeedMs = currentSpeedKmh / 3.6;
      carDecelerating = true;
      alertTriggerTime = performance.now() - 500;
      currentState = STATE.DANGER;

      if (canMove) {
        animal.side = 'left';
        animal.x = -0.8; // crossing directly in stopping corridor
        animal.vx = moveSpeed; // walking LEFT TO RIGHT
      } else {
        animal.side = 'center';
        animal.x = 0;
        animal.vx = 0;
      }

      playAlertSound(isProto ? 'danger' : 'planned_chime');
      setOutcome('DANGER', isProto ?
        'Danger Demo: Obstacle in stopping corridor! Continuous acoustic buzzer sounding, driver braking.' :
        'Danger Demo: Autonomous Emergency Braking (AEB) firing electronic hydraulic brake command!');

    } else if (stateName === 'safestop') {
      // Position car safely halted before obstacle
      animal.z = isProto ? 1.6 : 14.0;
      currentSpeedKmh = 0;
      carSpeedMs = 0;
      carDecelerating = false;
      currentState = isProto ? STATE.SAFE_STOP : 'SAFE AEB STOP';

      if (canMove) {
        animal.side = 'left';
        animal.x = -1.2;
        animal.vx = moveSpeed; // visibly walks across in front of halted vehicle!
      } else {
        animal.side = 'center';
        animal.x = 0;
        animal.vx = 0;
      }

      score.safeStops += 1;
      playAlertSound('safe_stop');
      setOutcome('SAFE_STOP', isProto ?
        `Safe Stop Demo: Driver alerted by prototype buzzer and brought vehicle to halt ${animal.z.toFixed(1)} m before ${formatObstacleName(animal.type)}.` :
        `Safe Stop Demo: Planned AEB automatically halted vehicle with ${animal.z.toFixed(1)} m safety clearance.`);
      updateScoreboardUI();
    }
  }

  // --- Spawn Obstacle Preset ---
  function spawnAnimal(presetType) {
    const type = presetType || currentScenario || 'cow';
    animal.type = type;
    animal.walkCycle = 0;
    animal.resolved = false;
    animal.crossingActive = true;
    outcomeTimer = 0;

    const isProto = currentMode === MODE.PROTOTYPE;

    // Spawn distance scaled to mode range
    if (isProto) {
      // Tested prototype envelope: 0.2–6.0 m
      // Spawn at 6.2–6.8 m so vehicle detects entering hazard within range
      animal.z = 6.2 + Math.random() * 0.6;
    } else {
      animal.z = 175.0 + Math.random() * 45.0; // Starts around 175 to 220 m
    }

    if (type === 'small') {
      // Small crushed soda can / tiny pebble (<15 cm)
      animal.side = 'center';
      animal.x = (Math.random() - 0.5) * 0.6; // Directly in vehicle lane
      animal.vx = 0;
      animal.widthMeters = 0.25;
      animal.lengthMeters = 0.25;
      animal.crossingActive = false;
    } else if (type === 'debris') {
      // Road debris is stationary in the vehicle path
      animal.side = 'center';
      animal.x = (Math.random() - 0.5) * 0.8; // In vehicle lane corridor
      animal.vx = 0;
      animal.widthMeters = 1.1;
      animal.lengthMeters = 1.1;
      animal.crossingActive = false;
    } else if (isSteadyMode) {
      // STEADY MODE: Animal stands stationary right in the center lane!
      animal.side = 'center';
      animal.x = (Math.random() - 0.5) * 0.5; // In center lane corridor
      animal.vx = 0;
      animal.widthMeters = type === 'cow' ? 1.8 : type === 'dog' ? 0.8 : 0.6;
      animal.lengthMeters = type === 'cow' ? 2.2 : type === 'dog' ? 1.2 : 0.6;
      animal.crossingActive = false;
    } else {
      // MOVING MODE: Animal crosses laterally across roadway from shoulder
      // Primary movement is LEFT-TO-RIGHT so user clearly sees the crossing
      const side = (Math.random() < 0.7) ? 'left' : 'right';
      animal.side = side;

      let speed;
      if (type === 'dog') {
        animal.widthMeters = 0.8;
        animal.lengthMeters = 1.2;
        speed = isProto ? 2.6 : 3.0; // Swift canine dart across road
      } else if (type === 'pedestrian') {
        animal.widthMeters = 0.6;
        animal.lengthMeters = 0.6;
        speed = isProto ? 1.5 : 1.7; // Brisk walk
      } else {
        // Gir Cow
        animal.widthMeters = 1.8;
        animal.lengthMeters = 2.2;
        speed = isProto ? 1.6 : 1.8; // Bovine crossing trot
      }

      if (side === 'left') {
        animal.x = -2.8; // Left road shoulder (clearly in view)
        animal.vx = speed; // Moving LEFT TO RIGHT across the lane
      } else {
        animal.x = 2.8;  // Right road shoulder
        animal.vx = -speed; // Moving RIGHT TO LEFT across the lane
      }
      animal.crossingActive = true;
    }

    // Always reset vehicle dynamics smoothly to automated cruise speed
    targetCruiseKmh = isProto ? PROTOTYPE_CRUISE_KMH : PLANNED_CRUISE_KMH;
    currentSpeedKmh = targetCruiseKmh;
    carSpeedMs = currentSpeedKmh / 3.6;
    carDecelerating = false;
    alertTriggerTime = null;
    currentState = STATE.CLEAR;
  }

  // --- Simulation Physics & State Machine ---
  let lastTimestamp = performance.now();

  function updateSimulation(dt) {
    if (!isRunning) return;

    const isProto = currentMode === MODE.PROTOTYPE;
    const activeRange = isProto ? PROTOTYPE_RANGE_M : PLANNED_RANGE_M;
    const reactionTime = isProto ? PROTOTYPE_REACTION_SEC : PLANNED_REACTION_SEC;
    const brakeDecel = isProto ? PROTOTYPE_BRAKE_MS2 : PLANNED_BRAKE_MS2;

    // Road scroll proportional to car speed
    roadScrollOffset = (roadScrollOffset + carSpeedMs * dt * (isProto ? 85 : 28)) % 1000;

    // Obstacle walking animation and lateral displacement
    if (animal.crossingActive && Math.abs(animal.vx) > 0.05) {
      animal.walkCycle += dt * (isProto ? 5.2 : 5.8);
      animal.x += animal.vx * dt;
    } else {
      animal.walkCycle = 0;
    }

    // --- HANDLE DEMO STATES (caution, danger, safestop) ---
    if (activeDemoState !== 'auto') {
      // In demo states, maintain fixed distance z so user can inspect the state without interruption
      if (activeDemoState === 'caution') {
        animal.z = isProto ? 4.8 : 175.0;
        currentState = STATE.CAUTION;
        currentSpeedKmh = targetCruiseKmh;
        carSpeedMs = currentSpeedKmh / 3.6;
      } else if (activeDemoState === 'danger') {
        animal.z = isProto ? 2.4 : 65.0;
        currentState = STATE.DANGER;
        currentSpeedKmh = targetCruiseKmh * 0.75;
        carSpeedMs = currentSpeedKmh / 3.6;
        carDecelerating = true;
      } else if (activeDemoState === 'safestop') {
        animal.z = isProto ? 1.6 : 14.0;
        currentState = isProto ? STATE.SAFE_STOP : 'SAFE AEB STOP';
        currentSpeedKmh = 0;
        carSpeedMs = 0;
        carDecelerating = false;
      }

      // If in moving mode during demo, oscillate continuously between road shoulders (-2.8m and +2.8m)
      if (animal.crossingActive && animal.vx !== 0) {
        if (animal.x > 2.8 && animal.vx > 0) {
          animal.vx = -Math.abs(animal.vx);
        } else if (animal.x < -2.8 && animal.vx < 0) {
          animal.vx = Math.abs(animal.vx);
        }
      }

      const totalStoppingDist = (carSpeedMs * reactionTime) + ((carSpeedMs * carSpeedMs) / (2 * brakeDecel));
      const warningTimeSec = carSpeedMs > 0.1 ? (activeRange / carSpeedMs) : 99.0;
      updateHUD(totalStoppingDist, warningTimeSec);
      return;
    }

    // --- AUTO CYCLE PHYSICS & DYNAMICS ---
    // Relative longitudinal approach
    animal.z -= carSpeedMs * dt;

    // Stopping distance formula: d_stopping = (v * t_reaction) + (v^2 / (2 * a))
    const reactionDist = carSpeedMs * reactionTime;
    const brakingDist = (carSpeedMs * carSpeedMs) / (2 * brakeDecel);
    const totalStoppingDist = reactionDist + brakingDist;
    const warningTimeSec = carSpeedMs > 0.1 ? (activeRange / carSpeedMs) : 99.0;

    // Hazard geometry: in vehicle path or entering
    const inPath = Math.abs(animal.x) < 1.7;
    const headingIntoPath = (animal.side === 'left' && animal.vx > 0 && animal.x < 1.5) ||
                            (animal.side === 'right' && animal.vx < 0 && animal.x > -1.5) ||
                            (animal.type === 'debris' && inPath) ||
                            (isSteadyMode && inPath);
    // Small obstacles (<15cm) are below vehicle ground clearance: treated as drivable/roll-over safe!
    const isThreat = (animal.type !== 'small') && (inPath || headingIntoPath);
    const isWithinRange = animal.z <= activeRange;

    if (!animal.resolved) {
      if (animal.z <= 0.6) {
        // Reached front bumper level
        animal.resolved = true;
        if (animal.type === 'small') {
          score.cleared += 1;
          currentState = STATE.CLEAR;
          setOutcome('PASSED', 'Small item (<15 cm) safely cleared: Vehicle ground clearance allows safe roll-over without phantom braking.');
        } else if (Math.abs(animal.x) < 1.3) {
          score.collisions += 1;
          currentState = STATE.COLLISION;
          const msg = isProto ?
            `Collision with ${formatObstacleName(animal.type)}! Prototype detected hazard at 5–6 m, but human reaction time exceeded stopping distance at this speed.` :
            `Collision with ${formatObstacleName(animal.type)}! Severe obstacle entry within emergency stopping envelope.`;
          setOutcome('COLLISION', msg);
        } else {
          score.cleared += 1;
          setOutcome('PASSED', `${formatObstacleName(animal.type)} crossed road safely outside vehicle corridor.`);
        }
        updateScoreboardUI();
      } else if (carDecelerating && carSpeedMs <= 0.15) {
        // Vehicle stopped safely before obstacle
        carSpeedMs = 0;
        currentSpeedKmh = 0;
        carDecelerating = false;
        animal.resolved = true;
        score.safeStops += 1;
        currentState = isProto ? STATE.SAFE_STOP : 'SAFE AEB STOP';
        const distMargin = Math.max(0, animal.z).toFixed(1);
        const msg = isProto ?
          `Safe human stop: Driver alerted by prototype buzzer and halted ${distMargin} m before ${formatObstacleName(animal.type)}.` :
          `Safe AEB stop: Automatic emergency braking halted car ${distMargin} m before ${formatObstacleName(animal.type)} (Planned concept).`;
        setOutcome('SAFE_STOP', msg);
        playAlertSound('safe_stop');
        updateScoreboardUI();
      } else if (animal.crossingActive && animal.vx !== 0 && ((animal.vx > 0 && animal.x > ROAD_WIDTH_METERS / 2 + 0.8) || (animal.vx < 0 && animal.x < -ROAD_WIDTH_METERS / 2 - 0.8))) {
        // Obstacle walked completely clear across the road
        animal.resolved = true;
        score.cleared += 1;
        setOutcome('PASSED', `${formatObstacleName(animal.type)} cleared the roadway safely.`);
        updateScoreboardUI();
      } else if (isWithinRange && isThreat) {
        // Inside detection range and on collision trajectory
        if (animal.z < totalStoppingDist * 1.15 || animal.z < activeRange * 0.45) {
          currentState = STATE.DANGER;
          if (!alertTriggerTime) alertTriggerTime = performance.now();
          playAlertSound(isProto ? 'danger' : 'planned_chime');
        } else {
          currentState = STATE.CAUTION;
          if (!alertTriggerTime) alertTriggerTime = performance.now();
          playAlertSound(isProto ? 'caution' : 'planned_chime');
        }
      } else if (isWithinRange) {
        currentState = animal.type === 'small' ? 'ROLL-OVER SAFE' : STATE.DETECTED;
      } else {
        currentState = STATE.CLEAR;
      }
    }

    // Braking Logic (Auto mode)
    if (activeDemoState === 'auto') {
      if (currentMode === MODE.PLANNED) {
        if ((currentState === STATE.DANGER || currentState === STATE.CAUTION) && !carDecelerating) {
          carDecelerating = true;
        }
      } else {
        if ((currentState === STATE.DANGER || currentState === STATE.CAUTION) && alertTriggerTime) {
          const timeSinceAlertSec = (performance.now() - alertTriggerTime) / 1000.0;
          if (timeSinceAlertSec >= PROTOTYPE_REACTION_SEC) {
            carDecelerating = true;
          }
        }
      }
    }

    // Dynamics: brake or accelerate back to cruise speed
    if (carDecelerating) {
      carSpeedMs = Math.max(0, carSpeedMs - brakeDecel * dt);
      currentSpeedKmh = carSpeedMs * 3.6;
    } else if (!animal.resolved && currentSpeedKmh < targetCruiseKmh && activeDemoState === 'auto') {
      carSpeedMs = Math.min(targetCruiseKmh / 3.6, carSpeedMs + ACCEL_MS2 * dt);
      currentSpeedKmh = carSpeedMs * 3.6;
    }

    // Cycle delay: Once resolved in auto mode, wait 2.2s then spawn next obstacle
    if (animal.resolved && activeDemoState === 'auto') {
      outcomeTimer += dt;
      if (outcomeTimer >= 2.2) {
        outcomeTimer = 0;
        spawnAnimal(currentScenario);
      }
    }

    updateHUD(totalStoppingDist, warningTimeSec);
  }

  function formatObstacleName(type) {
    if (type === 'cow') return 'Gir Cattle';
    if (type === 'dog') return 'Darting Dog';
    if (type === 'pedestrian') return 'Pedestrian';
    if (type === 'debris') return 'Road Cargo';
    if (type === 'small') return 'Small Item (<15cm)';
    return type;
  }

  // --- Outcome Reporting ---
  function setOutcome(type, message) {
    let icon = '🛡️';
    let textClass = 'color: var(--accent-emerald)';

    if (type === 'COLLISION') {
      icon = '⚠️';
      textClass = 'color: var(--accent-rose)';
    } else if (type === 'PASSED') {
      icon = '✅';
      textClass = 'color: var(--accent-cyan)';
    } else if (type === 'CAUTION') {
      icon = '🟡';
      textClass = 'color: var(--accent-amber)';
    } else if (type === 'DANGER') {
      icon = '🔴';
      textClass = 'color: var(--accent-rose)';
    }

    if (simOutcomeText) {
      simOutcomeText.innerHTML = `<span style="${textClass}">${icon} ${message}</span>`;
    }

    if (simOutcomeNote) {
      if (currentMode === MODE.PROTOTYPE) {
        simOutcomeNote.textContent = 'Prototype Mode (0.2–6 m range): Alerts driver only via buzzer. Human reaction latency (0.8s) governs braking.';
      } else {
        simOutcomeNote.textContent = 'Planned Concept (0.2–250 m target): Autonomous emergency braking + rapid seatbelt-style chime (Concept only, not built yet).';
      }
    }

    if (simLiveAnnouncer) {
      simLiveAnnouncer.textContent = `Simulation event: ${message}`;
    }
  }

  // --- Update HUD DOM ---
  function updateHUD(stoppingDistMeters, warningTimeSec) {
    if (hudStatePill) {
      const stateClass = currentState.toLowerCase().replace(/\s+/g, '-');
      hudStatePill.className = `hud-state-pill state-${stateClass}`;
      hudStatePill.textContent = currentState;
    }

    const isProto = currentMode === MODE.PROTOTYPE;
    const activeRange = isProto ? PROTOTYPE_RANGE_M : PLANNED_RANGE_M;

    if (hudDistanceVal) {
      if (animal.z <= activeRange && animal.z >= MIN_DETECTION_RANGE_M) {
        hudDistanceVal.textContent = `${animal.z.toFixed(1)} m`;
        hudDistanceVal.style.color = 'var(--text-primary)';
      } else if (animal.z < MIN_DETECTION_RANGE_M && animal.z > 0) {
        hudDistanceVal.textContent = '< 0.2 m (Near-Field Bumper Limit)';
        hudDistanceVal.style.color = 'var(--accent-red)';
      } else {
        hudDistanceVal.textContent = isProto ? '> 6 m (Out of Range)' : '> 250 m (Out of Range)';
        hudDistanceVal.style.color = 'var(--text-muted)';
      }
    }

    if (hudSpeedVal) {
      hudSpeedVal.textContent = `${Math.round(currentSpeedKmh)} km/h`;
    }

    if (hudStoppingVal) {
      hudStoppingVal.textContent = `${stoppingDistMeters.toFixed(1)} m`;
    }

    if (hudWarningTimeVal) {
      if (warningTimeSec >= 90) {
        hudWarningTimeVal.textContent = '∞ s';
      } else {
        hudWarningTimeVal.textContent = `${warningTimeSec.toFixed(1)} s`;
      }
    }

    if (hudBuzzerVal) {
      if (currentState === STATE.DANGER) {
        hudBuzzerVal.textContent = isProto ? 'Continuous Alarm' : 'Rapid Seatbelt-Style Chime';
        hudBuzzerVal.style.color = 'var(--accent-rose)';
      } else if (currentState === STATE.CAUTION) {
        hudBuzzerVal.textContent = isProto ? 'Pulsed Chime' : 'Seatbelt Warning Chime';
        hudBuzzerVal.style.color = 'var(--accent-amber)';
      } else if (currentState === STATE.SAFE_STOP || currentState === 'SAFE AEB STOP') {
        hudBuzzerVal.textContent = 'Silent (Vehicle Stopped)';
        hudBuzzerVal.style.color = 'var(--accent-emerald)';
      } else {
        hudBuzzerVal.textContent = 'Silent (Clear)';
        hudBuzzerVal.style.color = 'var(--text-muted)';
      }
    }

    if (flashOverlay) {
      if (currentState === STATE.DANGER) {
        flashOverlay.classList.add('active-danger');
      } else {
        flashOverlay.classList.remove('active-danger');
      }
    }
  }

  // ============================================================
  // RENDER 1: TOP-DOWN AERIAL ROAD VIEW
  // ============================================================
  function drawTopView() {
    const { width, height } = resizeCanvas(topCanvas, topCtx);
    const ctx = topCtx;
    const isProto = currentMode === MODE.PROTOTYPE;
    const activeRange = isProto ? PROTOTYPE_RANGE_M : PLANNED_RANGE_M;
    const now = performance.now();

    // Background verge
    ctx.fillStyle = isNightMode ? '#07100e' : '#1a2e24';
    ctx.fillRect(0, 0, width, height);

    // Roadway dimensions
    const roadWidthPx = Math.min(width * 0.72, 230);
    const roadLeft = (width - roadWidthPx) / 2;
    const roadRight = roadLeft + roadWidthPx;
    const roadCenter = width / 2;

    // Road surface
    ctx.fillStyle = isNightMode ? '#0c1017' : '#1e2430';
    ctx.fillRect(roadLeft, 0, roadWidthPx, height);

    // Curbs
    ctx.fillStyle = isNightMode ? '#283243' : '#475569';
    ctx.fillRect(roadLeft - 3, 0, 3, height);
    ctx.fillRect(roadRight, 0, 3, height);

    // Verge Reflector Marker Posts
    const postSpacing = 90;
    const numPosts = 6;
    for (let i = 0; i < numPosts; i++) {
      const postY = ((i * postSpacing) + roadScrollOffset) % (height + 20) - 10;
      ctx.fillStyle = '#64748b';
      ctx.fillRect(roadLeft - 10, postY, 4, 8);
      ctx.fillRect(roadRight + 6, postY, 4, 8);
      // Amber reflector dot
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(roadLeft - 9, postY + 2, 2, 4);
      ctx.fillRect(roadRight + 7, postY + 2, 2, 4);
    }

    // Center Dashed Lane Markings
    ctx.strokeStyle = isNightMode ? '#64748b' : '#f8fafc';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 14]);
    ctx.lineDashOffset = -roadScrollOffset;
    ctx.beginPath();
    ctx.moveTo(roadCenter, 0);
    ctx.lineTo(roadCenter, height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Vehicle position (fixed near bottom)
    const carY = height * 0.76;
    const carWidthPx = (CAR_WIDTH_METERS / ROAD_WIDTH_METERS) * roadWidthPx;
    const carHeightPx = (CAR_LENGTH_METERS / ROAD_WIDTH_METERS) * roadWidthPx;
    const carX = roadCenter - carWidthPx / 2;

    // Scaling: meters to pixels
    const maxVisibleAheadMeters = isProto ? 8.5 : 275.0;
    const pxPerMeter = (carY - 15) / maxVisibleAheadMeters;

    // Concentric Ping Waves from Front Bumper
    ctx.save();
    const pingSpeed = isProto ? 800 : 1200;
    const pingCount = 3;
    for (let p = 0; p < pingCount; p++) {
      const phase = ((now / pingSpeed) + (p / pingCount)) % 1.0;
      const waveRadius = phase * (activeRange * pxPerMeter);
      const waveAlpha = (1.0 - phase) * (isProto ? 0.45 : 0.35);

      ctx.strokeStyle = isProto ? `rgba(16, 185, 129, ${waveAlpha})` : `rgba(6, 182, 212, ${waveAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(roadCenter, carY, waveRadius, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.stroke();
    }

    // Radar Oscillating Sweep Beam (Planned Mode 77 GHz)
    if (!isProto) {
      const sweepAngle = Math.sin(now / 350) * 0.32; // oscillating across cone
      const beamLen = activeRange * pxPerMeter;
      const sweepEndX = roadCenter + Math.sin(sweepAngle) * beamLen;
      const sweepEndY = carY - Math.cos(sweepAngle) * beamLen;

      const sweepGrad = ctx.createLinearGradient(roadCenter, carY, sweepEndX, sweepEndY);
      sweepGrad.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
      sweepGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

      ctx.strokeStyle = sweepGrad;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(roadCenter, carY);
      ctx.lineTo(sweepEndX, sweepEndY);
      ctx.stroke();
    }

    // Detection Range Zone Boundary Arc
    const detectionArcRadiusPx = activeRange * pxPerMeter;
    ctx.strokeStyle = isProto ? 'rgba(16, 185, 129, 0.55)' : 'rgba(59, 130, 246, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(roadCenter, carY, Math.min(detectionArcRadiusPx, height * 0.88), -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();

    // Range Label Tag on Arc
    ctx.fillStyle = isProto ? '#10b981' : '#38bdf8';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    const arcLabelY = Math.max(22, carY - detectionArcRadiusPx + 4);
    ctx.fillText(isProto ? 'PROTOTYPE RANGE: 6 m' : '77 GHz RADAR CONE: 250 m', roadCenter, arcLabelY);

    // Near-field 0.2 m bumper indicator
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(roadCenter, carY, carWidthPx * 0.65, -Math.PI * 0.9, -Math.PI * 0.1);
    ctx.stroke();
    ctx.restore();

    // Night Mode Headlight / IR Illumination Cones
    if (isNightMode) {
      const beamGrad = ctx.createRadialGradient(roadCenter, carY, 10, roadCenter, carY - 120, 180);
      beamGrad.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
      beamGrad.addColorStop(0.6, 'rgba(16, 185, 129, 0.15)');
      beamGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(carX + 4, carY);
      ctx.lineTo(roadLeft - 15, carY - 180);
      ctx.lineTo(roadRight + 15, carY - 180);
      ctx.lineTo(carX + carWidthPx - 4, carY);
      ctx.closePath();
      ctx.fill();
    }

    // Draw Top-View Car
    drawTopCar(ctx, carX, carY, carWidthPx, carHeightPx, carDecelerating);

    // Draw Obstacle
    const animalY = carY - (animal.z * pxPerMeter);
    const animalXPx = roadCenter + ((animal.x / (ROAD_WIDTH_METERS / 2)) * (roadWidthPx / 2));
    const isDetected = animal.z <= activeRange && currentState !== STATE.CLEAR;

    if (animalY > -30 && animalY < height + 30) {
      drawTopObstacle(ctx, animalXPx, animalY, animal.type, animal.walkCycle, animal.vx, isDetected);
    }
  }

  function drawTopCar(ctx, x, y, w, h, isBraking) {
    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(x - 2, y + 2, w + 4, h + 4, 6);
    ctx.fill();

    // Car Body (Aerodynamic sedan)
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();

    // Windshield & Rear Window
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + 3, y + 6, w - 6, h * 0.22);
    ctx.fillRect(x + 4, y + h - 12, w - 8, h * 0.16);

    // Headlights (Front)
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(x + 2, y - 1, 4, 2);
    ctx.fillRect(x + w - 6, y - 1, 4, 2);

    // LED Brake Lights (Rear)
    if (isBraking) {
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
      ctx.fillRect(x + 1, y + h - 2, 6, 3);
      ctx.fillRect(x + w - 7, y + h - 2, 6, 3);
    } else {
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(x + 1, y + h - 1, 5, 2);
      ctx.fillRect(x + w - 6, y + h - 1, 5, 2);
    }

    ctx.restore();
  }

  function drawTopObstacle(ctx, x, y, type, walkCycle, vx, isDetected) {
    ctx.save();
    const legOffset = (Math.abs(vx) > 0.05) ? Math.sin(walkCycle) * 3 : 0;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (type === 'small') {
      // Small crushed soda can / tiny pebble (<15 cm)
      ctx.fillStyle = '#ef4444'; // Red soda can
      ctx.fillRect(x - 3, y - 2, 6, 4);
      ctx.fillStyle = '#cbd5e1'; // Silver rim
      ctx.fillRect(x - 3, y - 2, 2, 4);

    } else if (type === 'debris') {
      // Wooden cargo box with hazard stripes
      ctx.fillStyle = '#d97706';
      ctx.fillRect(x - 8, y - 8, 16, 16);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 8, y - 8, 16, 16);
      // Chevron cross
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 8); ctx.lineTo(x + 8, y + 8);
      ctx.moveTo(x + 8, y - 8); ctx.lineTo(x - 8, y + 8);
      ctx.stroke();

    } else if (type === 'pedestrian') {
      // Pedestrian: head, shoulders, bright vest
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(x, y - 2, 3.5, 0, Math.PI * 2); // Head
      ctx.fill();
      // Shoulders with safety vest
      ctx.fillStyle = isNightMode ? '#06b6d4' : '#22c55e';
      ctx.fillRect(x - 6, y + 1, 12, 5);
      // Feet
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x - 4 + legOffset, y + 6, 3, 4);
      ctx.fillRect(x + 1 - legOffset, y + 6, 3, 4);

    } else if (type === 'dog') {
      // Dog: agile slender canine
      ctx.fillStyle = '#ca8a04';
      ctx.beginPath();
      ctx.roundRect(x - 7, y - 4, 14, 8, 3);
      ctx.fill();
      // Legs
      ctx.fillStyle = '#a16207';
      ctx.fillRect(x - 6 + legOffset, y - 5, 2.5, 2.5);
      ctx.fillRect(x + 3 - legOffset, y - 5, 2.5, 2.5);
      ctx.fillRect(x - 6 - legOffset, y + 3, 2.5, 2.5);
      ctx.fillRect(x + 3 + legOffset, y + 3, 2.5, 2.5);
      // Head & tail
      const headX = vx >= 0 ? x + 8 : x - 8;
      ctx.beginPath();
      ctx.arc(headX, y, 3.5, 0, Math.PI * 2);
      ctx.fill();

    } else {
      // Realistic Gir Cow: broad shoulder hump, horns, tail
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.roundRect(x - 9, y - 5, 18, 10, 3);
      ctx.fill();

      // Zebu Shoulder hump
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.arc(vx >= 0 ? x + 2 : x - 2, y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Horns
      const headX = vx >= 0 ? x + 10 : x - 10;
      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(headX, y - 3); ctx.lineTo(headX + (vx >= 0 ? 3 : -3), y - 6);
      ctx.moveTo(headX, y + 3); ctx.lineTo(headX + (vx >= 0 ? 3 : -3), y + 6);
      ctx.stroke();

      // Animated legs
      ctx.fillStyle = '#78350f';
      ctx.fillRect(x - 7 + legOffset, y - 7, 3, 3);
      ctx.fillRect(x + 4 - legOffset, y - 7, 3, 3);
      ctx.fillRect(x - 7 - legOffset, y + 4, 3, 3);
      ctx.fillRect(x + 4 + legOffset, y + 4, 3, 3);
    }

    // Bounding Box only if detected within range
    if (isDetected) {
      const boxColor = (animal.type === 'small') ? '#10b981' :
                       (currentState === STATE.DANGER || currentState === STATE.COLLISION) ? '#ef4444' :
                       currentState === STATE.CAUTION ? '#f59e0b' : '#06b6d4';
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 1.5;
      const bw = animal.type === 'small' ? 14 : 26;
      const bh = animal.type === 'small' ? 10 : 20;
      ctx.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
    }
    ctx.restore();
  }

  // ============================================================
  // RENDER 2: DRIVER WINDSHIELD PERSPECTIVE VIEW
  // ============================================================
  function drawDriverView() {
    const { width, height } = resizeCanvas(driverCanvas, driverCtx);
    const ctx = driverCtx;
    const isProto = currentMode === MODE.PROTOTYPE;
    const activeRange = isProto ? PROTOTYPE_RANGE_M : PLANNED_RANGE_M;

    // Horizon & Vanishing Point
    const horizonY = height * 0.48;
    const vpX = width / 2;

    // Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    if (isNightMode) {
      skyGrad.addColorStop(0, '#030712');
      skyGrad.addColorStop(1, '#0b132b');
    } else {
      skyGrad.addColorStop(0, '#38bdf8');
      skyGrad.addColorStop(0.7, '#93c5fd');
      skyGrad.addColorStop(1, '#dbeafe');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, horizonY);

    // Stars at night
    if (isNightMode) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 20; i++) {
        const sx = ((i * 73) % width);
        const sy = ((i * 37) % (horizonY * 0.85));
        ctx.fillRect(sx, sy, 1.2, 1.2);
      }
    }

    // Ground / Terrain
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, height);
    if (isNightMode) {
      groundGrad.addColorStop(0, '#06130e');
      groundGrad.addColorStop(1, '#020617');
    } else {
      groundGrad.addColorStop(0, '#14532d');
      groundGrad.addColorStop(1, '#064e3b');
    }
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, width, height - horizonY);

    // Perspective Road Trapezoid
    const roadTopWidth = 14;
    const roadBottomWidth = width * 0.94;
    const roadBottomY = height * 0.88;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(vpX - roadTopWidth / 2, horizonY);
    ctx.lineTo(vpX + roadTopWidth / 2, horizonY);
    ctx.lineTo(vpX + roadBottomWidth / 2, roadBottomY);
    ctx.lineTo(vpX - roadBottomWidth / 2, roadBottomY);
    ctx.closePath();

    ctx.fillStyle = isNightMode ? '#0f172a' : '#1e293b';
    ctx.fill();

    // Road Edge Curbs (White Solid Perspective Lines)
    ctx.strokeStyle = isNightMode ? '#475569' : '#f8fafc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(vpX - roadTopWidth / 2, horizonY);
    ctx.lineTo(vpX - roadBottomWidth / 2, roadBottomY);
    ctx.moveTo(vpX + roadTopWidth / 2, horizonY);
    ctx.lineTo(vpX + roadBottomWidth / 2, roadBottomY);
    ctx.stroke();

    // Center Dashed Lane Markings with Perspective Dash foreshortening
    drawPerspectiveLaneDashes(ctx, vpX, horizonY, roadBottomY);

    ctx.restore();

    // Night Mode Forward Headlight / IR Illumination Fog
    if (isNightMode) {
      const coneGrad = ctx.createRadialGradient(vpX, roadBottomY, 10, vpX, horizonY + 30, width * 0.55);
      coneGrad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
      coneGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.18)');
      coneGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(vpX - 8, horizonY + 10);
      ctx.lineTo(vpX + 8, horizonY + 10);
      ctx.lineTo(vpX + roadBottomWidth * 0.48, roadBottomY);
      ctx.lineTo(vpX - roadBottomWidth * 0.48, roadBottomY);
      ctx.closePath();
      ctx.fill();
    }

    // Draw Perspective Obstacle
    drawDriverPerspectiveObstacle(ctx, vpX, horizonY, roadBottomY, roadBottomWidth, activeRange, isProto);

    // Windshield ADAS Heads-Up Projection (HUD)
    drawWindshieldHUD(ctx, width, horizonY, isProto);

    // Dashboard Cowl, Steering Wheel & Instrument Cluster Overlay
    drawCockpitDashboard(ctx, width, height, isProto);
  }

  function drawPerspectiveLaneDashes(ctx, vpX, horizonY, roadBottomY) {
    const numDashes = 10;
    ctx.strokeStyle = '#f8fafc';

    for (let i = 0; i < numDashes; i++) {
      const rawPhase = (i / numDashes) + (roadScrollOffset % 100) / 100;
      const phase = rawPhase % 1.0;

      // Perspective projection mapping
      const p = Math.pow(phase, 2.5);
      const y1 = horizonY + (roadBottomY - horizonY) * p;
      const dashLen = Math.max(3, 40 * p);
      const y2 = Math.min(roadBottomY, y1 + dashLen);

      ctx.lineWidth = Math.max(1, 4.5 * p);
      ctx.beginPath();
      ctx.moveTo(vpX, y1);
      ctx.lineTo(vpX, y2);
      ctx.stroke();
    }
  }

  function drawDriverPerspectiveObstacle(ctx, vpX, horizonY, roadBottomY, roadBottomWidth, activeRange, isProto) {
    const dist = Math.max(0.4, animal.z);

    // Perspective depth calculation normalized to mode range
    const normDist = isProto ? (dist / 8.5) : (dist / 275.0);
    const depthT = Math.max(0.04, Math.min(1.0, 1.0 - normDist));
    const scale = Math.pow(depthT, 1.4);

    const groundY = horizonY + (roadBottomY - horizonY) * scale;
    const lateralSpanAtGround = roadBottomWidth * scale;
    const animalScreenX = vpX + (animal.x / (ROAD_WIDTH_METERS / 2)) * (lateralSpanAtGround / 2);

    let animalH = Math.max(14, 130 * scale);
    let animalW = animalH * 1.35;

    if (animal.type === 'pedestrian') {
      animalH = Math.max(18, 155 * scale);
      animalW = animalH * 0.55;
    } else if (animal.type === 'dog') {
      animalH = Math.max(12, 90 * scale);
      animalW = animalH * 1.45;
    } else if (animal.type === 'debris') {
      animalH = Math.max(14, 85 * scale);
      animalW = animalH * 1.25;
    } else if (animal.type === 'small') {
      animalH = Math.max(8, 25 * scale);
      animalW = animalH * 1.5;
    }

    const drawX = animalScreenX - animalW / 2;
    const drawY = groundY - animalH;

    if (dist > (activeRange * 1.25) && isProto) return; // Beyond prototype visual horizon

    ctx.save();

    // Shadow on pavement
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(animalScreenX, groundY - 2, animalW * 0.48, animalH * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    const legPhase = (Math.abs(animal.vx) > 0.05) ? Math.sin(animal.walkCycle) * (animalH * 0.14) : 0;
    const isFacingRight = animal.vx >= 0;

    // --- PHOTOREALISTIC CHARACTER RENDERING ---
    if (animal.type === 'small') {
      // Photorealistic Aluminum Soda Can (<15cm)
      const canGrad = ctx.createLinearGradient(drawX, drawY, drawX + animalW, drawY);
      canGrad.addColorStop(0, '#991b1b');
      canGrad.addColorStop(0.35, '#ef4444');
      canGrad.addColorStop(0.7, '#f87171');
      canGrad.addColorStop(1, '#7f1d1d');

      ctx.fillStyle = canGrad;
      ctx.beginPath();
      ctx.roundRect(drawX, drawY + animalH * 0.25, animalW, animalH * 0.75, animalH * 0.2);
      ctx.fill();

      // Silver Top Rim & Pull Tab
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.ellipse(drawX + animalW / 2, drawY + animalH * 0.25, animalW * 0.45, animalH * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Top Pull tab
      ctx.fillStyle = '#64748b';
      ctx.fillRect(drawX + animalW * 0.42, drawY + animalH * 0.18, animalW * 0.16, animalH * 0.12);

    } else if (animal.type === 'debris') {
      // Photorealistic Heavy Shipping Pallet / Cargo Crate
      const crateGrad = ctx.createLinearGradient(drawX, drawY, drawX, drawY + animalH);
      crateGrad.addColorStop(0, '#b45309');
      crateGrad.addColorStop(0.5, '#92400e');
      crateGrad.addColorStop(1, '#78350f');

      ctx.fillStyle = crateGrad;
      ctx.beginPath();
      ctx.roundRect(drawX, drawY + animalH * 0.15, animalW, animalH * 0.85, 4);
      ctx.fill();

      // Wood Planks Horizontal Seams
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = Math.max(1, 1.8 * scale);
      for (let p = 1; p <= 3; p++) {
        const seamY = drawY + animalH * 0.15 + (animalH * 0.85) * (p / 4);
        ctx.beginPath();
        ctx.moveTo(drawX, seamY); ctx.lineTo(drawX + animalW, seamY);
        ctx.stroke();
      }

      // Yellow & Black Industrial Warning Chevron Stripes
      ctx.save();
      ctx.beginPath();
      ctx.rect(drawX, drawY + animalH * 0.35, animalW, animalH * 0.32);
      ctx.clip();
      ctx.fillStyle = '#facc15';
      ctx.fillRect(drawX, drawY + animalH * 0.35, animalW, animalH * 0.32);

      ctx.fillStyle = '#0f172a';
      const stripeW = animalW * 0.18;
      for (let s = -2; s < 8; s++) {
        ctx.beginPath();
        ctx.moveTo(drawX + s * stripeW, drawY + animalH * 0.67);
        ctx.lineTo(drawX + s * stripeW + stripeW * 0.7, drawY + animalH * 0.67);
        ctx.lineTo(drawX + s * stripeW + stripeW * 1.5, drawY + animalH * 0.35);
        ctx.lineTo(drawX + s * stripeW + stripeW * 0.8, drawY + animalH * 0.35);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Steel corner reinforcement plates
      ctx.fillStyle = '#475569';
      ctx.fillRect(drawX, drawY + animalH * 0.15, animalW * 0.15, animalH * 0.15);
      ctx.fillRect(drawX + animalW * 0.85, drawY + animalH * 0.15, animalW * 0.15, animalH * 0.15);
      ctx.fillRect(drawX, drawY + animalH * 0.85, animalW * 0.15, animalH * 0.15);
      ctx.fillRect(drawX + animalW * 0.85, drawY + animalH * 0.85, animalW * 0.15, animalH * 0.15);

    } else if (animal.type === 'pedestrian') {
      // Photorealistic Pedestrian with High-Vis Safety Vest
      // Legs with articulated walking stride
      ctx.fillStyle = isNightMode ? '#0f172a' : '#1e293b';
      const leftLegX = drawX + animalW * 0.24 + legPhase;
      const rightLegX = drawX + animalW * 0.54 - legPhase;
      ctx.fillRect(leftLegX, drawY + animalH * 0.6, animalW * 0.22, animalH * 0.38);
      ctx.fillRect(rightLegX, drawY + animalH * 0.6, animalW * 0.22, animalH * 0.38);

      // Shoes
      ctx.fillStyle = '#475569';
      ctx.fillRect(leftLegX - 2, drawY + animalH * 0.94, animalW * 0.26, animalH * 0.06);
      ctx.fillRect(rightLegX - 2, drawY + animalH * 0.94, animalW * 0.26, animalH * 0.06);

      // Torso / Jacket
      const jacketGrad = ctx.createLinearGradient(drawX, drawY, drawX, drawY + animalH * 0.6);
      jacketGrad.addColorStop(0, '#1e293b');
      jacketGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = jacketGrad;
      ctx.beginPath();
      ctx.roundRect(drawX + animalW * 0.2, drawY + animalH * 0.24, animalW * 0.6, animalH * 0.38, 4);
      ctx.fill();

      // Fluorescent Safety Vest (Lime Green/Yellow)
      ctx.fillStyle = '#84cc16';
      ctx.beginPath();
      ctx.roundRect(drawX + animalW * 0.22, drawY + animalH * 0.25, animalW * 0.56, animalH * 0.28, 3);
      ctx.fill();

      // Retroreflective Silver Strips (Glows brilliant neon cyan in night+IR!)
      ctx.fillStyle = isNightMode ? '#38bdf8' : '#f8fafc';
      if (isNightMode) {
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8;
      }
      ctx.fillRect(drawX + animalW * 0.22, drawY + animalH * 0.34, animalW * 0.56, animalH * 0.05);
      ctx.fillRect(drawX + animalW * 0.22, drawY + animalH * 0.44, animalW * 0.56, animalH * 0.05);
      // Vertical harness strips
      ctx.fillRect(drawX + animalW * 0.35, drawY + animalH * 0.25, animalW * 0.07, animalH * 0.28);
      ctx.fillRect(drawX + animalW * 0.58, drawY + animalH * 0.25, animalW * 0.07, animalH * 0.28);
      ctx.shadowBlur = 0;

      // Arms swinging
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(drawX + animalW * 0.12 - legPhase * 0.7, drawY + animalH * 0.26, animalW * 0.12, animalH * 0.32);
      ctx.fillRect(drawX + animalW * 0.76 + legPhase * 0.7, drawY + animalH * 0.26, animalW * 0.12, animalH * 0.32);

      // Head & Hair / Cap
      ctx.fillStyle = '#fed7aa'; // Face skin tone
      ctx.beginPath();
      ctx.arc(animalScreenX, drawY + animalH * 0.15, animalH * 0.1, 0, Math.PI * 2);
      ctx.fill();

      // Cap / Hair
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(animalScreenX, drawY + animalH * 0.13, animalH * 0.1, Math.PI, Math.PI * 2);
      ctx.fill();
      // Cap visor
      ctx.fillRect(animalScreenX + (isFacingRight ? 0 : -animalW * 0.25), drawY + animalH * 0.12, animalW * 0.25, animalH * 0.03);

    } else if (animal.type === 'dog') {
      // Photorealistic Indian Indie Street Dog (Agile canine anatomy)
      const dogGrad = ctx.createLinearGradient(drawX, drawY, drawX, drawY + animalH);
      dogGrad.addColorStop(0, '#ca8a04');
      dogGrad.addColorStop(0.6, '#a16207');
      dogGrad.addColorStop(1, '#713f12');

      // Dog Torso with deep athletic chest and tucked flank
      ctx.fillStyle = dogGrad;
      ctx.beginPath();
      ctx.ellipse(drawX + animalW * 0.48, drawY + animalH * 0.48, animalW * 0.35, animalH * 0.22, isFacingRight ? -0.1 : 0.1, 0, Math.PI * 2);
      ctx.fill();

      // Lighter chest patch
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.ellipse(drawX + (isFacingRight ? animalW * 0.62 : animalW * 0.34), drawY + animalH * 0.52, animalW * 0.12, animalH * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();

      // 4 Articulated legs with jointed paws
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(drawX + animalW * 0.22 + legPhase, drawY + animalH * 0.65, animalW * 0.08, animalH * 0.35);
      ctx.fillRect(drawX + animalW * 0.36 - legPhase, drawY + animalH * 0.65, animalW * 0.08, animalH * 0.35);
      ctx.fillRect(drawX + animalW * 0.58 + legPhase, drawY + animalH * 0.65, animalW * 0.08, animalH * 0.35);
      ctx.fillRect(drawX + animalW * 0.72 - legPhase, drawY + animalH * 0.65, animalW * 0.08, animalH * 0.35);

      // Paws
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(drawX + animalW * 0.22 + legPhase, drawY + animalH * 0.95, animalW * 0.11, animalH * 0.05);
      ctx.fillRect(drawX + animalW * 0.36 - legPhase, drawY + animalH * 0.95, animalW * 0.11, animalH * 0.05);
      ctx.fillRect(drawX + animalW * 0.58 + legPhase, drawY + animalH * 0.95, animalW * 0.11, animalH * 0.05);
      ctx.fillRect(drawX + animalW * 0.72 - legPhase, drawY + animalH * 0.95, animalW * 0.11, animalH * 0.05);

      // Canine Neck and Triangular Head
      const headX = isFacingRight ? drawX + animalW * 0.76 : drawX + animalW * 0.08;
      ctx.fillStyle = dogGrad;
      ctx.beginPath();
      ctx.ellipse(headX + animalW * 0.1, drawY + animalH * 0.35, animalW * 0.16, animalH * 0.16, isFacingRight ? 0.3 : -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Snout & Wet Black Nose
      const snoutX = isFacingRight ? headX + animalW * 0.2 : headX - animalW * 0.05;
      ctx.fillStyle = '#854d0e';
      ctx.beginPath();
      ctx.ellipse(snoutX, drawY + animalH * 0.38, animalW * 0.08, animalH * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a'; // Nose tip
      ctx.beginPath();
      ctx.arc(isFacingRight ? snoutX + animalW * 0.06 : snoutX - animalW * 0.06, drawY + animalH * 0.38, Math.max(1.5, 2.5 * scale), 0, Math.PI * 2);
      ctx.fill();

      // Pointed Alert Ears
      ctx.fillStyle = '#713f12';
      ctx.beginPath();
      ctx.moveTo(headX + animalW * 0.05, drawY + animalH * 0.25);
      ctx.lineTo(headX + animalW * 0.08, drawY + animalH * 0.12);
      ctx.lineTo(headX + animalW * 0.14, drawY + animalH * 0.25);
      ctx.closePath();
      ctx.fill();

      // Expressive Sickle Tail (curved and wagging)
      const tailRootX = isFacingRight ? drawX + animalW * 0.15 : drawX + animalW * 0.82;
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = Math.max(1.5, 3 * scale);
      ctx.beginPath();
      ctx.moveTo(tailRootX, drawY + animalH * 0.45);
      ctx.quadraticCurveTo(
        tailRootX + (isFacingRight ? -animalW * 0.12 : animalW * 0.12),
        drawY + animalH * 0.18 + Math.sin(animal.walkCycle * 2) * 4,
        tailRootX + (isFacingRight ? -animalW * 0.04 : animalW * 0.04),
        drawY + animalH * 0.12
      );
      ctx.stroke();

    } else {
      // Photorealistic Indian Gir / Zebu Cattle (Cattle Anatomy, Thoracic Hump, Curved Horns, Dewlap)
      const cowGrad = ctx.createLinearGradient(drawX, drawY, drawX, drawY + animalH);
      cowGrad.addColorStop(0, '#b45309');
      cowGrad.addColorStop(0.5, '#92400e');
      cowGrad.addColorStop(1, '#78350f');

      // Bovine Torso Body Contour
      ctx.fillStyle = cowGrad;
      ctx.beginPath();
      ctx.roundRect(drawX + animalW * 0.14, drawY + animalH * 0.28, animalW * 0.68, animalH * 0.46, animalH * 0.16);
      ctx.fill();

      // Characteristic Indian Zebu Shoulder Hump
      const humpX = isFacingRight ? drawX + animalW * 0.62 : drawX + animalW * 0.34;
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.ellipse(humpX, drawY + animalH * 0.24, animalW * 0.14, animalH * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dewlap (Skin fold under throat)
      const dewlapX = isFacingRight ? drawX + animalW * 0.72 : drawX + animalW * 0.24;
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.ellipse(dewlapX, drawY + animalH * 0.48, animalW * 0.09, animalH * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cream/White Gir Cow Patches
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.ellipse(drawX + animalW * 0.45, drawY + animalH * 0.46, animalW * 0.14, animalH * 0.16, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // 4 Muscular Bovine Legs with Knee Joints and Hooves
      ctx.fillStyle = '#78350f';
      ctx.fillRect(drawX + animalW * 0.22 + legPhase, drawY + animalH * 0.68, animalW * 0.09, animalH * 0.32);
      ctx.fillRect(drawX + animalW * 0.38 - legPhase, drawY + animalH * 0.68, animalW * 0.09, animalH * 0.32);
      ctx.fillRect(drawX + animalW * 0.58 + legPhase, drawY + animalH * 0.68, animalW * 0.09, animalH * 0.32);
      ctx.fillRect(drawX + animalW * 0.72 - legPhase, drawY + animalH * 0.68, animalW * 0.09, animalH * 0.32);

      // Dark Cloven Hooves
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(drawX + animalW * 0.21 + legPhase, drawY + animalH * 0.95, animalW * 0.11, animalH * 0.05);
      ctx.fillRect(drawX + animalW * 0.37 - legPhase, drawY + animalH * 0.95, animalW * 0.11, animalH * 0.05);
      ctx.fillRect(drawX + animalW * 0.57 + legPhase, drawY + animalH * 0.95, animalW * 0.11, animalH * 0.05);
      ctx.fillRect(drawX + animalW * 0.71 - legPhase, drawY + animalH * 0.95, animalW * 0.11, animalH * 0.05);

      // Bovine Head with Long Muzzle
      const headX = isFacingRight ? drawX + animalW * 0.76 : drawX + animalW * 0.04;
      ctx.fillStyle = cowGrad;
      ctx.beginPath();
      ctx.ellipse(headX + animalW * 0.1, drawY + animalH * 0.36, animalW * 0.16, animalH * 0.18, isFacingRight ? 0.2 : -0.2, 0, Math.PI * 2);
      ctx.fill();

      // Dark Muzzle and Nostrils
      const muzzleX = isFacingRight ? headX + animalW * 0.18 : headX + animalW * 0.02;
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.ellipse(muzzleX, drawY + animalH * 0.42, animalW * 0.08, animalH * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();

      // Bovine Eye
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(headX + animalW * 0.1, drawY + animalH * 0.32, Math.max(1.8, 3 * scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8fafc'; // Eye corneal highlight
      ctx.beginPath();
      ctx.arc(headX + animalW * 0.1 + 1, drawY + animalH * 0.32 - 1, Math.max(0.6, 1 * scale), 0, Math.PI * 2);
      ctx.fill();

      // Drooping Ears (Gir Cattle Characteristic)
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.ellipse(headX + animalW * 0.06, drawY + animalH * 0.38, animalW * 0.06, animalH * 0.12, isFacingRight ? -0.4 : 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Graceful Curved Ivory Horns with Dark Tips
      ctx.save();
      const hornBaseX = headX + (isFacingRight ? animalW * 0.06 : animalW * 0.14);
      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = Math.max(1.8, 4 * scale);
      ctx.beginPath();
      ctx.moveTo(hornBaseX, drawY + animalH * 0.26);
      ctx.quadraticCurveTo(
        hornBaseX + (isFacingRight ? animalW * 0.15 : -animalW * 0.15),
        drawY + animalH * 0.06,
        hornBaseX + (isFacingRight ? animalW * 0.08 : -animalW * 0.08),
        drawY + animalH * 0.04
      );
      ctx.stroke();
      ctx.restore();

      // Long Tail with Bushy Hair Tip
      const tailX = isFacingRight ? drawX + animalW * 0.14 : drawX + animalW * 0.82;
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = Math.max(1.2, 2.5 * scale);
      ctx.beginPath();
      ctx.moveTo(tailX, drawY + animalH * 0.34);
      ctx.quadraticCurveTo(tailX + (isFacingRight ? -4 : 4), drawY + animalH * 0.65, tailX + (isFacingRight ? -6 : 6), drawY + animalH * 0.78);
      ctx.stroke();
      // Tail Brush Tip
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.ellipse(tailX + (isFacingRight ? -7 : 7), drawY + animalH * 0.8, animalW * 0.04, animalH * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- YOLO Bounding Box & HUD Reticle ---
    const isDetected = animal.z <= activeRange;

    if (isDetected) {
      const boxColor = (animal.type === 'small') ? '#06b6d4' :
                       (currentState === STATE.DANGER || currentState === STATE.COLLISION) ? '#ef4444' :
                       currentState === STATE.CAUTION ? '#f59e0b' : '#06b6d4';
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = Math.max(1.8, 3 * scale);
      ctx.strokeRect(drawX - 2, drawY - 2, animalW + 4, animalH + 4);

      // Corner accent brackets
      const bracketLen = Math.max(4, 10 * scale);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      // Top-left
      ctx.moveTo(drawX - 2, drawY - 2 + bracketLen); ctx.lineTo(drawX - 2, drawY - 2); ctx.lineTo(drawX - 2 + bracketLen, drawY - 2);
      // Top-right
      ctx.moveTo(drawX + animalW + 2 - bracketLen, drawY - 2); ctx.lineTo(drawX + animalW + 2, drawY - 2); ctx.lineTo(drawX + animalW + 2, drawY - 2 + bracketLen);
      // Bottom-left
      ctx.moveTo(drawX - 2, drawY + animalH + 2 - bracketLen); ctx.lineTo(drawX - 2, drawY + animalH + 2); ctx.lineTo(drawX - 2 + bracketLen, drawY + animalH + 2);
      // Bottom-right
      ctx.moveTo(drawX + animalW + 2 - bracketLen, drawY + animalH + 2); ctx.lineTo(drawX + animalW + 2, drawY + animalH + 2); ctx.lineTo(drawX + animalW + 2, drawY + animalH + 2 - bracketLen);
      ctx.stroke();

      // Center crosshair reticle
      ctx.beginPath();
      ctx.moveTo(animalScreenX - 5, groundY - animalH / 2); ctx.lineTo(animalScreenX + 5, groundY - animalH / 2);
      ctx.moveTo(animalScreenX, groundY - animalH / 2 - 5); ctx.lineTo(animalScreenX, groundY - animalH / 2 + 5);
      ctx.stroke();

      // Telemetry Label Badge
      const labelText = animal.type === 'small' ?
        `CAN (<15cm) | ROLL-OVER SAFE` :
        `${animal.type.toUpperCase()} 92% | ${animal.z.toFixed(1)}m`;
      ctx.font = `bold ${Math.max(9, Math.min(13, 14 * scale))}px monospace`;
      const textWidth = ctx.measureText(labelText).width;

      const badgeY = drawY - (scale > 0.3 ? 18 : 12);
      ctx.fillStyle = boxColor;
      ctx.fillRect(drawX - 2, badgeY, textWidth + 8, Math.max(12, 16 * scale));

      ctx.fillStyle = '#0f172a';
      ctx.fillText(labelText, drawX + 2, badgeY + Math.max(10, 13 * scale));
    }

    ctx.restore();
  }

  // --- Windshield Virtual HUD Projection ---
  function drawWindshieldHUD(ctx, width, horizonY, isProto) {
    ctx.save();

    // Top-Right HUD telemetry banner (clear of top-left pane header badge)
    ctx.fillStyle = 'rgba(6, 182, 212, 0.9)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('ADAS+ PILOT • ACTIVE', width - 16, 22);

    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
    ctx.font = '9.5px monospace';
    ctx.fillText(isProto ? 'PROTOTYPE (0.2–6.0 m)' : 'RADAR TARGET (0.2–250 m)', width - 16, 36);

    // Dynamic HUD Banner Alert in Center Top (floating glass pill, lowered to avoid pane header)
    let alertText = null;
    let pillColor = null;
    let textColor = null;

    if (currentState === STATE.DANGER) {
      alertText = '🛑 BRAKE NOW: COLLISION THREAT IMMINENT';
      pillColor = 'rgba(239, 68, 68, 0.25)';
      textColor = '#fecaca';
    } else if (currentState === STATE.CAUTION) {
      alertText = '⚠️ CAUTION: HAZARD IN PATH';
      pillColor = 'rgba(245, 158, 11, 0.25)';
      textColor = '#fef3c7';
    } else if (currentState === STATE.SAFE_STOP || currentState === 'SAFE AEB STOP') {
      alertText = '🛡️ SAFE STOP COMPLETED';
      pillColor = 'rgba(16, 185, 129, 0.25)';
      textColor = '#a7f3d0';
    } else if (animal.type === 'small' && animal.z <= (isProto ? PROTOTYPE_RANGE_M : PLANNED_RANGE_M)) {
      alertText = '🍃 GROUND FILTER: SAFE ROLL-OVER (<15cm)';
      pillColor = 'rgba(6, 182, 212, 0.25)';
      textColor = '#cffafe';
    }

    if (alertText) {
      ctx.font = 'bold 11px monospace';
      const tw = ctx.measureText(alertText).width;
      const pillW = tw + 22;
      const pillH = 26;
      const pillX = (width - pillW) / 2;
      const pillY = 48; // Lowered to avoid top-left badge

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 6);
      ctx.fill();

      ctx.fillStyle = pillColor;
      ctx.fill();

      ctx.strokeStyle = textColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.fillText(alertText, width / 2, pillY + 17);
    }

    ctx.restore();
  }

  // --- Cockpit Dashboard, Steering Wheel & Cluster ---
  function drawCockpitDashboard(ctx, width, height, isProto) {
    ctx.save();

    // Bottom Dashboard Cowl
    ctx.fillStyle = '#080d1a';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.77);
    ctx.bezierCurveTo(width * 0.3, height * 0.73, width * 0.7, height * 0.73, width, height * 0.77);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    // Subtle Cowl Border
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw Modern ADAS Sports Steering Wheel at Bottom Center
    const wheelCenterX = width / 2;
    const wheelCenterY = height + 10;
    const wheelRadius = Math.min(width * 0.22, 110);

    ctx.save();
    // Steering Wheel Outer Rim
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(wheelCenterX, wheelCenterY, wheelRadius, -Math.PI * 0.88, -Math.PI * 0.12);
    ctx.stroke();

    // Inner Rim Highlight
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(wheelCenterX, wheelCenterY, wheelRadius + 4, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();

    // Center Hub Badge
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(wheelCenterX, wheelCenterY - wheelRadius * 0.45, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Autopilot / ADAS Active Icon in Steering Hub
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⛯', wheelCenterX, wheelCenterY - wheelRadius * 0.45 + 4);
    ctx.restore();

    // Digital Instrument Cluster in Center
    const clusterW = Math.min(width * 0.52, 290);
    const clusterH = 48;
    const clusterX = (width - clusterW) / 2;
    const clusterY = height - clusterH - 8;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = (currentState === STATE.DANGER || currentState === STATE.COLLISION) ? '#ef4444' :
                      currentState === STATE.CAUTION ? '#f59e0b' :
                      (currentState === STATE.SAFE_STOP || currentState === 'SAFE AEB STOP') ? '#10b981' : '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(clusterX, clusterY, clusterW, clusterH, 8);
    ctx.fill();
    ctx.stroke();

    // Speedometer Output
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SPEED', clusterX + 14, clusterY + 16);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`${Math.round(currentSpeedKmh)} km/h`, clusterX + 14, clusterY + 36);

    // ADAS Range Zone Tag
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.fillText(isProto ? 'PROTOTYPE (0.2–6m)' : 'PLANNED (0.2–250m)', clusterX + clusterW * 0.42, clusterY + 16);

    // Status Badge
    const stateColor = (currentState === STATE.DANGER || currentState === STATE.COLLISION) ? '#ef4444' :
                       currentState === STATE.CAUTION ? '#f59e0b' :
                       (currentState === STATE.SAFE_STOP || currentState === 'SAFE AEB STOP') ? '#10b981' :
                       currentState === STATE.DETECTED ? '#06b6d4' : '#10b981';
    ctx.fillStyle = stateColor;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(currentState, clusterX + clusterW * 0.42, clusterY + 36);

    ctx.restore();
  }

  // --- Animation Frame Loop ---
  function loop(now) {
    const dt = Math.min(0.08, (now - lastTimestamp) / 1000.0);
    lastTimestamp = now;

    updateSimulation(dt);
    drawTopView();
    drawDriverView();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // --- Event Listeners ---
  if (btnPrototypeMode) {
    btnPrototypeMode.addEventListener('click', () => {
      initAudio();
      applyModeSettings(MODE.PROTOTYPE);
    });
  }

  if (btnPlannedMode) {
    btnPlannedMode.addEventListener('click', () => {
      initAudio();
      applyModeSettings(MODE.PLANNED);
    });
  }

  // Ruler Zones Click to Toggle
  if (rulerZoneProto) {
    rulerZoneProto.addEventListener('click', () => {
      initAudio();
      applyModeSettings(MODE.PROTOTYPE);
    });
  }

  if (rulerZonePlanned) {
    rulerZonePlanned.addEventListener('click', () => {
      initAudio();
      applyModeSettings(MODE.PLANNED);
    });
  }

  // Scenario Buttons Listeners
  Object.keys(scenarioBtns).forEach(key => {
    const btn = scenarioBtns[key];
    if (btn) {
      btn.addEventListener('click', () => {
        initAudio();
        selectScenario(key);
      });
    }
  });

  // Motion Mode Buttons Listeners
  if (btnMotionMoving) {
    btnMotionMoving.addEventListener('click', () => {
      initAudio();
      setMotionMode(false);
    });
  }

  if (btnMotionSteady) {
    btnMotionSteady.addEventListener('click', () => {
      initAudio();
      setMotionMode(true);
    });
  }

  // Alert State Demo Buttons Listeners
  if (btnDemoAuto) {
    btnDemoAuto.addEventListener('click', () => {
      initAudio();
      setDemoState('auto');
    });
  }

  if (btnDemoCaution) {
    btnDemoCaution.addEventListener('click', () => {
      initAudio();
      setDemoState('caution');
    });
  }

  if (btnDemoDanger) {
    btnDemoDanger.addEventListener('click', () => {
      initAudio();
      setDemoState('danger');
    });
  }

  if (btnDemoSafeStop) {
    btnDemoSafeStop.addEventListener('click', () => {
      initAudio();
      setDemoState('safestop');
    });
  }

  if (btnToggleSound) {
    btnToggleSound.addEventListener('click', () => {
      initAudio();
      soundEnabled = !soundEnabled;
      if (soundIcon) {
        soundIcon.textContent = soundEnabled ? '🔊 Sound ON' : '🔇 Muted';
      }
      btnToggleSound.classList.toggle('active', soundEnabled);
    });
  }

  if (btnToggleNight) {
    btnToggleNight.addEventListener('click', () => {
      initAudio();
      isNightMode = !isNightMode;
      btnToggleNight.textContent = isNightMode ? '☀️ Day View' : '🌙 Night + IR';
      btnToggleNight.classList.toggle('active', isNightMode);
    });
  }

  if (btnPlayPause) {
    btnPlayPause.addEventListener('click', () => {
      initAudio();
      isRunning = !isRunning;
      btnPlayPause.textContent = isRunning ? '⏸ Pause' : '▶ Play';
      btnPlayPause.classList.toggle('active', isRunning);
    });
  }

  if (btnResetSim) {
    btnResetSim.addEventListener('click', () => {
      initAudio();
      resetScoreboard();
      setDemoState('auto');
      spawnAnimal(currentScenario);
    });
  }

  // Auto-init audio on first canvas click
  [topCanvas, driverCanvas].forEach(c => {
    c.addEventListener('click', () => initAudio(), { once: true });
  });

  window.addEventListener('resize', () => {
    drawTopView();
    drawDriverView();
  });

  // Start with Prototype Mode
  applyModeSettings(MODE.PROTOTYPE);

})();
