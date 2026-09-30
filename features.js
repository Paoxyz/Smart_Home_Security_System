(() => {
  // ==========================================
  // Configuration & State Defaults
  // ==========================================
  const STORAGE_KEY = 'smarthome.v2';
  const $$ = (selector) => document.querySelectorAll(selector);

  const devices = {
    lights: [
      { name: 'Living room', on: true, brightness: 80 },
      { name: 'Kitchen', on: false, brightness: 60 },
      { name: 'Backyard', on: true, brightness: 50 },
      { name: 'Garage', on: false, brightness: 100 },
    ],
    temp: 24,
    ac: true,
    garage: false,
  };

  const security = {
    arm: 'off',
    pin: '1234',
  };

  const MODES = {
    off: 'Disarmed',
    home: 'Home',
    away: 'Away',
    night: 'Night',
  };

  const palette = ['#d98c5f', '#5f7fd9', '#2b2f33', '#d95f7a', '#3fa37c', '#8a63d2'];

  const syncMemberRoleDesc = (member) => {
    const doorAccess = member.a.doors ? 'all doors' : 'no doors';
    const camAccess = member.a.cams ? ', cameras' : '';
    member.r = `${member.role} · ${doorAccess}${camAccess}`;
  };
  members.forEach(syncMemberRoleDesc);

  // Load Persisted Storage
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved) {
      if (saved.cams) saved.cams.forEach((c, i) => Object.assign(cams[i], c));
      if (saved.locks) saved.locks.forEach((l, i) => Object.assign(locks[i], l));
      if (saved.members) members.splice(0, members.length, ...saved.members);
      if (saved.log) Object.assign(log, saved.log);
      if (saved.dev) Object.assign(devices, saved.dev);
      if (saved.S) Object.assign(security, saved.S);
    }
  } catch (err) {
    console.warn('Failed to load state from localStorage', err);
  }

  window.save = () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ cams, locks, members, log, dev: devices, S: security })
      );
    } catch (err) {
      console.warn('Failed to save state to localStorage', err);
    }
  };

  // ==========================================
  // Layout & DOM View Construction
  // ==========================================
  const VIEWS = [
    ['dash', 'Dashboard'],
    ['cams', 'Cameras'],
    ['sec', 'Security'],
    ['dev', 'Devices'],
    ['mem', 'Members'],
    ['log', 'Activity log'],
  ];

  const viewRenderers = {};
  let currentView = 'dash';
  let pendingArmMode = null;
  let enteredPin = '';
  let securityMessage = 'Pick a mode, then enter your PIN (default 1234).';
  let isAlarmActive = false;
  let sirenTimer = null;
  let audioContext = null;
  let oscillator = null;

  const mainEl = $('.main');

  // Top Nav Bar
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.id = 'nav';
  nav.innerHTML =
    VIEWS.map(([viewKey, label]) => `<button class="pill" data-v="${viewKey}">${label}</button>`).join('') +
    '<span class="chip" id="chip"></span>';
  mainEl.append(nav);

  // Dashboard View Container
  const dashboardView = document.createElement('div');
  dashboardView.id = 'v-dash';
  dashboardView.className = 'view dashv';
  dashboardView.append($('.left'),$('.stage'));
  mainEl.append(dashboardView);

  // Auxiliary View Containers
  VIEWS.slice(1).forEach(([viewKey]) => {
    const section = document.createElement('div');
    section.className = 'view';
    section.id = `v-${viewKey}`;
    section.hidden = true;
    mainEl.append(section);
  });

  // Alarm Banner
  const alarmBanner = document.createElement('div');
  alarmBanner.className = 'alarm';
  alarmBanner.id = 'alarm';
  document.body.append(alarmBanner);

  const updateSecurityChip = () => {
    const chip = $('#chip');
    chip.textContent = `Alarm: ${MODES[security.arm]}`;
    chip.classList.toggle('armed', security.arm !== 'off');
  };

  function switchView(viewKey) {
    currentView = viewKey;
    VIEWS.forEach(([k]) => {
      $('#v-' + k).hidden = k !== viewKey;     });     $$('#nav .pill').forEach((btn) => {
      btn.classList.toggle('on', btn.dataset.v === viewKey);
    });
    if (viewRenderers[viewKey]) {
      viewRenderers[viewKey]();
    }
  }

  const downloadBlob = (blob, filename) => {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
  };

  const createToggleSwitch = (isOn, attributes, label) =>
    `<button class="tg" role="switch" aria-checked="${isOn}" ${attributes} aria-label="${label}"></button>`;

  // ==========================================
  // Section 1: Cameras View & Canvas Simulation
  // ==========================================
  viewRenderers.cams = () => {
    $('#v-cams').innerHTML = `
      <div class="grid">
        ${cams
          .map(
            (cam, idx) => `
          <div class="card feed">
            <canvas data-c="${idx}" width="400" height="225"></canvas>
            <div class="fb">
              <b>${cam.n}</b>
              <span>${cam.on ? '● Live' : 'Offline'}</span>
              <button class="pill sm" data-snap="${idx}">Snapshot</button>
              ${createToggleSwitch(cam.on, `data-ct="${idx}"`, `${cam.n} power`)}
            </div>
          </div>`
          )
          .join('')}
      </div>`;
  };

  const houseTexture = new Image();
  houseTexture.src = window.HOUSE || 'house.jpg';

  // Crop regions mapped for this specific house render
  const CROP_REGIONS = [
    [0.2, 0.45, 0.45, 0.4],   // Backyard patio & pool
    [0.48, 0.65, 0.45, 0.35],  // Pool deck & loungers
    [0.18, 0.18, 0.55, 0.38],  // Upper balcony
    [0.72, 0.48, 0.28, 0.3],   // Right wing & garage entrance
  ];
  const lastMotionTime = {};

  function renderCameraSimulation(time) {
    if (currentView === 'cams') {
      $$('#v-cams canvas').forEach((canvas) => {
        const idx = Number(canvas.dataset.c);
        const cam = cams[idx];
        const ctx = canvas.getContext('2d');
        const W = 400;
        const H = 225;

        // Camera Off State
        if (!cam.on) {
          ctx.fillStyle = '#15181a';
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = '#888';
          ctx.font = '14px sans-serif';
          ctx.fillText('Camera off', W / 2 - 35, H / 2);
          return;
        }

        // Camera Feed Simulation
        if (houseTexture.complete && houseTexture.naturalWidth > 0) {
          const [cropX, cropY, cropW, cropH] = CROP_REGIONS[idx % 4];
          const imgW = houseTexture.naturalWidth;
          const imgH = houseTexture.naturalHeight;
          ctx.drawImage(
            houseTexture,
            cropX * imgW,
            cropY * imgH,
            cropW * imgW,
            cropH * imgH,
            0,
            0,
            W,
            H
          );
        } else {
          ctx.fillStyle = cam.c;
          ctx.fillRect(0, 0, W, H);
        }

        // Night-tint overlay
        ctx.fillStyle = 'rgba(0, 25, 15, 0.15)';
        ctx.fillRect(0, 0, W, H);

        // Animated target / moving entity
        const figureX = ((time / 25 + idx * 90) % (W + 80)) - 40;
        ctx.fillStyle = '#0d0f10';
        ctx.beginPath();
        ctx.arc(figureX, H * 0.55, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(figureX - 8, H * 0.55 + 9, 16, 34);

        // Static noise lines
        for (let k = 0; k < 20; k++) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.fillRect(Math.random() * W, Math.random() * H, W, 1);
        }

        // Timestamp overlay
        ctx.fillStyle = '#fff';
        ctx.font = '11px monospace';
        ctx.fillText(`${cam.n}   ${new Date().toLocaleTimeString()}`, 10, H - 10);

        // Recording indicator light
        if (time % 1000 < 600) {
          ctx.fillStyle = '#e5484d';
          ctx.beginPath();
          ctx.arc(W - 16, 16, 5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Motion Detection trigger check
        const passedCenter = Math.abs(figureX - W / 2) < 2;
        const cooldownElapsed = time - (lastMotionTime[idx] || -10000) > 6000;

        if (passedCenter && cooldownElapsed) {
          lastMotionTime[idx] = time;
          addEvent(cam.n, 'Motion detected');
          if (security.arm === 'away' || security.arm === 'night') {
            triggerAlarm(`Motion on ${cam.n}`);
          }
        }
      });
    }
    requestAnimationFrame(renderCameraSimulation);
  }

  // ==========================================
  // Section 2: Security & Alarm System
  // ==========================================
  viewRenderers.sec = () => {
    const modeButtons = Object.entries(MODES)
      .map(
        ([key, label]) => `
      <button class="pill ${security.arm === key ? 'on' : ''}" data-mode="${key}">
        ${label}
      </button>`
      )
      .join('');

    const keypadButtons = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK']
      .map((k) => `<button data-key="${k}">${k}</button>`)
      .join('');

    const sensors = [
      'Front door',
      'Back door',
      'Living room window',
      'Hallway motion',
      'Garage door',
    ];

    const sensorRows = sensors
      .map(
        (sensorName) => `
      <div class="row">
        <b>${sensorName}</b>
        <span class="state">Secure</span>
        <button class="pill sm" data-trig="${sensorName}">Test</button>
      </div>`
      )
      .join('');

    $('#v-sec').innerHTML = `
      <div class="grid">
        <div class="card">
          <h3>Alarm mode</h3>
          <div class="modes">${modeButtons}</div>
          <div class="dots">${'●'.repeat(enteredPin.length)}</div>
          <div class="msg">${securityMessage}</div>
          <div class="pad">${keypadButtons}</div>
        </div>
        <div class="card">
          <h3>Sensors</h3>
          ${sensorRows}
          <button class="pill" style="background: #e5484d; color: #fff; margin-top: 12px; width: 100%" data-panic>
            Panic alarm
          </button>
        </div>
      </div>`;
  };

  function toggleSirenAudio(enable) {
    try {
      if (enable) {
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.04;
        oscillator.type = 'square';
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start();
        sirenTimer = setInterval(() => {
          if (oscillator && oscillator.frequency) {
            oscillator.frequency.value = oscillator.frequency.value === 800 ? 600 : 800;
          }
        }, 500);
      } else {
        if (oscillator) {
          oscillator.stop();
          oscillator.disconnect();
          oscillator = null;
        }
        clearInterval(sirenTimer);
      }
    } catch (e) {
      console.warn('AudioContext error:', e);
    }
  }

  function triggerAlarm(reason) {
    if (isAlarmActive) return;
    isAlarmActive = true;
    alarmBanner.textContent = `ALARM: ${reason}. Open Security and enter your PIN to disarm.`;
    alarmBanner.classList.add('on');
    toggleSirenAudio(true);
    addEvent('Alarm', reason);
  }

  function setArmMode(mode) {
    security.arm = mode;
    if (mode === 'off' && isAlarmActive) {
      isAlarmActive = false;
      alarmBanner.classList.remove('on');
      toggleSirenAudio(false);
    }
    addEvent('Alarm', mode === 'off' ? 'System disarmed' : `System armed: ${MODES[mode]}`);
    securityMessage = `Mode set to ${MODES[mode]}.`;
    updateSecurityChip();
    window.save();
  }

  function handleKeypadPress(keyValue) {
    if (!pendingArmMode) {
      securityMessage = 'Choose a mode first.';
    } else if (keyValue === 'C') {
      enteredPin = '';
    } else if (keyValue === 'OK') {
      if (enteredPin === security.pin) {
        setArmMode(pendingArmMode);
        pendingArmMode = null;
      } else {
        securityMessage = 'Wrong PIN. Try again.';
      }
      enteredPin = '';
    } else if (enteredPin.length < 4) {
      enteredPin += keyValue;
    }
    viewRenderers.sec();
  }

  // ==========================================
  // Section 3: Smart Devices & Automation Scenes
  // ==========================================
  const lockAllDoors = () => locks.forEach((l) => (l.l = true));
  const turnOffAllLights = () => devices.lights.forEach((l) => (l.on = false));

  const SCENES = {
    'Good night': () => {
      turnOffAllLights();
      lockAllDoors();
      devices.garage = false;
      security.arm = 'night';
    },
    Away: () => {
      turnOffAllLights();
      lockAllDoors();
      devices.garage = false;
      devices.ac = false;
      security.arm = 'away';
    },
    Movie: () => {
      devices.lights.forEach((light, i) => {
        light.on = i === 0;
        if (i === 0) light.brightness = 20;
      });
    },
    Morning: () => {
      devices.lights.forEach((light, i) => (light.on = i < 2));
      devices.temp = 24;
      devices.ac = true;
    },
  };

  viewRenderers.dev = () => {
    const lightRows = devices.lights
      .map(
        (light, idx) => `
      <div class="row">
        <b>${light.name}</b>
        <input type="range" min="10" max="100" value="${light.brightness}" data-br="${idx}" aria-label="${light.name} brightness">
        ${createToggleSwitch(light.on, `data-lt="${idx}"`, light.name)}
      </div>`
      )
      .join('');

    const sceneButtons = Object.keys(SCENES)
      .map((name) => `<button class="pill" data-scene="${name}">${name}</button>`)
      .join('');

    $('#v-dev').innerHTML = `
      <div class="grid">
        <div class="card">
          <h3>Lights</h3>
          ${lightRows}
        </div>
        <div class="card">
          <h3>Thermostat</h3>
          <div class="big">${devices.temp}°C</div>
          <div class="row">
            <button class="pill sm" data-tp="-1">−</button>
            <button class="pill sm" data-tp="1">+</button>
            <b></b>
            <span>Cooling</span>
            ${createToggleSwitch(devices.ac, 'data-ac', 'Cooling')}
          </div>
          <h3 style="margin-top: 14px">Garage door</h3>
          <div class="row">
            <b>${devices.garage ? 'Open' : 'Closed'}</b>
            <button class="pill sm" data-gar>${devices.garage ? 'Close' : 'Open'}</button>
          </div>
        </div>
        <div class="card">
          <h3>Scenes</h3>
          <div class="scenes">${sceneButtons}</div>
        </div>
      </div>`;
  };

  // ==========================================
  // Section 4: Members View
  // ==========================================
  viewRenderers.mem = () => {
    const memberRows = members
      .map(
        (member, idx) => `
      <div class="row">
        <span class="av" style="background: ${member.c}; margin: 0">${member.i}</span>
        <b>
          ${member.n}<br>
          <small style="color: var(--mute); font-weight: 400">${member.role}</small>
        </b>
        <label>Doors ${createToggleSwitch(member.a.doors, `data-ma="doors:${idx}"`, 'Doors')}</label>
        <label>Cams ${createToggleSwitch(member.a.cams, `data-ma="cams:${idx}"`, 'Cameras')}</label>
        ${member.role === 'Owner' ? '' : `<button class="pill sm" data-rm="${idx}">Remove</button>`}
      </div>`
      )
      .join('');

    $('#v-mem').innerHTML = `
      <div class="grid">
        <div class="card">
          <h3>Members (${members.length})</h3>
          ${memberRows}
        </div>
        <div class="card">
          <h3>Invite member</h3>
          <div class="row">
            <input id="mn" placeholder="Full name">
            <select id="mr">
              <option>Family</option>
              <option>Guest</option>
            </select>
            <button class="pill sm" data-add>Add member</button>
          </div>
          <div class="msg" id="mm"></div>
        </div>
      </div>`;
  };

  // ==========================================
  // Section 5: Activity Log & Filtering
  // ==========================================
  let logFilter = { category: 'all', query: '' };

  const categorizeEvent = (entry) => {
    const text = `${entry[2]} ${entry[3]}`;
    if (/alarm|siren|panic|armed|sensor/i.test(text)) return 'alarm';
    if (/camera|motion/i.test(text)) return 'cams';
    if (/lock|door|garage/i.test(text)) return 'doors';
    return 'other';
  };

  const getFilteredLogEntries = () => {
    const flattened = [];
    days.forEach((date, dayIdx) => {
      (log[dayIdx] || []).forEach((entry) => flattened.push({ date, entry }));
    });

    return flattened
      .reverse()
      .filter(({ entry }) => {
        const matchesCategory =
          logFilter.category === 'all' || categorizeEvent(entry) === logFilter.category;
        const matchesQuery = entry.join(' ').toLowerCase().includes(logFilter.query);
        return matchesCategory && matchesQuery;
      });
  };

  function renderLogList() {
    const entries = getFilteredLogEntries();
    if (!entries.length) {
      $('#ll').innerHTML = '<div class="msg">No matching events.</div>';
      return;
    }

    $('#ll').innerHTML = entries
      .map(
        ({ date, entry }) => `
      <div class="row">
        <span style="width: 80px; color: var(--mute); font-size: 11px">
          ${date.toLocaleDateString('en', { month: 'short', day: 'numeric' })} ${entry[0]} ${entry[1]}
        </span>
        <b>${entry[2]}</b>
        <span>${entry[3]}</span>
      </div>`
      )
      .join('');
  }

  viewRenderers.log = () => {
    const filterOptions = [
      ['all', 'All'],
      ['doors', 'Doors & locks'],
      ['cams', 'Cameras'],
      ['alarm', 'Alarm'],
      ['other', 'Devices'],
    ]
      .map(
        ([val, label]) => `
      <option value="${val}" ${logFilter.category === val ? 'selected' : ''}>
        ${label}
      </option>`
      )
      .join('');

    $('#v-log').innerHTML = `
      <div class="card">
        <div class="filters">
          <input id="ls" placeholder="Search activity" value="${logFilter.query}">
          <select id="lc">${filterOptions}</select>
          <button class="pill sm" data-exp>Export CSV</button>
          <button class="pill sm" data-clr>Clear log</button>
        </div>
        <div id="ll"></div>
      </div>`;

    renderLogList();
  };

  function captureSnapshot(cameraIdx) {
    $$('#v-cams canvas')[cameraIdx].toBlob((blob) => {
      downloadBlob(blob, `snapshot-camera-${cameraIdx + 1}.png`);
    });
    toast('Snapshot saved');
  }

  // ==========================================
  // Delegated UI Event Handlers
  // ==========================================
  document.addEventListener('click', (evt) => {
    const findTarget = (selector) => evt.target.closest(selector);
    let el;

    if ((el = findTarget('[data-v]'))) {
      return switchView(el.dataset.v);
    }

    if ((el = findTarget('[data-snap]'))) {
      return captureSnapshot(Number(el.dataset.snap));
    }

    if ((el = findTarget('[data-ct]'))) {
      const cam = cams[el.dataset.ct];
      cam.on = !cam.on;
      addEvent(cam.n, cam.on ? 'Camera turned on' : 'Camera turned off');
      viewRenderers.cams();
      renderDashboard();
      return;
    }

    if ((el = findTarget('[data-mode]'))) {
      pendingArmMode = el.dataset.mode;
      enteredPin = '';
      securityMessage = `Enter PIN to switch to ${MODES[pendingArmMode]}.`;
      return viewRenderers.sec();
    }

    if ((el = findTarget('[data-key]'))) {
      return handleKeypadPress(el.dataset.key);
    }

    if ((el = findTarget('[data-trig]'))) {
      const sensor = el.dataset.trig;
      addEvent(sensor, 'Sensor triggered');
      if (security.arm === 'off') {
        toast(`${sensor} triggered (system disarmed)`);
      } else if (security.arm === 'home' && /motion/i.test(sensor)) {
        toast('Motion ignored in Home mode');
      } else {
        triggerAlarm(`${sensor} triggered`);
      }
      return;
    }

    if (findTarget('[data-panic]')) {
      return triggerAlarm('Panic button pressed');
    }

    if ((el = findTarget('[data-lt]'))) {
      const light = devices.lights[el.dataset.lt];
      light.on = !light.on;
      addEvent('Lights', `${light.name} ${light.on ? 'turned on' : 'turned off'}`);
      return viewRenderers.dev();
    }

    if ((el = findTarget('[data-tp]'))) {
      devices.temp = Math.min(32, Math.max(16, devices.temp + Number(el.dataset.tp)));
      window.save();
      return viewRenderers.dev();
    }

    if (findTarget('[data-ac]')) {
      devices.ac = !devices.ac;
      addEvent('Thermostat', `Cooling ${devices.ac ? 'on' : 'off'}`);
      return viewRenderers.dev();
    }

    if (findTarget('[data-gar]')) {
      devices.garage = !devices.garage;
      addEvent('Garage', devices.garage ? 'Garage door opened' : 'Garage door closed');
      if (devices.garage && security.arm === 'away') {
        triggerAlarm('Garage door opened while armed');
      }
      return viewRenderers.dev();
    }

    if ((el = findTarget('[data-scene]'))) {
      const sceneName = el.dataset.scene;
      SCENES[sceneName]();
      addEvent('Scene', `${sceneName} activated`);
      renderLocks();
      renderDashboard();
      updateSecurityChip();
      toast(`${sceneName} activated`);
      return viewRenderers.dev();
    }

    if ((el = findTarget('[data-ma]'))) {
      const [permission, memberIdx] = el.dataset.ma.split(':');
      const member = members[memberIdx];
      member.a[permission] = !member.a[permission];
      syncMemberRoleDesc(member);
      addEvent(
        'Members',
        `${member.n}: ${permission} access ${member.a[permission] ? 'granted' : 'removed'}`
      );
      return viewRenderers.mem();
    }

    if ((el = findTarget('[data-rm]'))) {
      const removed = members.splice(el.dataset.rm, 1)[0];
      addEvent('Members', `${removed.n} was removed`);
      renderMembers();
      return viewRenderers.mem();
    }

    if (findTarget('[data-add]')) {
      const nameInput = $('#mn').value.trim();
      if (!nameInput) {
        $('#mm').textContent = 'Enter a name first.';
        return;
      }
      const role = $('#mr').value;
      const initials = nameInput
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

      const newMember = {
        n: nameInput,
        role,
        i: initials,
        c: palette[members.length % palette.length],
        a: { doors: role === 'Family', cams: true },
      };

      syncMemberRoleDesc(newMember);
      members.push(newMember);
      addEvent('Members', `${nameInput} was added as ${role}`);
      renderMembers();
      return viewRenderers.mem();
    }

    if (findTarget('[data-exp]')) {
      const csvRows = [
        'Date,Time,Source,Event',
        ...getFilteredLogEntries().map(({ date, entry }) =>
          [date.toDateString(), `${entry[0]} ${entry[1]}`, entry[2], entry[3]]
            .map((val) => `"${val}"`)
            .join(',')
        ),
      ].join('\n');

      downloadBlob(new Blob([csvRows], { type: 'text/csv' }), 'activity-log.csv');
      return;
    }

    if (findTarget('[data-clr]')) {
      days.forEach((_, i) => (log[i] = []));
      window.save();
      renderTimeline();
      return viewRenderers.log();
    }
  });

  // Slider & Filter Inputs
  document.addEventListener('input', (evt) => {
    const target = evt.target;
    if (target.dataset.br !== undefined) {
      devices.lights[target.dataset.br].brightness = Number(target.value);
      window.save();
    }
    if (target.id === 'ls') {
      logFilter.query = target.value.toLowerCase();
      renderLogList();
    }
  });

  document.addEventListener('change', (evt) => {
    const target = evt.target;
    if (target.id === 'lc') {
      logFilter.category = target.value;
      renderLogList();
    }
    if (target.dataset.br !== undefined) {
      const light = devices.lights[target.dataset.br];
      addEvent('Lights', `${light.name} brightness set to ${light.brightness}%`);
    }
  });

  // Global Lifecycle Initialization
  updateSecurityChip();
  switchView('dash');
  requestAnimationFrame(renderCameraSimulation);
})();