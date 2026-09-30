// ==========================================
// DOM Utilities & Helpers
// ==========================================
const $ = (selector) => document.querySelector(selector);
const pad = (num) => String(num).padStart(2, '0');

// SVG Icon Paths
const ICONS = {
  cam: '<path d="M3 7h11v10H3zM14 10l6-3v10l-6-3z" fill="currentColor"/>',
  fan: '<path d="M12 12c0-5 4-6 5-3s-3 3-5 3zm0 0c5 0 6 4 3 5s-3-3-3-5zm0 0c0 5-4 6-5 3s3-3 5-3zm0 0c-5 0-6-4-3-5s3 3 3 5z" fill="currentColor"/>',
  lock: '<path d="M7 11V8a5 5 0 0110 0v3h1v9H6v-9zm2 0h6V8a3 3 0 00-6 0z" fill="currentColor"/>',
};

// ==========================================
// Application State & Configuration
// ==========================================
const floors = {
  f1: {
    area: 'Backyard',
    cams: [0, 1],
    locks: [0, 1],
    z: [22, 53, 56, 25],
    hot: [
      ['cam', 35, 60],
      ['cam', 72, 60],
      ['fan', 54, 76],
      ['lock', 46, 62],
    ],
  },
  f2: {
    area: 'Balcony',
    cams: [2],
    locks: [2],
    z: [16, 22, 68, 30],
    hot: [
      ['cam', 65, 36],
      ['lock', 47, 43],
    ],
  },
  gar: {
    area: 'Garage',
    cams: [3],
    locks: [3],
    z: [83, 56, 12, 18],
    hot: [
      ['cam', 86, 58],
      ['lock', 88, 64],
    ],
  },
};

const cams = [
  { n: 'Camera 1', t: '12 pm - 8 pm', c: '#4aa3c7', on: true },
  { n: 'Camera 2', t: '10 pm - 6 am', c: '#2b3a3f', on: true },
  { n: 'Camera 3', t: 'All day', c: '#7aa68a', on: true },
  { n: 'Camera 4', t: '8 pm - 6 am', c: '#5b5f66', on: false },
];

const locks = [
  { n: 'Front Door Lock', loc: 'Main entrance', b: 60, l: true },
  { n: 'Backyard', loc: 'Patio door', b: 45, l: true },
  { n: 'Balcony Door', loc: 'Level 2', b: 82, l: true },
  { n: 'Garage Door', loc: 'Side entry', b: 23, l: true },
];

const members = [
  {
    i: 'AL',
    c: '#d98c5f',
    r: 'Owner · full access',
    n: 'Alex Lee',
    role: 'Owner',
    a: { doors: true, cams: true },
  },
  {
    i: 'MK',
    c: '#5f7fd9',
    r: 'Family · all doors',
    n: 'Maya Kim',
    role: 'Family',
    a: { doors: true, cams: true },
  },
  {
    i: 'JS',
    c: '#2b2f33',
    r: 'Family · cameras only',
    n: 'Jordan S.',
    role: 'Family',
    a: { doors: false, cams: true },
  },
  {
    i: 'RP',
    c: '#d95f7a',
    r: 'Guest · backyard until Fri',
    n: 'Riley P.',
    role: 'Guest',
    a: { doors: false, cams: false },
  },
];

const extra = [
  'Sam · Cleaner · Tue & Fri',
  'Dana · Guest · 1 floor',
  'Leo · Family · all doors',
];

const seed = [
  ['07:00', 'AM', 'Front Door', 'Front door was locked'],
  ['08:00', 'AM', 'Backyard', 'Back door was opened'],
  ['09:30', 'AM', 'Camera 2', 'Motion detected in the yard'],
  ['01:15', 'PM', 'Garage', 'Garage door was closed'],
  ['06:40', 'PM', 'Front Door', 'Front door was unlocked'],
];

// Date & Timeline State
const today = new Date(2026, 8, 30);
let selectedDay = 6;
let currentFloor = 'f1';
let activeCam = 0;
const notifications = [];

const days = [...Array(9)].map((_, i) => {
  const d = new Date(today);
  d.setDate(d.getDate() - 6 + i);
  return d;
});

const log = {};

days.forEach((_, i) => {
  log[i] = seed
    .filter((_, k) => (k + i) % 3 !== 0 || i === 6)
    .map((e) => e.slice());
});

// ==========================================
// Event & Toast Logging
// ==========================================
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');

  clearTimeout(el._timer);

  el._timer = setTimeout(
    () => el.classList.remove('show'),
    1800
  );
}

function addEvent(title, detail) {
  const now = new Date();
  const rawHours = now.getHours();
  const hours = rawHours % 12 || 12;
  const period = rawHours < 12 ? 'AM' : 'PM';
  const timeStr = `${pad(hours)}:${pad(now.getMinutes())}`;

  if (!log[6]) log[6] = [];

  log[6].push([
    timeStr,
    period,
    title,
    detail,
  ]);

  notifications.push(`${title}: ${detail}`);

  $('#badge').style.display = 'block';

  renderTimeline();

  if (window.save) window.save();
}

