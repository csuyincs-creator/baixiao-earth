/* =============================================================
   earth-controls.js — 原站的状态控制条 + 设置面板
   从原 index.html 的两个 IIFE 原样移植，唯一改动：
   goTo() 由「滚动原 section」改为「滚动内容层章节」——
   因为 .earth-state-shell 已改为固定定位，原 section 不再随文档滚动。
   ============================================================= */

const settings = window.__BAIXIAO_EARTH_SETTINGS__;
const dragRotation = window.__BAIXIAO_EARTH_DRAG_ROTATION__;

/* ---------- 状态控制条 ---------- */
export function initStateControls({ onStateChange } = {}) {
  const chapters = [...document.querySelectorAll('.home-content .chapter')];
  const controls = document.querySelector('.earth-state-controls');
  const playButton = controls.querySelector('[data-earth-action="play"]');
  const playIcon = playButton.querySelector('[data-icon="play"]');
  const pauseIcon = playButton.querySelector('[data-icon="pause"]');
  const dots = [...controls.querySelectorAll('[data-earth-state]')];

  let active = 0;
  let playing = false;
  let timer = 0;

  const setActive = (index) => {
    const next = (index + chapters.length) % chapters.length;
    if (next === active) return;
    active = next;
    dots.forEach((dot, i) => {
      const selected = i === active;
      dot.classList.toggle('is-active', selected);
      dot.setAttribute('aria-selected', String(selected));
    });
    onStateChange?.(active);
  };

  const goTo = (index, smooth = true) => {
    const target = (index + chapters.length) % chapters.length;
    const top = chapters[target]?.offsetTop ?? 0;
    if (window.__lenis) window.__lenis.scrollTo(top, { duration: smooth ? 1.1 : 0 });
    else window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    setActive(target);
  };

  const stop = () => {
    playing = false;
    window.clearTimeout(timer);
    playIcon.hidden = false;
    pauseIcon.hidden = true;
    playButton.setAttribute('aria-label', 'Play states');
  };

  const schedule = () => {
    window.clearTimeout(timer);
    if (!playing) return;
    timer = window.setTimeout(() => { goTo(active + 1); schedule(); }, 3600);
  };

  const start = () => {
    playing = true;
    playIcon.hidden = true;
    pauseIcon.hidden = false;
    playButton.setAttribute('aria-label', 'Pause states');
    schedule();
  };

  controls.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.earthAction;
    if (action === 'play') return playing ? stop() : start();
    stop();
    if (action === 'previous') goTo(active - 1);
    if (action === 'next') goTo(active + 1);
    if (button.dataset.earthState !== undefined) goTo(Number(button.dataset.earthState));
  });

  /* 章节索引由 home.js 统一判定（视口中心法，章节不等高也不抖），
     这里只负责被动同步，不再各自监听 scroll，避免两套判定打架。 */
  const sync = (index) => {
    const next = (index + chapters.length) % chapters.length;
    if (next === active) return;
    active = next;
    dots.forEach((dot, i) => {
      const selected = i === active;
      dot.classList.toggle('is-active', selected);
      dot.setAttribute('aria-selected', String(selected));
    });
  };

  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('pointerdown', (event) => {
    if (!controls.contains(event.target)) stop();
  }, { passive: true });
  window.addEventListener('resize', () => goTo(active, false));

  window.history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  dots[0]?.classList.add('is-active');

  /* stop 暴露给沉浸播放：两套轮播同时开会互相抢滚动位置 */
  return { goTo, sync, stop, getActive: () => active };
}

