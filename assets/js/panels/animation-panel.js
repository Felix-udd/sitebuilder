// Animation Panel: entrance animations (scroll-into-view) + hover effects + transitions.
// Config shape stored on node.animations = { entrance: {...}, hover: {...} }

const AnimationPanel = (() => {
  const panelEl = () => document.getElementById('animationPanel');

  const ENTRANCE_ANIMATIONS = [
    { value: 'fade-up', label: 'Fade Up' },
    { value: 'fade-down', label: 'Fade Down' },
    { value: 'fade-left', label: 'Fade Left' },
    { value: 'fade-right', label: 'Fade Right' },
    { value: 'fade-in', label: 'Fade In' },
    { value: 'zoom-in', label: 'Zoom In' },
    { value: 'zoom-out', label: 'Zoom Out' },
    { value: 'bounce-in', label: 'Bounce In' },
    { value: 'flip-up', label: 'Flip Up' },
    { value: 'rotate-in', label: 'Rotate In' }
  ];

  const HOVER_EFFECTS = [
    { value: 'none', label: 'None' },
    { value: 'scale', label: 'Scale Up' },
    { value: 'scale-down', label: 'Scale Down' },
    { value: 'lift', label: 'Lift (shadow)' },
    { value: 'glow', label: 'Glow' },
    { value: 'brightness', label: 'Brightness' },
    { value: 'grayscale', label: 'Grayscale' },
    { value: 'tilt', label: 'Tilt' }
  ];

  function render(node) {
    const el = panelEl();
    if (!node) {
      el.innerHTML = '<div class="panel-empty">Select an element to add animations.</div>';
      return;
    }

    const anim = node.animations || {};
    const entrance = anim.entrance || {};
    const hover = anim.hover || {};

    const entranceEnabled = !!anim.entrance;
    const hoverEnabled = !!anim.hover && (hover.effect || 'none') !== 'none';

    el.innerHTML = `
      <div class="style-section">
        <div class="style-section-header" data-section="entrance">
          Entrance Animation ${entranceEnabled ? '<span class="badge-active">ON</span>' : ''}
        </div>
        <div class="style-section-body ${entranceEnabled ? '' : 'collapsed'}">
          <div class="style-field">
            <label class="checkbox-label">
              <input type="checkbox" id="entranceToggle" ${entranceEnabled ? 'checked' : ''}> Enable entrance animation
            </label>
          </div>
          <div id="entranceControls" class="${entranceEnabled ? '' : 'hidden'}">
            <div class="style-field">
              <label>Animation</label>
              <select id="entranceType">
                ${ENTRANCE_ANIMATIONS.map(a =>
                  `<option value="${a.value}" ${entrance.animation === a.value ? 'selected' : ''}>${a.label}</option>`
                ).join('')}
              </select>
            </div>
            <div class="style-field">
              <label>Duration: ${entrance.duration || 600}ms</label>
              <input type="range" id="entranceDuration" min="100" max="3000" step="50" value="${entrance.duration || 600}">
            </div>
            <div class="style-field">
              <label>Delay: ${entrance.delay || 0}ms</label>
              <input type="range" id="entranceDelay" min="0" max="3000" step="50" value="${entrance.delay || 0}">
            </div>
            <div class="style-field">
              <label>Easing</label>
              <select id="entranceEasing">
                <option value="ease" ${entrance.easing === 'ease' || !entrance.easing ? 'selected' : ''}>Ease</option>
                <option value="ease-out" ${entrance.easing === 'ease-out' ? 'selected' : ''}>Ease Out</option>
                <option value="ease-in-out" ${entrance.easing === 'ease-in-out' ? 'selected' : ''}>Ease In Out</option>
                <option value="linear" ${entrance.easing === 'linear' ? 'selected' : ''}>Linear</option>
                <option value="cubic-bezier(0.34, 1.56, 0.64, 1)" ${entrance.easing === 'cubic-bezier(0.34, 1.56, 0.64, 1)' ? 'selected' : ''}>Overshoot</option>
              </select>
            </div>
            <div class="style-field">
              <label>Trigger</label>
              <select id="entranceTrigger">
                <option value="viewport" ${entrance.trigger === 'viewport' || !entrance.trigger ? 'selected' : ''}>When in viewport</option>
                <option value="load" ${entrance.trigger === 'load' ? 'selected' : ''}>On page load</option>
              </select>
            </div>
            <button type="button" class="btn btn-sm" id="entrancePreview">▶ Preview animation</button>
          </div>
        </div>
      </div>

      <div class="style-section">
        <div class="style-section-header" data-section="hover">
          Hover Effect ${hoverEnabled ? '<span class="badge-active">ON</span>' : ''}
        </div>
        <div class="style-section-body ${hoverEnabled ? '' : 'collapsed'}">
          <div class="style-field">
            <label>Effect on hover</label>
            <select id="hoverEffect">
              ${HOVER_EFFECTS.map(h =>
                `<option value="${h.value}" ${(hover.effect || 'none') === h.value ? 'selected' : ''}>${h.label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="style-field" id="hoverIntensityField">
            <label>Intensity: ${hover.intensity ?? 100}%</label>
            <input type="range" id="hoverIntensity" min="10" max="200" step="5" value="${hover.intensity ?? 100}">
          </div>
          <div class="style-field">
            <label>Duration: ${hover.duration || 300}ms</label>
            <input type="range" id="hoverDuration" min="100" max="1000" step="50" value="${hover.duration || 300}">
          </div>
        </div>
      </div>

      <div class="style-section">
        <div class="style-section-header" data-section="scroll">Scroll Behavior</div>
        <div class="style-section-body">
          <div class="style-field">
            <label class="checkbox-label">
              <input type="checkbox" id="parallaxToggle" ${node.props?.parallax ? 'checked' : ''}> Parallax on scroll
            </label>
          </div>
          <div class="style-field" id="parallaxField">
            <label>Parallax strength: ${node.props?.parallaxStrength || 30}</label>
            <input type="range" id="parallaxStrength" min="5" max="100" step="5" value="${node.props?.parallaxStrength || 30}">
          </div>
        </div>
      </div>
    `;

    attach(node);
  }

  function attach(node) {
    const el = panelEl();
    const nodeId = node.id;

    // Section collapse
    el.querySelectorAll('.style-section-header').forEach(h => {
      h.addEventListener('click', () => {
        h.classList.toggle('collapsed');
        h.nextElementSibling.classList.toggle('collapsed');
      });
    });

    // Entrance toggle
    const toggle = el.querySelector('#entranceToggle');
    const controls = el.querySelector('#entranceControls');
    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        Store.dispatch(Commands.setAnimation(nodeId, 'entrance', {
          animation: 'fade-up', duration: 600, delay: 0, easing: 'ease-out', trigger: 'viewport'
        }));
      } else {
        Store.dispatch(Commands.setAnimation(nodeId, 'entrance', null));
      }
    });

    const readEntrance = () => {
      const page = Store.getPage();
      return page.nodes[nodeId]?.animations?.entrance || {};
    };

    const updateEntrance = (patch) => {
      Store.dispatch(Commands.setAnimation(nodeId, 'entrance', { ...readEntrance(), ...patch }));
    };

    if (controls) {
      controls.classList.toggle('hidden', !toggle.checked);

      el.querySelector('#entranceType').addEventListener('change', e => updateEntrance({ animation: e.target.value }));

      const dur = el.querySelector('#entranceDuration');
      dur.addEventListener('input', e => {
        updateEntrance({ duration: Number(e.target.value) });
        dur.previousElementSibling.textContent = `Duration: ${e.target.value}ms`;
      });

      const delay = el.querySelector('#entranceDelay');
      delay.addEventListener('input', e => {
        updateEntrance({ delay: Number(e.target.value) });
        delay.previousElementSibling.textContent = `Delay: ${e.target.value}ms`;
      });

      el.querySelector('#entranceEasing').addEventListener('change', e => updateEntrance({ easing: e.target.value }));
      el.querySelector('#entranceTrigger').addEventListener('change', e => updateEntrance({ trigger: e.target.value }));

      el.querySelector('#entrancePreview').addEventListener('click', () => {
        const cfg = readEntrance();
        previewEntrance(nodeId, cfg);
      });
    }

    // Hover effect
    el.querySelector('#hoverEffect').addEventListener('change', e => {
      const val = e.target.value;
      if (val === 'none') {
        Store.dispatch(Commands.setAnimation(nodeId, 'hover', null));
      } else {
        Store.dispatch(Commands.setAnimation(nodeId, 'hover', {
          effect: val, intensity: 100, duration: 300
        }));
      }
    });

    const hoverIntensity = el.querySelector('#hoverIntensity');
    if (hoverIntensity) {
      hoverIntensity.addEventListener('input', e => {
        const page = Store.getPage();
        const h = page.nodes[nodeId]?.animations?.hover || {};
        Store.dispatch(Commands.setAnimation(nodeId, 'hover', { ...h, intensity: Number(e.target.value) }));
        hoverIntensity.previousElementSibling.textContent = `Intensity: ${e.target.value}%`;
      });
    }

    const hoverDuration = el.querySelector('#hoverDuration');
    if (hoverDuration) {
      hoverDuration.addEventListener('input', e => {
        const page = Store.getPage();
        const h = page.nodes[nodeId]?.animations?.hover || {};
        Store.dispatch(Commands.setAnimation(nodeId, 'hover', { ...h, duration: Number(e.target.value) }));
        hoverDuration.previousElementSibling.textContent = `Duration: ${e.target.value}ms`;
      });
    }

    // Parallax
    el.querySelector('#parallaxToggle').addEventListener('change', e => {
      Store.dispatch(Commands.setProp(nodeId, 'parallax', e.target.checked));
    });
    const pStr = el.querySelector('#parallaxStrength');
    pStr.addEventListener('input', e => {
      Store.dispatch(Commands.setProp(nodeId, 'parallaxStrength', Number(e.target.value)));
      pStr.previousElementSibling.textContent = `Parallax strength: ${e.target.value}`;
    });
  }

  // Instant in-canvas preview of an entrance animation
  function previewEntrance(nodeId, cfg) {
    const dom = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!dom) return;

    const keyframes = {
      'fade-up':    [{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' }],
      'fade-down':  [{ opacity: 0, transform: 'translateY(-40px)' }, { opacity: 1, transform: 'none' }],
      'fade-left':  [{ opacity: 0, transform: 'translateX(-40px)' }, { opacity: 1, transform: 'none' }],
      'fade-right': [{ opacity: 0, transform: 'translateX(40px)' }, { opacity: 1, transform: 'none' }],
      'fade-in':    [{ opacity: 0 }, { opacity: 1 }],
      'zoom-in':    [{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'none' }],
      'zoom-out':   [{ opacity: 0, transform: 'scale(1.4)' }, { opacity: 1, transform: 'none' }],
      'bounce-in':  [{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'none' }],
      'flip-up':    [{ opacity: 0, transform: 'perspective(600px) rotateX(70deg)' }, { opacity: 1, transform: 'none' }],
      'rotate-in':  [{ opacity: 0, transform: 'rotate(-15deg) scale(0.9)' }, { opacity: 1, transform: 'none' }]
    };

    const frames = keyframes[cfg.animation] || keyframes['fade-up'];
    dom.animate(frames, {
      duration: cfg.duration || 600,
      delay: cfg.delay || 0,
      easing: cfg.easing || 'ease-out',
      fill: 'both'
    });
  }

  return { render, ENTRANCE_ANIMATIONS, HOVER_EFFECTS, previewEntrance };
})();
