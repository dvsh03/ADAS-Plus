/**
 * ADAS-Plus Interactive Vehicle Simulation Engine
 * Synchronized Dual Viewports: Top-Down Aerial View & Driver Cockpit Windshield View
 * Mode-Specific Range Awareness: Prototype (0.2-6m) vs Planned (0.2-250m)
 * Dynamic Rescaling, Realistic Physics, Audio Synthesis & Scoreboard Tracking
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

  // Physics Parameters
  const PROTOTYPE_REACTION_SEC = 0.8;  // Driver perception-reaction delay
  const PROTOTYPE_BRAKE_MS2 = 6.0;     // Human emergency braking deceleration
  const PLANNED_REACTION_SEC = 0.05;   // AEB electronic trigger latency (near-zero)
  const PLANNED_BRAKE_MS2 = 7.0;       // Automotive AEB hydraulic deceleration

  // Trajectory Entry Sides
  const SIDES = ['left', 'right', 'center'];

  // Simulation State Enum
  const STATE = {
    CLEAR: 'CLEAR',
    DETECTED: 'DETECTED',
    CAUTION: 'CAUTION',
    DANGER: 'DANGER',
    OUTCOME: 'OUTCOME'
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
  const btnPlayPause = document.getElementById('btnPlayPause');
  const btnResetSim = document.getElementById('btnResetSim');
  const speedSlider = document.getElementById('speedSlider');
  const speedSliderVal = document.getElementById('speedSliderVal');
  const simRangeCaption = document.getElementById('simRangeCaption');

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

  // --- Simulation State Variables ---
  let isRunning = true;
  let isNightMode = false;
  let currentMode = MODE.PROTOTYPE;
  let currentState = STATE.CLEAR;

  // Car State
  let targetSpeedKmh = 10.0; // Cruise speed set by slider or mode
  let currentSpeedKmh = 10.0; // Real-time instantaneous speed (decelerates to 0 during braking)
  let carSpeedMs = targetSpeedKmh / 3.6;
  let carDecelerating = false;
  let alertTriggerTime = null;
  let roadScrollOffset = 0;

  // Scoreboard
  let score = {
    safeStops: 0,
    cleared: 0,
    collisions: 0
  };

  // Animal Obstacle State
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

    if (mode === MODE.PROTOTYPE) {
      if (speedSlider) {
        speedSlider.min = '5';
        speedSlider.max = '25';
        speedSlider.value = '10';
      }
      targetSpeedKmh = 10.0;
      if (speedSliderVal) speedSliderVal.textContent = '10 km/h';
      if (simRangeCaption) {
        simRangeCaption.textContent = 'Detection range: 0.2-6 m (prototype)';
      }
    } else {
      if (speedSlider) {
        speedSlider.min = '20';
        speedSlider.max = '130';
        speedSlider.value = '80';
      }
      targetSpeedKmh = 80.0;
      if (speedSliderVal) speedSliderVal.textContent = '80 km/h';
      if (simRangeCaption) {
        simRangeCaption.textContent = 'Target range: 0.2-250 m (planned, not built)';
      }
    }

    currentSpeedKmh = targetSpeedKmh;
    carSpeedMs = currentSpeedKmh / 3.6;
    spawnAnimal();
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

  // --- Spawn Animal Obstacle ---
  function spawnAnimal() {
    const side = SIDES[Math.floor(Math.random() * SIDES.length)];
    animal.side = side;
    animal.type = Math.random() > 0.35 ? 'cow' : 'dog';
    animal.walkCycle = 0;
    animal.resolved = false;
    animal.crossingActive = true;
    outcomeTimer = 0;

    const isProto = currentMode === MODE.PROTOTYPE;
    const activeRange = isProto ? PROTOTYPE_RANGE_M : PLANNED_RANGE_M;

    // Spawn distance scaled to range
    if (isProto) {
      animal.z = 5.2 + Math.random() * 1.6; // Starts around 5.5 to 6.8 m
    } else {
      animal.z = 180.0 + Math.random() * 50.0; // Starts around 180 to 230 m
    }

    if (side === 'left') {
      animal.x = -ROAD_WIDTH_METERS / 2 - (isProto ? 1.5 : 2.5);
      animal.vx = isProto ? (0.7 + Math.random() * 0.4) : (1.4 + Math.random() * 0.6);
    } else if (side === 'right') {
      animal.x = ROAD_WIDTH_METERS / 2 + (isProto ? 1.5 : 2.5);
      animal.vx = isProto ? -(0.7 + Math.random() * 0.4) : -(1.4 + Math.random() * 0.6);
    } else {
      animal.x = (Math.random() - 0.5) * 1.2;
      animal.vx = (Math.random() - 0.5) * 0.25;
    }

    // Always restore cruising speed from the UI slider setting
    const sliderVal = speedSlider ? parseFloat(speedSlider.value) : (isProto ? 10.0 : 80.0);
    targetSpeedKmh = Math.max(5.0, sliderVal);
    currentSpeedKmh = targetSpeedKmh;
    carSpeedMs = currentSpeedKmh / 3.6;
    carDecelerating = false;
    alertTriggerTime = null;
    currentState = STATE.CLEAR;
  }

  applyModeSettings(MODE.PROTOTYPE);

  // --- Simulation Physics & State Machine ---
  let lastTimestamp = performance.now();

  function updateSimulation(dt) {
    if (!isRunning) return;

    const isProto = currentMode === MODE.PROTOTYPE;
    const activeRange = isProto ? PROTOTYPE_RANGE_M : PLANNED_RANGE_M;
    const reactionTime = isProto ? PROTOTYPE_REACTION_SEC : PLANNED_REACTION_SEC;
    const brakeDecel = isProto ? PROTOTYPE_BRAKE_MS2 : PLANNED_BRAKE_MS2;

    // Road scroll proportional to car speed
    roadScrollOffset = (roadScrollOffset + carSpeedMs * dt * (isProto ? 80 : 25)) % 1000;

    // Animal walking animation and lateral displacement
    animal.walkCycle += dt * (isProto ? 3.5 : 4.5);
    if (animal.crossingActive) {
      animal.x += animal.vx * dt;
    }

    // Relative longitudinal approach
    animal.z -= carSpeedMs * dt;

    // Stopping distance formula: d_stopping = (v * t_reaction) + (v^2 / (2 * a))
    const reactionDist = carSpeedMs * reactionTime;
    const brakingDist = (carSpeedMs * carSpeedMs) / (2 * brakeDecel);
    const totalStoppingDist = reactionDist + brakingDist;

    // Warning Time: range / speed
    const warningTimeSec = carSpeedMs > 0.1 ? (activeRange / carSpeedMs) : 99.0;

    // Hazard geometry: in vehicle path or entering
    const inPath = Math.abs(animal.x) < 1.7;
    const headingIntoPath = (animal.side === 'left' && animal.vx > 0 && animal.x < 1.5) ||
                            (animal.side === 'right' && animal.vx < 0 && animal.x > -1.5);
    const isThreat = inPath || headingIntoPath;

    // --- Range Gated Detection Logic ---
    // If animal is outside mode detection range, it is NOT detected!
    const isWithinRange = animal.z <= activeRange;

    if (!animal.resolved) {
      if (animal.z <= 0.6) {
        // Animal reached vehicle bumper level
        animal.resolved = true;
        if (Math.abs(animal.x) < 1.3) {
          score.collisions += 1;
          currentState = STATE.DANGER;
          const msg = isProto ?
            'Collision! Prototype detected obstacle at 5-6 m, but human reaction time exceeded stopping distance at this speed.' :
            'Collision! Severe obstacle entry within stopping distance.';
          setOutcome('COLLISION', msg);
        } else {
          score.cleared += 1;
          setOutcome('PASSED', 'Animal crossed road safely outside vehicle corridor.');
        }
        updateScoreboardUI();
      } else if (carDecelerating && carSpeedMs <= 0.15) {
        // Vehicle stopped safely before animal in response to alert
        carSpeedMs = 0;
        currentSpeedKmh = 0;
        carDecelerating = false;
        animal.resolved = true;
        score.safeStops += 1;
        const distMargin = Math.max(0, animal.z).toFixed(1);
        const msg = isProto ?
          `Safe human stop: Driver alerted by prototype buzzer and halted ${distMargin} m before animal.` :
          `Safe AEB stop: Automatic emergency braking halted car ${distMargin} m before animal (Planned concept).`;
        setOutcome('SAFE_STOP', msg);
        updateScoreboardUI();
      } else if (animal.crossingActive && ((animal.vx > 0 && animal.x > ROAD_WIDTH_METERS / 2 + 1.2) || (animal.vx < 0 && animal.x < -ROAD_WIDTH_METERS / 2 - 1.2))) {
        // Animal walked completely clear of roadway
        animal.resolved = true;
        score.cleared += 1;
        setOutcome('PASSED', 'Animal crossed road safely outside vehicle corridor.');
        updateScoreboardUI();
      } else if (isWithinRange && isThreat) {
        // Inside detection range and on collision course
        if (animal.z < totalStoppingDist * 1.1 || animal.z < activeRange * 0.4) {
          currentState = STATE.DANGER;
          if (!alertTriggerTime) alertTriggerTime = performance.now();
        } else {
          currentState = STATE.CAUTION;
          if (!alertTriggerTime) alertTriggerTime = performance.now();
        }
      } else if (isWithinRange) {
        currentState = STATE.DETECTED;
      } else {
        // Beyond detection range: animal visible on screen, but system is CLEAR (no box, no warning)
        currentState = STATE.CLEAR;
      }
    }

    // --- Braking Response Logic ---
    if (currentMode === MODE.PLANNED) {
      // Planned Mode: Automatic Emergency Braking (near-zero delay ~0.05s)
      if ((currentState === STATE.DANGER || currentState === STATE.CAUTION) && !carDecelerating) {
        carDecelerating = true;
      }
    } else {
      // Prototype Mode: Human driver brakes after ~0.8s reaction latency
      if ((currentState === STATE.DANGER || currentState === STATE.CAUTION) && alertTriggerTime) {
        const timeSinceAlertSec = (performance.now() - alertTriggerTime) / 1000.0;
        if (timeSinceAlertSec >= PROTOTYPE_REACTION_SEC) {
          carDecelerating = true;
        }
      }
    }

    // Apply deceleration
    if (carDecelerating) {
      carSpeedMs = Math.max(0, carSpeedMs - brakeDecel * dt);
      currentSpeedKmh = carSpeedMs * 3.6;
    }

    // Outcome cycle delay
    if (animal.resolved) {
      outcomeTimer += dt;
      if (outcomeTimer >= 2.2) {
        outcomeTimer = 0;
        spawnAnimal();
      }
    }

    updateHUD(totalStoppingDist, warningTimeSec);
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
    }

    if (simOutcomeText) {
      simOutcomeText.innerHTML = `<span style="${textClass}">${icon} ${message}</span>`;
    }

    if (simOutcomeNote) {
      if (currentMode === MODE.PROTOTYPE) {
        simOutcomeNote.textContent = 'Prototype Mode (0.2-6m range): Alerts driver only via buzzer. Human reaction latency (0.8s) governs braking.';
      } else {
        simOutcomeNote.textContent = 'Planned Concept (0.2-250m target): Automatic braking + rapid seatbelt-style chime (Concept only, not built yet).';
      }
    }

    if (simLiveAnnouncer) {
      simLiveAnnouncer.textContent = `Simulation event: ${message}`;
    }
  }

  // --- Update HUD DOM ---
  function updateHUD(stoppingDistMeters, warningTimeSec) {
    if (hudStatePill) {
      hudStatePill.className = `hud-state-pill state-${currentState.toLowerCase()}`;
      hudStatePill.textContent = currentState;
    }

    const isProto = currentMode === MODE.PROTOTYPE;
    const activeRange = isProto ? PROTOTYPE_RANGE_M : PLANNED_RANGE_M;

    if (hudDistanceVal) {
      // Only display distance when within active detection range
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
        if (isProto) {
          hudBuzzerVal.textContent = 'Continuous Alarm';
          hudBuzzerVal.style.color = 'var(--accent-rose)';
        } else {
          hudBuzzerVal.textContent = 'Rapid Seatbelt-Style Chime';
          hudBuzzerVal.style.color = 'var(--accent-rose)';
        }
      } else if (currentState === STATE.CAUTION) {
        if (isProto) {
          hudBuzzerVal.textContent = 'Pulsed Chime';
          hudBuzzerVal.style.color = 'var(--accent-amber)';
        } else {
          hudBuzzerVal.textContent = 'Seatbelt Warning Chime';
          hudBuzzerVal.style.color = 'var(--accent-amber)';
        }
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
  // RENDER 1: TOP-DOWN AERIAL ROAD VIEW (Rescaled per mode)
  // ============================================================
  function drawTopView() {
    const { width, height } = resizeCanvas(topCanvas, topCtx);
    const ctx = topCtx;
    const isProto = currentMode === MODE.PROTOTYPE;
    const activeRange = isProto ? PROTOTYPE_RANGE_M : PLANNED_RANGE_M;

    // Background verge
    ctx.fillStyle = isNightMode ? '#0a1413' : '#1e3328';
    ctx.fillRect(0, 0, width, height);

    // Roadway dimensions
    const roadWidthPx = Math.min(width * 0.72, 230);
    const roadLeft = (width - roadWidthPx) / 2;
    const roadRight = roadLeft + roadWidthPx;
    const roadCenter = width / 2;

    // Asphalt
    ctx.fillStyle = isNightMode ? '#10141d' : '#1e2430';
    ctx.fillRect(roadLeft, 0, roadWidthPx, height);

    // Curbs
    ctx.fillStyle = isNightMode ? '#283243' : '#475569';
    ctx.fillRect(roadLeft - 3, 0, 3, height);
    ctx.fillRect(roadRight, 0, 3, height);

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

    // Scaling: meters to pixels rescaled for mode
    // In Prototype mode: display up to ~9m ahead of bumper
    // In Planned mode: display up to ~275m ahead of bumper
    const maxVisibleAheadMeters = isProto ? 8.5 : 275.0;
    const pxPerMeter = (carY - 15) / maxVisibleAheadMeters;

    // Detection Range Zone Boundary Arc
    const detectionArcRadiusPx = activeRange * pxPerMeter;
    ctx.save();
    ctx.strokeStyle = isProto ? 'rgba(16, 185, 129, 0.45)' : 'rgba(59, 130, 246, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(roadCenter, carY, Math.min(detectionArcRadiusPx, height * 0.85), -Math.PI * 0.85, -Math.PI * 0.15);
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
    drawTopCar(ctx, carX, carY, carWidthPx, carHeightPx);

    // Draw Animal
    const animalY = carY - (animal.z * pxPerMeter);
    const animalXPx = roadCenter + ((animal.x / (ROAD_WIDTH_METERS / 2)) * (roadWidthPx / 2));

    const isDetected = animal.z <= activeRange && currentState !== STATE.CLEAR;

    if (animalY > -30 && animalY < height + 30) {
      drawTopAnimal(ctx, animalXPx, animalY, animal.type, animal.walkCycle, animal.vx, isDetected);
    }
  }

  function drawTopCar(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.roundRect(x - 2, y + 2, w + 4, h + 4, 6);
    ctx.fill();

    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + 3, y + 6, w - 6, h * 0.22);
    ctx.fillRect(x + 4, y + h - 12, w - 8, h * 0.16);

    ctx.fillStyle = '#fef08a';
    ctx.fillRect(x + 2, y - 1, 4, 2);
    ctx.fillRect(x + w - 6, y - 1, 4, 2);

    ctx.restore();
  }

  function drawTopAnimal(ctx, x, y, type, walkCycle, vx, isDetected) {
    ctx.save();
    const legOffset = Math.sin(walkCycle) * 3;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = type === 'cow' ? '#b45309' : '#78716c';
    ctx.beginPath();
    ctx.roundRect(x - 9, y - 5, 18, 10, 3);
    ctx.fill();

    // Animated legs
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x - 7 + legOffset, y - 7, 3, 3);
    ctx.fillRect(x + 4 - legOffset, y - 7, 3, 3);
    ctx.fillRect(x - 7 - legOffset, y + 4, 3, 3);
    ctx.fillRect(x + 4 + legOffset, y + 4, 3, 3);

    // Head
    const headX = vx >= 0 ? x + 10 : x - 10;
    ctx.beginPath();
    ctx.arc(headX, y, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Bounding Box only if detected within range
    if (isDetected) {
      const boxColor = currentState === STATE.DANGER ? '#ef4444' :
                       currentState === STATE.CAUTION ? '#f59e0b' : '#06b6d4';
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 13, y - 9, 26, 18);
    }
    ctx.restore();
  }

  // ============================================================
  // RENDER 2: DRIVER WINDSHIELD PERSPECTIVE (Rescaled per mode)
  // ============================================================
  function drawDriverView() {
    const { width, height } = resizeCanvas(driverCanvas, driverCtx);
    const ctx = driverCtx;
    const isProto = currentMode === MODE.PROTOTYPE;
    const activeRange = isProto ? PROTOTYPE_RANGE_M : PLANNED_RANGE_M;

    const horizonY = height * 0.44;
    const vpX = width / 2;

    // Sky
    if (isNightMode) {
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, '#070b14');
      skyGrad.addColorStop(1, '#111827');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, horizonY);
    } else {
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, '#60a5fa');
      skyGrad.addColorStop(0.7, '#93c5fd');
      skyGrad.addColorStop(1, '#dbeafe');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, horizonY);
    }

    // Horizon hills
    ctx.fillStyle = isNightMode ? '#0f172a' : '#22543d';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.quadraticCurveTo(width * 0.25, horizonY - 14, width * 0.5, horizonY - 2);
    ctx.quadraticCurveTo(width * 0.75, horizonY - 20, width, horizonY);
    ctx.lineTo(width, horizonY);
    ctx.lineTo(0, horizonY);
    ctx.fill();

    // Roadside ground
    ctx.fillStyle = isNightMode ? '#091312' : '#1e3a2b';
    ctx.fillRect(0, horizonY, width, height - horizonY);

    // Perspective Road Trapezoid
    const roadTopWidth = 28;
    const roadBottomWidth = width * 0.94;
    const roadBottomY = height * 0.78;

    ctx.fillStyle = isNightMode ? '#0f172a' : '#1e293b';
    ctx.beginPath();
    ctx.moveTo(vpX - roadTopWidth / 2, horizonY);
    ctx.lineTo(vpX + roadTopWidth / 2, horizonY);
    ctx.lineTo(vpX + roadBottomWidth / 2, roadBottomY);
    ctx.lineTo(vpX - roadBottomWidth / 2, roadBottomY);
    ctx.closePath();
    ctx.fill();

    // Road Edge Stripes
    ctx.strokeStyle = isNightMode ? '#334155' : '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vpX - roadTopWidth / 2, horizonY);
    ctx.lineTo(vpX - roadBottomWidth / 2, roadBottomY);
    ctx.moveTo(vpX + roadTopWidth / 2, horizonY);
    ctx.lineTo(vpX + roadBottomWidth / 2, roadBottomY);
    ctx.stroke();

    // Center Dashed Markings
    drawDriverCenterLines(ctx, vpX, horizonY, roadBottomY);

    // Night Mode Headlight Beam on Road
    if (isNightMode) {
      const beamGrad = ctx.createRadialGradient(vpX, roadBottomY, 20, vpX, horizonY + 20, width * 0.55);
      beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.35)');
      beamGrad.addColorStop(0.4, 'rgba(59, 130, 246, 0.18)');
      beamGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(vpX - 18, horizonY + 20);
      ctx.lineTo(vpX + 18, horizonY + 20);
      ctx.lineTo(vpX + roadBottomWidth * 0.44, roadBottomY);
      ctx.lineTo(vpX - roadBottomWidth * 0.44, roadBottomY);
      ctx.closePath();
      ctx.fill();
    }

    // Animal in Driver Perspective
    drawDriverPerspectiveAnimal(ctx, vpX, horizonY, roadBottomY, roadBottomWidth, activeRange, isProto);

    // Dashboard Cluster
    drawDriverDashboard(ctx, width, height, roadBottomY, isProto);
  }

  function drawDriverCenterLines(ctx, vpX, horizonY, roadBottomY) {
    const segments = 12;
    const offsetNorm = (roadScrollOffset % 100) / 100.0;
    ctx.strokeStyle = isNightMode ? '#94a3b8' : '#f8fafc';

    for (let i = 0; i < segments; i++) {
      const t1 = Math.pow((i + offsetNorm) / segments, 2.2);
      const t2 = Math.pow((i + 0.45 + offsetNorm) / segments, 2.2);
      if (t1 > 1.0 || t2 > 1.0) continue;

      const y1 = horizonY + (roadBottomY - horizonY) * t1;
      const y2 = horizonY + (roadBottomY - horizonY) * t2;
      ctx.lineWidth = 1 + t1 * 6;
      ctx.beginPath();
      ctx.moveTo(vpX, y1);
      ctx.lineTo(vpX, y2);
      ctx.stroke();
    }
  }

  function drawDriverPerspectiveAnimal(ctx, vpX, horizonY, roadBottomY, roadBottomWidth, activeRange, isProto) {
    const dist = Math.max(0.4, animal.z);

    // Perspective depth calculation normalized to mode range
    // Ensures natural scale whether at 0.2-6m (prototype) or 0.2-250m (planned)
    const normDist = isProto ? (dist / 8.5) : (dist / 275.0);
    const depthT = Math.max(0.04, Math.min(1.0, 1.0 - normDist));
    const scale = Math.pow(depthT, 1.4);

    const groundY = horizonY + (roadBottomY - horizonY) * scale;
    const lateralSpanAtGround = roadBottomWidth * scale;
    const animalScreenX = vpX + (animal.x / (ROAD_WIDTH_METERS / 2)) * (lateralSpanAtGround / 2);

    const animalH = Math.max(12, 120 * scale);
    const animalW = animalH * 1.35;
    const drawX = animalScreenX - animalW / 2;
    const drawY = groundY - animalH;

    if (dist > (activeRange * 1.25) && isProto) return; // Beyond prototype visual horizon

    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(animalScreenX, groundY - 2, animalW * 0.45, animalH * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Animal body
    ctx.fillStyle = isNightMode ? '#9a5312' : '#b45309';
    ctx.beginPath();
    ctx.roundRect(drawX + animalW * 0.15, drawY + animalH * 0.25, animalW * 0.65, animalH * 0.5, animalH * 0.15);
    ctx.fill();

    // Legs with walk phase
    const legPhase = Math.sin(animal.walkCycle) * (animalH * 0.12);
    ctx.fillStyle = isNightMode ? '#78350f' : '#92400e';
    ctx.fillRect(drawX + animalW * 0.22 + legPhase, drawY + animalH * 0.7, animalW * 0.08, animalH * 0.32);
    ctx.fillRect(drawX + animalW * 0.38 - legPhase, drawY + animalH * 0.7, animalW * 0.08, animalH * 0.32);
    ctx.fillRect(drawX + animalW * 0.58 + legPhase, drawY + animalH * 0.7, animalW * 0.08, animalH * 0.32);
    ctx.fillRect(drawX + animalW * 0.72 - legPhase, drawY + animalH * 0.7, animalW * 0.08, animalH * 0.32);

    // Head
    const isFacingRight = animal.vx >= 0;
    const headX = isFacingRight ? drawX + animalW * 0.75 : drawX + animalW * 0.05;
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(headX + animalW * 0.1, drawY + animalH * 0.35, animalH * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Horns
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(headX + (isFacingRight ? 4 : -4), drawY + animalH * 0.12, animalW * 0.06, animalH * 0.18);

    // --- YOLO Bounding Box & Label ---
    // Only drawn when within active mode detection range!
    const isWithinRange = animal.z <= activeRange;
    if (isWithinRange && currentState !== STATE.CLEAR) {
      const boxColor = currentState === STATE.DANGER ? '#ef4444' :
                       currentState === STATE.CAUTION ? '#f59e0b' : '#06b6d4';

      ctx.strokeStyle = boxColor;
      ctx.lineWidth = Math.max(1.5, 2.5 * scale);
      ctx.strokeRect(drawX - 4, drawY - 4, animalW + 8, animalH + 8);

      // Detection Tag Header
      const tagText = `${animal.type} 92% | ${animal.z.toFixed(1)}m`;
      ctx.font = `bold ${Math.max(10, Math.floor(13 * scale))}px monospace`;
      const textMetrics = ctx.measureText(tagText);

      ctx.fillStyle = boxColor;
      ctx.fillRect(drawX - 4, drawY - 18, textMetrics.width + 10, 16);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(tagText, drawX + 1, drawY - 6);
    }

    ctx.restore();
  }

  function drawDriverDashboard(ctx, width, height, roadBottomY, isProto) {
    const dashY = roadBottomY;
    const dashHeight = height - dashY;

    ctx.save();

    // Dashboard Hood Silhouette
    ctx.fillStyle = isNightMode ? '#090d16' : '#0f172a';
    ctx.beginPath();
    ctx.moveTo(0, dashY);
    ctx.lineTo(width, dashY);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = isNightMode ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, dashY);
    ctx.lineTo(width, dashY);
    ctx.stroke();

    // Steering Wheel Top Arc
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(width / 2, height + 40, width * 0.28, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Central Cluster Display
    const clusterW = Math.min(230, width * 0.46);
    const clusterH = dashHeight * 0.72;
    const clusterX = (width - clusterW) / 2;
    const clusterY = dashY + 10;

    ctx.fillStyle = '#050811';
    ctx.beginPath();
    ctx.roundRect(clusterX, clusterY, clusterW, clusterH, 6);
    ctx.fill();

    const screenBorder = currentState === STATE.DANGER ? '#ef4444' :
                         currentState === STATE.CAUTION ? '#f59e0b' : '#1e293b';
    ctx.strokeStyle = screenBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Speed Digital Readout
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText('SPEED', clusterX + 12, clusterY + 18);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`${Math.round(currentSpeedKmh)} km/h`, clusterX + 12, clusterY + 38);

    // ADAS+ Zone
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText(isProto ? 'PROTOTYPE (0.2-6m)' : 'PLANNED (0.2-250m)', clusterX + clusterW * 0.48, clusterY + 18);

    const stateColor = currentState === STATE.DANGER ? '#ef4444' :
                       currentState === STATE.CAUTION ? '#f59e0b' :
                       currentState === STATE.DETECTED ? '#06b6d4' : '#10b981';
    ctx.fillStyle = stateColor;
    ctx.font = 'bold 15px monospace';
    ctx.fillText(currentState, clusterX + clusterW * 0.48, clusterY + 38);

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
      btnPrototypeMode.classList.add('active');
      btnPlannedMode.classList.remove('active');
      applyModeSettings(MODE.PROTOTYPE);
    });
  }

  if (btnPlannedMode) {
    btnPlannedMode.addEventListener('click', () => {
      btnPlannedMode.classList.add('active');
      btnPrototypeMode.classList.remove('active');
      applyModeSettings(MODE.PLANNED);
    });
  }

  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      targetSpeedKmh = parseFloat(e.target.value);
      currentSpeedKmh = targetSpeedKmh;
      carSpeedMs = currentSpeedKmh / 3.6;
      carDecelerating = false;
      alertTriggerTime = null;
      if (speedSliderVal) speedSliderVal.textContent = `${Math.round(targetSpeedKmh)} km/h`;
      resetScoreboard();
    });
  }

  if (btnToggleNight) {
    btnToggleNight.addEventListener('click', () => {
      isNightMode = !isNightMode;
      btnToggleNight.textContent = isNightMode ? '☀️ Day View' : '🌙 Night + IR';
      btnToggleNight.classList.toggle('active', isNightMode);
    });
  }

  if (btnPlayPause) {
    btnPlayPause.addEventListener('click', () => {
      isRunning = !isRunning;
      btnPlayPause.textContent = isRunning ? '⏸ Pause' : '▶ Play';
      btnPlayPause.classList.toggle('active', isRunning);
    });
  }

  if (btnResetSim) {
    btnResetSim.addEventListener('click', () => {
      resetScoreboard();
      spawnAnimal();
    });
  }

  window.addEventListener('resize', () => {
    drawTopView();
    drawDriverView();
  });

})();