/* ---------- 设置面板 ---------- */
export function initSettingsPanel() {
  const panel = document.querySelector('.earth-settings-panel');
  const toggle = document.querySelector('.earth-settings-toggle');
  const dragLayer = document.querySelector('.earth-drag-layer');
  const defaults = JSON.parse(JSON.stringify(settings));

  const presetSets = {
    points: {
      neon: ['#19e9df', '#ff35d1', '#ffffff'],
      ice: ['#7ee7ff', '#4c8dff', '#e7fbff'],
      sunset: ['#ffb347', '#ff4f81', '#ffe4b5'],
      aurora: ['#62ffd1', '#8c7bff', '#e9ff8f']
    },
    orbits: {
      neon: ['#14efe0', '#ff23c8', '#9a6cff'],
      ice: ['#b5f7ff', '#4e9dff', '#a5c8ff'],
      sunset: ['#ffca70', '#ff477e', '#ff7e42'],
      aurora: ['#4fffd1', '#69a7ff', '#d073ff']
    }
  };

  const getSections = () => window.__BAIXIAO_WEBGL_SECTIONS__ || [];
  const getColorCtor = () => {
    for (const section of getSections()) {
      const value = section.earth?.material?.uniforms?.uSunColor?.value;
      if (value?.constructor) return value.constructor;
    }
    return null;
  };
  const makeColor = (hex) => {
    const ColorCtor = getColorCtor();
    if (ColorCtor) return new ColorCtor(hex);
    const n = Number.parseInt(hex.slice(1), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  };
  const setColor = (material, uniformName, hex) => {
    const uniform = material?.uniforms?.[uniformName];
    if (!uniform) return;
    if (uniform.value?.set) uniform.value.set(hex);
    else uniform.value = makeColor(hex);
  };
  const setNumber = (material, uniformName, multiplier) => {
    const uniform = material?.uniforms?.[uniformName];
    if (!uniform || typeof uniform.value !== 'number') return;
    material.userData.__baixiaoBase ??= {};
    material.userData.__baixiaoBase[uniformName] ??= uniform.value;
    uniform.value = material.userData.__baixiaoBase[uniformName] * multiplier;
  };
  const materialsIn = (object) => {
    const found = [];
    object?.traverse?.((node) => { if (node.material) found.push(node.material); });
    if (object?.material && !found.includes(object.material)) found.push(object.material);
    return found;
  };
  const decorateParticle = (material) => {
    if (!material || material.userData.__baixiaoParticleDecorated) return;
    material.vertexShader = material.vertexShader
      .replace('#define BLUE vec3(.1, .9, .8)', 'uniform vec3 uPointColorA;')
      .replace('#define PINK vec3(.8, .1, .6)', 'uniform vec3 uPointColorB;')
      .replace('vColor = mix(BLUE, PINK, step(.6, aColor) * step(aColor, .95));', 'vColor = mix(uPointColorA, uPointColorB, step(.5, aColor)); vColor = mix(vColor, uPointColorC, step(.85, aColor));')
      .replace('uniform float uProgress;\n', 'uniform float uProgress;\nuniform float uPointScale;\nuniform vec3 uPointColorC;\n');
    material.vertexShader = material.vertexShader.replace('gl_PointSize = (300.0 / length(mvPosition));', 'gl_PointSize = (300.0 * uPointScale / length(mvPosition));');
    material.fragmentShader = material.fragmentShader.replace('varying float vProgress;\n', 'varying float vProgress;\nuniform float uPointIntensity;\n').replace('vec3 color = vColor + smoothstep(.6, .0, length(gl_PointCoord.xy - .2)) * .5;', 'vec3 color = (vColor + smoothstep(.6, .0, length(gl_PointCoord.xy - .2)) * .5) * uPointIntensity;');
    material.uniforms.uPointScale = { value: 1 };
    material.uniforms.uPointIntensity = { value: 1 };
    material.uniforms.uPointColorA = { value: makeColor(settings.pointA) };
    material.uniforms.uPointColorB = { value: makeColor(settings.pointB) };
    material.uniforms.uPointColorC = { value: makeColor(settings.pointC) };
    material.userData.__baixiaoParticleDecorated = true;
    material.needsUpdate = true;
  };
  const decorateOrbit = (material) => {
    if (!material || material.userData.__baixiaoOrbitDecorated) return;
    material.fragmentShader = material.fragmentShader
      .replace('#define BLUE vec3(.1, .9, .8)', 'uniform vec3 uOrbitColorA;')
      .replace('#define PINK vec3(.8, .1, .6)', 'uniform vec3 uOrbitColorB;')
      .replace('vec3 color = mix(BLUE, PINK, step(.5, vSeed));', 'vec3 color = mix(uOrbitColorA, uOrbitColorB, step(.5, vSeed)); color = mix(color, uOrbitColorC, step(.85, vSeed));')
      .replace('uniform vec3 uOrbitColorB;\n', 'uniform vec3 uOrbitColorB;\nuniform vec3 uOrbitColorC;\n');
    material.uniforms.uOrbitColorA = { value: makeColor(settings.orbitA) };
    material.uniforms.uOrbitColorB = { value: makeColor(settings.orbitB) };
    material.uniforms.uOrbitColorC = { value: makeColor(settings.orbitC) };
    material.userData.__baixiaoOrbitDecorated = true;
    material.needsUpdate = true;
  };

  /* 沉浸播放的节奏预设（秒）。顺序与 DWELL_KEYS 一致 */
  const DWELL_KEYS = ['dwell0', 'dwell1', 'dwell2', 'dwell3', 'dwell4', 'dwell5'];
  const DWELL_PRESETS = {
    fast: [2.8, 3.2, 4.8, 4.2, 5.2, 3.8],
    normal: [4.6, 5.4, 7.8, 6.8, 8.6, 6.4],
    slow: [7.0, 8.0, 11.5, 10.0, 13.0, 9.5]
  };
  const dwellTotalEl = document.querySelector('[data-dwell-total]');
  const syncDwellTotal = () => {
    if (!dwellTotalEl) return;
    const total = DWELL_KEYS.reduce((sum, key) => sum + (Number(settings[key]) || 0), 0);
    dwellTotalEl.textContent = `${total.toFixed(1)}s`;
  };

  const syncInputs = () => {
    document.querySelectorAll('[data-setting]').forEach((input) => {
      const key = input.dataset.setting;
      input.type === 'checkbox' ? input.checked = Boolean(settings[key]) : input.value = settings[key];
    });
    document.querySelectorAll('[data-color]').forEach((input) => { input.value = settings[input.dataset.color]; });
    /* 输出单位默认是倍率（×）；沉浸播放的时长用 data-unit="s" 覆盖 */
    document.querySelectorAll('[data-output]').forEach((output) => {
      const key = output.dataset.output;
      const value = Number(settings[key]);
      const unit = output.dataset.unit || '×';
      const digits = output.dataset.digits ? Number(output.dataset.digits) : (key === 'autoRotateMultiplier' ? 1 : 2);
      output.textContent = `${value.toFixed(digits)}${unit}`;
    });
    syncDwellTotal();
  };

  /* 落盘节流：apply() 在章节氛围补间里每帧被调用，逐帧 JSON.stringify + setItem
     纯属浪费。另外 autoRotateMultiplier 由滚动/转速逻辑每帧改写，属于运行时动态值，
     不落盘——否则下次打开页面先读到上次的瞬时值再被拉回，开场转速会飘。 */
  let saveTimer = 0;
  const persist = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const { autoRotateMultiplier, ...rest } = settings;
      try { localStorage.setItem('baixiao-earth-settings', JSON.stringify(rest)); } catch (_) { /* private browsing */ }
    }, 250);
  };

  const apply = () => {
    getSections().forEach((section) => {
      section.wrapper?.scale?.setScalar(settings.scale);
      materialsIn(section.earth).forEach((material) => {
        setNumber(material, 'uLightIntensity', settings.brightness);
        setNumber(material, 'uSunIntensity', settings.brightness);
      });
      materialsIn(section.atmosphere).forEach((material) => setNumber(material, 'uIntensity', settings.brightness));
      section.atmosphere && (section.atmosphere.visible = settings.showAtmosphere);
      section.clouds && (section.clouds.visible = settings.showClouds);

      const pointMaterial = section.privateerSatellites?.material;
      if (pointMaterial) {
        decorateParticle(pointMaterial);
        pointMaterial.visible = settings.showPoints;
        pointMaterial.uniforms.uPointScale.value = settings.pointScale;
        pointMaterial.uniforms.uPointIntensity.value = settings.brightness;
        setColor(pointMaterial, 'uPointColorA', settings.pointA);
        setColor(pointMaterial, 'uPointColorB', settings.pointB);
        setColor(pointMaterial, 'uPointColorC', settings.pointC);
      }
      materialsIn(section.privateerTrajectories).forEach((material) => {
        decorateOrbit(material);
        material.visible = settings.showOrbits;
        setNumber(material, 'uIntensity', settings.orbitIntensity);
        setColor(material, 'uOrbitColorA', settings.orbitA);
        setColor(material, 'uOrbitColorB', settings.orbitB);
        setColor(material, 'uOrbitColorC', settings.orbitC);
      });
      if (section.privateerTrajectories) section.privateerTrajectories.visible = settings.showOrbits;
      if (section.privateerSatellites) section.privateerSatellites.visible = settings.showPoints;
    });
    syncInputs();
    persist();
  };

  // 暴露给章节联动模块（earth-link.js）：改完 settings 后手动触发重绘
  window.__BAIXIAO_EARTH_APPLY__ = apply;

  const restore = () => { Object.assign(settings, JSON.parse(JSON.stringify(defaults))); dragRotation.x = 0; dragRotation.y = 0; apply(); };

  /* 转速是运行时动态值，不落盘；历史存档里若带着旧值一并丢弃，
     否则老用户打开页面会先按旧转速跑一小段再被拉回基线。 */
  try {
    const saved = JSON.parse(localStorage.getItem('baixiao-earth-settings') || '{}');
    delete saved.autoRotateMultiplier;
    Object.assign(settings, saved);
  } catch (_) { /* private browsing */ }

  toggle.addEventListener('click', () => {
    const open = !panel.classList.contains('is-open');
    panel.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });

  panel.addEventListener('input', (event) => {
    const input = event.target;
    if (input.matches('[data-setting]')) settings[input.dataset.setting] = input.type === 'checkbox' ? input.checked : Number(input.value);
    if (input.matches('[data-color]')) settings[input.dataset.color] = input.value;
    apply();
  });

  panel.addEventListener('click', (event) => {
    const presetButton = event.target.closest('[data-preset]');
    if (presetButton) {
      const group = presetButton.closest('[data-preset-group]')?.dataset.presetGroup;
      const values = presetSets[group]?.[presetButton.dataset.preset];
      if (values) ['A', 'B', 'C'].forEach((letter, index) => { settings[`${group === 'points' ? 'point' : 'orbit'}${letter}`] = values[index]; });
      apply();
    }
    const dwellButton = event.target.closest('[data-dwell-preset]');
    if (dwellButton) {
      const values = DWELL_PRESETS[dwellButton.dataset.dwellPreset];
      if (values) values.forEach((seconds, index) => { settings[DWELL_KEYS[index]] = seconds; });
      apply();
    }
    if (event.target.closest('[data-setting-action="reset"]')) restore();
  });

  let drag = null;
  dragLayer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    dragLayer.setPointerCapture?.(event.pointerId);
    dragLayer.classList.add('is-dragging');
  });
  /* 拖拽旋转只认横向。
     纵向为主的拖动（往下拖）留给页面滚动，不得改变地球朝向；
     横向拖拽仍按原灵敏度转地球（保留原手感）。
     注：旋转合成式里 rotation.x ← dragRotation.y（纵向俯仰）、
     rotation.y ← dragRotation.x（横向自转），所以这里只写 .x。 */
  dragLayer.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX; drag.y = event.clientY;
    if (Math.abs(dx) < Math.abs(dy)) return;
    dragRotation.x += dx * .008 * settings.dragSensitivity;
  });
  const endDrag = (event) => { if (drag?.id === event.pointerId) { drag = null; dragLayer.classList.remove('is-dragging'); } };
  dragLayer.addEventListener('pointerup', endDrag);
  dragLayer.addEventListener('pointercancel', endDrag);

  const waitForScenes = (attempt = 0) => {
    if (getSections().some((section) => section.earth?.material)) apply();
    else if (attempt < 180) window.setTimeout(() => waitForScenes(attempt + 1), 100);
  };
  waitForScenes();
  syncInputs();

  return { apply, presetSets };
}