// ==========================================
// Render Functions
// ==========================================
function renderCameras() {
  const activeFloor = floors[currentFloor];

  $('#camCount').textContent =
    activeFloor.cams.length;

  $('#cams').innerHTML = activeFloor.cams
    .map((idx) => {
      const camera = cams[idx];

      const isSelected =
        activeCam === idx ? 'sel' : '';

      return `
        <div class="cam ${isSelected}" data-i="${idx}">
          <div 
            class="im" 
            style="background: linear-gradient(135deg, ${camera.c}, #222)"
          ></div>

          <div>
            <b>${camera.n}</b>
            <span>${camera.t}</span>
          </div>

          <button 
            class="tg" 
            role="switch" 
            aria-checked="${camera.on}" 
            aria-label="${camera.n} power" 
            data-t="${idx}">
          </button>
        </div>`;
    })
    .join('');

  const currentCam = cams[activeCam];

  $('#camName').textContent =
    `${currentCam.n}${currentCam.on ? '' : ' (off)'}`;
}

function renderLocks() {
  const activeFloor = floors[currentFloor];

  $('#lockCount').textContent =
    activeFloor.locks.length;

  $('#locks').innerHTML = activeFloor.locks
    .map((idx) => {
      const item = locks[idx];

      return `
        <div class="lock">
          <div class="c ${item.l ? '' : 'open'}">
            <div>
              <b>${item.n}</b><br>
              <span>${item.loc}</span>
            </div>

            <button class="state" data-l="${idx}">
              ${item.l ? '🔒 Locked' : '🔓 Unlocked'}
            </button>
          </div>

          <div class="bat ${item.b < 30 ? 'low' : ''}">
            <i style="height: ${item.b}%"></i>
            <span>${item.b}%</span>
          </div>
        </div>`;
    })
    .join('');
}

function renderScene() {
  const activeFloor = floors[currentFloor];

  const [zx, zy, zw, zh] =
    activeFloor.z;

  const hotSpotsHtml = activeFloor.hot
    .map(([type, x, y], idx) => {
      const colorClass =
        type === 'cam'
          ? 'mint'
          : type === 'fan'
            ? 'grn'
            : 'lav';

      const camIdx =
        activeFloor.cams[
          Math.min(
            idx,
            activeFloor.cams.length - 1
          )
        ];

      const isOff =
        type === 'cam' &&
        !cams[camIdx].on;

      return `
        <button 
          class="hot ${colorClass} ${isOff ? 'off' : ''}" 
          style="left: ${x}%; top: ${y}%" 
          data-h="${type}" 
          data-n="${idx}" 
          aria-label="${type}">
          
          <svg 
            width="18" 
            height="18" 
            viewBox="0 0 24 24"
          >
            ${ICONS[type]}
          </svg>
        </button>`;
    })
    .join('');

  $('#scene').innerHTML = `
    <div class="ph">
      <img 
        src="${window.HOUSE || 'house.jpg'}" 
        alt="Modern two-storey home with pool"
      >

      <div 
        class="zone" 
        style="
          left: ${zx}%; 
          top: ${zy}%; 
          width: ${zw}%; 
          height: ${zh}%
        "
      ></div>

      ${hotSpotsHtml}
    </div>

    <div class="tip" id="tip">
      Tap a device hotspot to toggle
    </div>
  `;
}

function renderTimeline() {
  const list =
    (log[selectedDay] || []).slice();

  if (!list.length) {
    $('#tl').innerHTML =
      '<div class="empty">No activity on this day.</div>';

    return;
  }

  $('#tl').innerHTML = list
    .map(
      (entry, idx) => `
      <div class="t">
        <b>${entry[0]}</b>${entry[1]}
      </div>

      <div class="ev ${
        idx === list.length - 1 || idx === 1
          ? 'hl'
          : ''
      }">
        <b>${entry[2]}</b>
        <span>${entry[3]}</span>
      </div>`
    )
    .join('');
}

function renderDays() {
  $('#days').innerHTML = days
    .slice(2, 9)
    .map((date, idx) => {
      const dayIdx = idx + 2;

      const isSelected =
        dayIdx === selectedDay
          ? 'on'
          : '';

      const weekday =
        date.toLocaleDateString(
          'en',
          { weekday: 'short' }
        );

      return `
        <button 
          class="d ${isSelected}" 
          data-d="${dayIdx}"
        >
          ${date.getDate()}
          <small>${weekday}</small>
        </button>`;
    })
    .join('');
}

function renderMembers() {
  const memberListHtml = members
    .map(
      (m, idx) => `
      <button 
        class="av" 
        style="background: ${m.c}" 
        data-m="${idx}" 
        aria-label="${m.i}"
      >
        ${m.i}
      </button>`
    )
    .join('');

  $('#mem').innerHTML =
    `${memberListHtml}<button class="av more" data-m="x">+3</button>`;
}

function renderNotifications() {
  if (!notifications.length) {
    $('#pop').innerHTML =
      '<p>No new notifications.</p>';

    return;
  }

  $('#pop').innerHTML = notifications
    .slice(-6)
    .reverse()
    .map((item) => `<p>${item}</p>`)
    .join('');
}

function renderDashboard() {
  renderCameras();
  renderLocks();
  renderScene();
}

// ==========================================
// Event Listeners (Delegated)
// ==========================================
document.addEventListener('click', (evt) => {
  const findTarget = (selector) =>
    evt.target.closest(selector);

  let el;

  // Toggle Camera Power
  if ((el = findTarget('[data-t]'))) {
    const camera = cams[el.dataset.t];

    camera.on = !camera.on;

    addEvent(
      camera.n,
      camera.on
        ? 'Camera turned on'
        : 'Camera turned off'
    );

    toast(
      `${camera.n} ${camera.on ? 'on' : 'off'}`
    );

    renderDashboard();

    evt.stopPropagation();

    return;
  }

  // Select Camera
  if ((el = findTarget('.cam'))) {
    activeCam =
      Number(el.dataset.i);

    renderDashboard();

    return;
  }

  // Toggle Lock State
  if ((el = findTarget('[data-l]'))) {
    const lock =
      locks[el.dataset.l];

    lock.l = !lock.l;

    addEvent(
      lock.n,
      `${lock.n} was ${
        lock.l
          ? 'locked'
          : 'unlocked'
      }`
    );

    toast(
      `${lock.n} ${
        lock.l
          ? 'locked'
          : 'unlocked'
      }`
    );

    renderLocks();

    return;
  }

  // Floor Tabs Switch
  if ((el = findTarget('[data-f]'))) {
    currentFloor =
      el.dataset.f;

    activeCam =
      floors[currentFloor].cams[0];

    document
      .querySelectorAll('#tabs .pill')
      .forEach((btn) => {
        btn.classList.toggle(
          'on',
          btn === el
        );
      });

    $('#area').textContent =
      floors[currentFloor].area;

    renderDashboard();

    return;
  }

  // Interactive Scene Hotspots
  if ((el = findTarget('[data-h]'))) {
    const currentFloorData =
      floors[currentFloor];

    const type =
      el.dataset.h;

    const hotSpotIdx =
      Number(el.dataset.n);

    if (type === 'cam') {
      const maxIndex =
        currentFloorData.cams.length - 1;

      activeCam =
        currentFloorData.cams[
          Math.min(
            hotSpotIdx,
            maxIndex
          )
        ];

      renderDashboard();

      $('#tip').textContent =
        `Viewing ${cams[activeCam].n}`;

    } else if (type === 'lock') {
      const lock =
        locks[
          currentFloorData.locks[0]
        ];

      lock.l = !lock.l;

      addEvent(
        lock.n,
        `${lock.n} was ${
          lock.l
            ? 'locked'
            : 'unlocked'
        }`
      );

      renderLocks();

      $('#tip').textContent =
        `${lock.n} ${
          lock.l
            ? 'locked'
            : 'unlocked'
        }`;

    } else {
      $('#tip').textContent =
        'Ventilation fan toggled';

      addEvent(
        'Fan',
        'Ventilation fan toggled'
      );
    }

    return;
  }

  // Day Selector
  if ((el = findTarget('[data-d]'))) {
    selectedDay =
      Number(el.dataset.d);

    renderDays();
    renderTimeline();

    return;
  }

  // Member Information Popover
  if ((el = findTarget('[data-m]'))) {
    const memberId =
      el.dataset.m;

    $('#minfo').textContent =
      memberId === 'x'
        ? extra.join(' • ')
        : `${members[memberId].i} — ${members[memberId].r}`;

    return;
  }

  // Notifications Bell
  if (findTarget('#bell')) {
    renderNotifications();

    $('#pop').classList.toggle(
      'show'
    );

    $('#badge').style.display =
      'none';

    return;
  }

  // Close notifications when clicking outside
  if (!findTarget('#pop')) {
    $('#pop').classList.remove(
      'show'
    );
  }

  // ==========================================
  // Theme Toggle
  // ==========================================
  if (findTarget('#theme')) {
    const root =
      document.documentElement;

    const isDark =
      root.dataset.theme === 'dark';

    root.dataset.theme =
      isDark
        ? 'light'
        : 'dark';

    $('#theme').textContent =
      isDark
        ? '☾'
        : '☀';

    return;
  }

  // Fullscreen Mode
  if (findTarget('#fs')) {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement
        .requestFullscreen?.()
        .catch(() => {
          toast(
            'Full screen unavailable here'
          );
        });
    }

    return;
  }

  // Camera Quick Status
  if (findTarget('#camSel')) {
    const onlineCount =
      cams.filter(
        (c) => c.on
      ).length;

    toast(
      `${onlineCount} of ${cams.length} cameras online`
    );
  }
});

// ==========================================
// Initialization
// ==========================================

// Always start in light mode,
// regardless of the system/browser theme.
document.documentElement.dataset.theme =
  'light';

$('#theme').textContent = '☾';

$('#badge').style.display = 'none';

renderDays();
renderMembers();
renderTimeline();
renderDashboard();