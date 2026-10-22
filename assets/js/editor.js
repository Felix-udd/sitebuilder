// Main editor orchestrator: wires Store → panels/canvas/layers, handles topbar,
// palette, breadcrumbs, context menu, keyboard shortcuts, save/publish/preview.

const Editor = (() => {
  let pageId = 0;
  let zoom = 1;

  // ---------- INIT ----------

  async function init() {
    const params = new URLSearchParams(location.search);
    pageId = Number(params.get('id')) || 0;

    // Load page or create new
    if (pageId > 0) {
      try {
        const res = await fetch(`api/load.php?id=${pageId}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        Store.loadFromSerialized(data.content);
        document.getElementById('pageNameInput').value = data.name || 'Untitled Page';
      } catch (e) {
        console.error('Load failed:', e);
        showToast('Failed to load page: ' + e.message, true);
        Store.setPage(Store.createEmptyPage());
      }
    } else {
      Store.setPage(Store.createEmptyPage());
    }

    buildPalette();
    bindTopbar();
    bindSidebarTabs();
    bindSidebarControls();
    bindPanelTabs();
    bindContextMenu();
    bindShortcuts();

    // React to every store change
    Store.subscribe(onStoreChange);

    // Initial render
    onStoreChange();

    // Click empty canvas deselects
    document.getElementById('canvasViewport').addEventListener('click', (e) => {
      if (e.target.id === 'canvasViewport' || e.target.id === 'canvasPage') {
        Store.setSelectedId(null);
      }
    });
  }

  function onStoreChange() {
    Canvas.render();
    applyZoom();
    Layers.render();
    renderBreadcrumb();
    renderActivePanel();
    updateTopbar();
    updateSaveStatus();

    // Keep the topbar name in sync with page settings
    const input = document.getElementById('pageNameInput');
    const title = Store.getPage()?.settings?.pageTitle;
    if (input && document.activeElement !== input && title && input.value !== title) {
      input.value = title;
    }
  }

  // ---------- PALETTE ----------

  function buildPalette(filter = '') {
    const wrap = document.getElementById('paletteCategories');
    const cats = typeof BLOCK_CATEGORIES !== 'undefined' ? BLOCK_CATEGORIES : {};
    const q = filter.toLowerCase();

    let html = '';
    for (const [catKey, catDef] of Object.entries(cats)) {
      const blocks = Object.entries(BLOCK_REGISTRY)
        .filter(([, def]) => def.category === catKey)
        .filter(([, def]) => !def.hiddenInPalette)
        .filter(([, def]) => !q || def.label.toLowerCase().includes(q));
      if (blocks.length === 0) continue;

      html += `<div class="palette-category">
        <div class="palette-category-header">${escapeH(catDef.label || catKey)}</div>
        <div class="palette-grid">
          ${blocks.map(([type, def]) => `
            <div class="palette-item" draggable="true" data-block-type="${type}" title="Click to add · drag to place">
              <span class="palette-item-icon">${def.icon}</span>
              <span class="palette-item-label">${escapeH(def.label)}</span>
            </div>`).join('')}
        </div>
      </div>`;
    }
    wrap.innerHTML = html || '<div class="panel-empty">No blocks match.</div>';

    // Drag start + click to add
    wrap.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        Canvas.startPaletteDrag(e, item.dataset.blockType);
      });
      // Single click inserts into the selected container (accessible alternative)
      item.addEventListener('click', () => {
        insertBlock(item.dataset.blockType);
      });
    });
  }

  function insertBlock(blockType, parentId = null, index = -1) {
    const page = Store.getPage();
    if (!page) return;

    if (!parentId) {
      // Default: into selected container, else into root
      const sel = Store.getSelectedId();
      if (sel && page.nodes[sel] && NodeUtils.canHaveChildren(page.nodes[sel].type)) {
        parentId = sel;
        index = page.nodes[sel].children.length;
      } else {
        parentId = page.rootId;
        index = page.nodes[page.rootId].children.length;
      }
    }

    const def = BLOCK_REGISTRY[blockType];
    if (!def) return;

    const node = {
      id: NodeUtils.genId(),
      type: blockType,
      children: [],
      props: JSON.parse(JSON.stringify(def.defaultProps || {})),
      style: { base: {} },
      animations: {},
      meta: {}
    };

    // Navbar seeds its default links as real child `nav-link` nodes so each
    // link can be selected and styled individually from the start.
    const extraNodes = {};
    if (blockType === 'navbar') {
      const raw = String(node.props.links || '').trim();
      raw.split('|').map(s => s.trim()).filter(Boolean).forEach(pair => {
        const idx = pair.indexOf(':');
        const label = (idx === -1 ? pair : pair.slice(0, idx)).trim();
        const url = (idx === -1 ? '#' : pair.slice(idx + 1)).trim() || '#';
        if (!label) return;
        const lid = NodeUtils.genId('nl');
        extraNodes[lid] = {
          id: lid, type: 'nav-link', children: [],
          props: { label, url, newTab: false },
          style: { base: {} }, animations: {}, meta: {}
        };
        node.children.push(lid);
      });
      node.props.links = '';
    }

    const hasExtras = Object.keys(extraNodes).length > 0;
    const cmd = hasExtras ? {
      type: 'ADD_SUBTREE',
      validate(pg) {
        const parent = pg.nodes[parentId];
        return !!parent && NodeUtils.canBeChildOf(node.type, parent.type);
      },
      apply(pg) {
        const np = NodeUtils.deepClone(pg);
        np.nodes[node.id] = node;
        Object.assign(np.nodes, extraNodes);
        const parent = np.nodes[parentId];
        if (index < 0 || index > parent.children.length) parent.children.push(node.id);
        else parent.children.splice(index, 0, node.id);
        return np;
      },
      coalesce: false
    } : Commands.addNode(parentId, node, index);

    if (Store.dispatch(cmd)) {
      Store.setSelectedId(node.id);
      Layers.revealNode(node.id);
      showToast(`Added ${def.label}`);
    } else {
      showToast(`Cannot place ${def.label} here`, true);
    }
  }

  // ---------- SIDEBAR / PANEL TABS ----------

  function bindSidebarTabs() {
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('layersPanel').classList.toggle('hidden', tab.dataset.tab !== 'layers');
        document.getElementById('blocksPanel').classList.toggle('hidden', tab.dataset.tab !== 'blocks');
      });
    });

    const search = document.getElementById('blockSearch');
    search.addEventListener('input', () => buildPalette(search.value));
  }

  // ---------- SIDEBAR RESIZE / COLLAPSE ----------

  const SIDEBAR_LIMITS = { min: 180, max: 560 };
  const SIDEBAR_DEFAULTS = { left: 280, right: 320 };

  function bindSidebarControls() {
    const shell = document.querySelector('.editor-shell');
    if (!shell) return;

    const state = loadSidebarState();

    applyLeftWidth(state.leftW);
    applyRightWidth(state.rightW);
    shell.classList.toggle('left-collapsed', !!state.leftCollapsed);
    shell.classList.toggle('right-collapsed', !!state.rightCollapsed);

    setupResize('left', shell, state);
    setupResize('right', shell, state);

    document.getElementById('collapseLeftBtn')?.addEventListener('click', () => {
      shell.classList.add('left-collapsed');
      state.leftCollapsed = true;
      persistSidebarState(state);
    });
    document.getElementById('collapseRightBtn')?.addEventListener('click', () => {
      shell.classList.add('right-collapsed');
      state.rightCollapsed = true;
      persistSidebarState(state);
    });
    document.getElementById('expandLeftBtn')?.addEventListener('click', () => {
      shell.classList.remove('left-collapsed');
      state.leftCollapsed = false;
      persistSidebarState(state);
      setTimeout(() => transmuteAll(), 230);
    });
    document.getElementById('expandRightBtn')?.addEventListener('click', () => {
      shell.classList.remove('right-collapsed');
      state.rightCollapsed = false;
      persistSidebarState(state);
      setTimeout(() => transmuteAll(), 230);
    });
  }

  function transmuteAll() {
    // Re-fit canvas after layout change (responsive breakpoints recompute).
    if (typeof Canvas !== 'undefined' && Canvas.render) Canvas.render();
  }

  function applyLeftWidth(w) {
    document.documentElement.style.setProperty('--left-w', clampWidth(w) + 'px');
  }
  function applyRightWidth(w) {
    document.documentElement.style.setProperty('--right-w', clampWidth(w) + 'px');
  }
  function clampWidth(w) {
    const n = Number(w) || 0;
    return Math.max(SIDEBAR_LIMITS.min, Math.min(SIDEBAR_LIMITS.max, Math.round(n)));
  }

  function setupResize(side, shell, state) {
    const handle = document.getElementById(side === 'left' ? 'leftResizeHandle' : 'rightResizeHandle');
    if (!handle) return;
    let dragging = false;

    handle.addEventListener('pointerdown', (e) => {
      if (shell.classList.contains(side + '-collapsed')) return;
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('is-active');
      shell.classList.add('resizing');
      document.body.classList.add('sb-col-resizing');
      e.preventDefault();
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const shellRect = shell.getBoundingClientRect();
      let w = side === 'left' ? e.clientX - shellRect.left : shellRect.right - e.clientX;
      w = clampWidth(w);
      if (side === 'left') {
        applyLeftWidth(w);
        state.leftW = w;
      } else {
        applyRightWidth(w);
        state.rightW = w;
      }
    });

    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      handle.classList.remove('is-active');
      shell.classList.remove('resizing');
      document.body.classList.remove('sb-col-resizing');
      persistSidebarState(state);
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function loadSidebarState() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('sb.sidebars') || '{}') || {}; } catch (_) {}
    return {
      leftW: clampWidth(s.leftW || SIDEBAR_DEFAULTS.left),
      rightW: clampWidth(s.rightW || SIDEBAR_DEFAULTS.right),
      leftCollapsed: !!s.leftCollapsed,
      rightCollapsed: !!s.rightCollapsed
    };
  }

  function persistSidebarState(state) {
    try { localStorage.setItem('sb.sidebars', JSON.stringify(state)); } catch (_) {}
  }

  let activePanelTab = 'style';
  let lastPanelKey = null;

  function bindPanelTabs() {
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activePanelTab = tab.dataset.tab;
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        lastPanelKey = null;
        renderActivePanel();
      });
    });
  }

  // Re-render the active panel only when its context changes (selection /
  // breakpoint / tab) — NOT on every keystroke, so input focus is preserved.
  function renderActivePanel(force = false) {
    const selId = Store.getSelectedId();
    const key = `${activePanelTab}|${selId || 'none'}|${Store.getBreakpoint()}`;
    if (!force && key === lastPanelKey) return;
    lastPanelKey = key;

    const node = selId ? Store.getPage().nodes[selId] : null;

    // Toggle panel visibility
    ['stylePanel', 'contentPanel', 'animationPanel', 'settingsPanel'].forEach(id => {
      document.getElementById(id).classList.add('hidden');
    });
    const map = { style: 'stylePanel', content: 'contentPanel', animation: 'animationPanel', settings: 'settingsPanel' };
    document.getElementById(map[activePanelTab]).classList.remove('hidden');

    if (activePanelTab === 'settings') {
      renderSettingsPanel(node);
      return;
    }
    if (!node) {
      // Show "empty" message in active panel
      const el = document.getElementById(map[activePanelTab]);
      el.innerHTML = '<div class="panel-empty">Select an element to edit.</div>';
      return;
    }

    if (activePanelTab === 'style') StylePanel.render(node);
    else if (activePanelTab === 'content') PropsPanel.render(node);
    else if (activePanelTab === 'animation') AnimationPanel.render(node);
  }

  function renderSettingsPanel(node) {
    const el = document.getElementById('settingsPanel');
    const page = Store.getPage();

    if (node) {
      // Node-level settings
      const def = BLOCK_REGISTRY[node.type];
      el.innerHTML = `
        <div class="style-section">
          <div class="style-section-header">Element</div>
          <div class="style-section-body">
            <div class="field-row"><label>Type</label><input type="text" value="${escapeA(node.type)}" disabled></div>
            <div class="field-row"><label>ID</label><input type="text" value="${escapeA(node.id)}" disabled></div>
            <div class="field-row"><label>HTML tag override</label>
              <select data-node-tag>
                ${['default','div','section','article','aside','header','footer','main','nav','h1','h2','h3','p','span'].map(t =>
                  `<option value="${t === 'default' ? '' : t}" ${(node.meta?.tag || '') === (t === 'default' ? '' : t) ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
            <div class="field-row"><label>Anchor ID</label>
              <input type="text" data-node-anchor value="${escapeA(node.meta?.anchorId || '')}" placeholder="services">
            </div>
            <div class="field-row"><label>CSS classes (space separated)</label>
              <input type="text" data-node-class value="${escapeA(node.meta?.cssClass || (node.meta?.cssClasses || []).join(' ') || '')}" placeholder="button-primary card-shadow">
              <small class="field-help">Assign classes created in Page Settings → Reusable CSS classes.</small>
            </div>
          </div>
        </div>
        <div class="style-section">
          <div class="style-section-header">Accessibility</div>
          <div class="style-section-body">
            <div class="field-row"><label>ARIA label</label>
              <input type="text" data-node-aria value="${escapeA(node.meta?.ariaLabel || '')}">
            </div>
          </div>
        </div>
        <div class="panel-actions">
          <button class="btn btn-sm" data-action="duplicate">Duplicate</button>
          <button class="btn btn-sm btn-danger" data-action="delete">Delete</button>
        </div>
      `;

      el.querySelector('[data-node-tag]')?.addEventListener('change', e =>
        Store.dispatch(setMeta(node.id, 'tag', e.target.value)));
      el.querySelector('[data-node-anchor]')?.addEventListener('input', e =>
        Store.dispatch(setMeta(node.id, 'anchorId', e.target.value)));
      el.querySelector('[data-node-class]')?.addEventListener('input', e =>
        Store.dispatch(setMeta(node.id, 'cssClass', e.target.value)));
      el.querySelector('[data-node-aria]')?.addEventListener('input', e =>
        Store.dispatch(setMeta(node.id, 'ariaLabel', e.target.value)));
      el.querySelector('[data-action="duplicate"]')?.addEventListener('click', () => Store.dispatch(Commands.duplicateNode(node.id)));
      el.querySelector('[data-action="delete"]')?.addEventListener('click', () => Store.dispatch(Commands.removeNode(node.id)));
    } else {
      // Page-level settings
      const s = page.settings;
      el.innerHTML = `
        <div class="style-section">
          <div class="style-section-header">SEO</div>
          <div class="style-section-body">
            <div class="field-row"><label>Page title</label><input type="text" data-setting="pageTitle" value="${escapeA(s.pageTitle || '')}"></div>
            <div class="field-row"><label>Description</label><textarea data-setting="pageDescription" rows="3">${escapeH(s.pageDescription || '')}</textarea></div>
            <div class="field-row"><label>Favicon URL</label><input type="url" data-setting="favicon" value="${escapeA(s.favicon || '')}"></div>
          </div>
        </div>
        <div class="style-section">
          <div class="style-section-header">Social (OG)</div>
          <div class="style-section-body">
            <div class="field-row"><label>OG title</label><input type="text" data-setting="ogTitle" value="${escapeA(s.ogTitle || '')}"></div>
            <div class="field-row"><label>OG description</label><input type="text" data-setting="ogDescription" value="${escapeA(s.ogDescription || '')}"></div>
            <div class="field-row"><label>OG image URL</label><input type="url" data-setting="ogImage" value="${escapeA(s.ogImage || '')}"></div>
          </div>
        </div>
        <div class="style-section">
          <div class="style-section-header">Layout</div>
          <div class="style-section-body">
            <div class="field-row"><label>Page background</label>
              <div class="color-input-row">
                <input type="color" data-setting-color="pageBackground" value="${escapeA(s.pageBackground || '#FFFFFF')}">
                <input type="text" data-setting="pageBackground" value="${escapeA(s.pageBackground || '')}">
              </div>
            </div>
            <div class="field-row"><label>Font family</label><input type="text" data-setting="fontFamily" value="${escapeA(s.fontFamily || '')}"></div>
            <div class="field-row"><label>Max content width</label><input type="text" data-setting="maxContentWidth" value="${escapeA(s.maxContentWidth || '')}"></div>
            <div class="field-row"><label>Tablet breakpoint (px)</label><input type="number" min="320" max="1920" data-breakpoint="tablet" value="${Number(s.breakpoints?.tablet || 991)}"></div>
            <div class="field-row"><label>Mobile breakpoint (px)</label><input type="number" min="240" max="1200" data-breakpoint="mobile" value="${Number(s.breakpoints?.mobile || 479)}"></div>
          </div>
        </div>
        <div class="style-section">
          <div class="style-section-header">Custom CSS (page-wide)</div>
          <div class="style-section-body">
            <textarea data-custom-page-css rows="8" class="json-input" spellcheck="false" placeholder="/* page-wide CSS */">${escapeH(page.customCSS || '')}</textarea>
          </div>
        </div>
        <div class="style-section">
          <div class="style-section-header">Reusable CSS classes</div>
          <div class="style-section-body">
            <p class="field-help">Create shared class rules here, then assign the class name to any element in its Settings tab. Editing a class updates every element using it.</p>
            <div class="field-row"><label>Class name</label><input type="text" id="classStyleName" placeholder="button-primary"></div>
            <div class="field-row"><label>CSS property</label><input type="text" id="classStyleProperty" placeholder="background-color"></div>
            <div class="field-row"><label>CSS value</label><input type="text" id="classStyleValue" placeholder="#146EF5"></div>
            <button type="button" class="btn btn-sm" id="saveClassStyleBtn">Save class rule</button>
            <div id="classStyleList" class="class-style-list">${renderClassStyles(page)}</div>
          </div>
        </div>
        <div class="style-section">
          <div class="style-section-header">Design Tokens</div>
          <div class="style-section-body">
            ${renderTokens(page)}
          </div>
        </div>
      `;

      el.querySelectorAll('[data-setting]').forEach(input => {
        const evt = input.tagName === 'SELECT' ? 'change' : 'input';
        input.addEventListener(evt, () => Store.dispatch(Commands.setSetting(input.dataset.setting, input.value)));
      });
      el.querySelectorAll('[data-breakpoint]').forEach(input => input.addEventListener('change', () => {
        const value = Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) || Number(input.defaultValue)));
        input.value = value;
        const nextSettings = JSON.parse(JSON.stringify(Store.getPage().settings || {}));
        nextSettings.breakpoints = { ...(nextSettings.breakpoints || {tablet:991,mobile:479}), [input.dataset.breakpoint]: value };
        Store.dispatch({type:'SET_BREAKPOINT_SETTINGS',validate:()=>true,apply(page){const next=JSON.parse(JSON.stringify(page));next.settings={...(next.settings||{}),breakpoints:nextSettings.breakpoints};return next;},inverse(){return this;}});
      }));
      el.querySelectorAll('[data-setting-color]').forEach(picker => {
        picker.addEventListener('input', () => {
          const text = el.querySelector(`[data-setting="${picker.dataset.settingColor}"]`);
          if (text) text.value = picker.value;
          Store.dispatch(Commands.setSetting(picker.dataset.settingColor, picker.value));
        });
      });
      el.querySelector('[data-custom-page-css]')?.addEventListener('input', e =>
        Store.dispatch(Commands.setCustomCSS(e.target.value)));
      el.querySelector('#saveClassStyleBtn')?.addEventListener('click', () => {
        const name = (el.querySelector('#classStyleName')?.value || '').trim().replace(/[^A-Za-z0-9_-]/g, '');
        const prop = (el.querySelector('#classStyleProperty')?.value || '').trim().toLowerCase();
        const value = (el.querySelector('#classStyleValue')?.value || '').trim();
        if (!name || !/^(--[a-z0-9_-]+|[a-z][a-z0-9-]*)$/.test(prop) || !value || /[{}<>;]/.test(value)) {
          alert('Enter a valid class name, CSS property and CSS value.'); return;
        }
        const current = JSON.parse(JSON.stringify(Store.getPage().classStyles || {}));
        current[name] = { ...(current[name] || {}), [prop]: value };
        Store.dispatch({type:'SET_CLASS_STYLES', validate:()=>true, apply(page){const next=JSON.parse(JSON.stringify(page));next.classStyles=current;return next;}, inverse(){return this;}});
        refreshPanels(true);
      });
      el.querySelectorAll('[data-delete-class-style]').forEach(btn => btn.addEventListener('click', () => {
        const current = JSON.parse(JSON.stringify(Store.getPage().classStyles || {})); delete current[btn.dataset.deleteClassStyle];
        Store.dispatch({type:'DELETE_CLASS_STYLE',validate:()=>true,apply(page){const next=JSON.parse(JSON.stringify(page));next.classStyles=current;return next;},inverse(){return this;}});
        refreshPanels(true);
      }));
      el.querySelectorAll('[data-token]').forEach(input => {
        input.addEventListener('input', () => {
          const [cat, name] = input.dataset.token.split('.');
          Store.dispatch(Commands.setToken(cat, name, input.value));
        });
      });
    }
  }

  function renderClassStyles(page) {
    const classes = page.classStyles || {};
    const entries = Object.entries(classes);
    if (!entries.length) return '<p class="field-help">No shared classes yet.</p>';
    return entries.map(([name, rules]) => `<div class="class-style-item"><strong>.${escapeH(name)}</strong><span>${Object.entries(rules || {}).map(([p,v]) => `${escapeH(p)}: ${escapeH(v)}`).join('; ')}</span><button type="button" class="btn btn-sm" data-delete-class-style="${escapeA(name)}">Delete</button></div>`).join('');
  }

  function renderTokens(page) {
    const cats = page.tokens || {};
    return Object.entries(cats).map(([cat, values]) => `
      <div class="token-group">
        <div class="token-group-title">${escapeH(cat)}</div>
        ${Object.entries(values).map(([name, value]) => `
          <div class="field-row field-row--inline">
            <label>${escapeH(name)}</label>
            <input type="text" data-token="${cat}.${name}" value="${escapeA(value)}">
          </div>`).join('')}
      </div>`).join('');
  }

  // Generic meta command (not in Commands — small local implementation)
  function setMeta(nodeId, key, value) {
    let old;
    return {
      type: 'SET_META',
      validate(page) {
        if (!page.nodes[nodeId]) return false;
        old = page.nodes[nodeId].meta?.[key];
        return true;
      },
      apply(page) {
        const np = JSON.parse(JSON.stringify(page));
        if (!np.nodes[nodeId].meta) np.nodes[nodeId].meta = {};
        if (value === '' || value == null) delete np.nodes[nodeId].meta[key];
        else np.nodes[nodeId].meta[key] = value;
        return np;
      },
      inverse() { return setMeta(nodeId, key, old); },
      coalesce: true
    };
  }

  // ---------- BREADCRUMB ----------

  function renderBreadcrumb() {
    const bar = document.getElementById('breadcrumbBar');
    const page = Store.getPage();
    const selId = Store.getSelectedId();
    if (!page) { bar.innerHTML = ''; return; }

    if (!selId) {
      bar.innerHTML = `<span class="breadcrumb-item active">Page</span>`;
      return;
    }

    const chain = NodeUtils.getBreadcrumb(page, selId);
    bar.innerHTML = `<span class="breadcrumb-item" data-crumb-root>Page</span>` +
      chain.map((node, i) => {
        const def = BLOCK_REGISTRY[node.type];
        const label = def ? def.label : node.type;
        const last = i === chain.length - 1;
        return `<span class="crumb-sep">›</span><span class="breadcrumb-item ${last ? 'active' : ''}" data-crumb="${node.id}">${escapeH(label)}</span>`;
      }).join('');

    bar.querySelectorAll('[data-crumb]').forEach(c => {
      c.addEventListener('click', () => Store.setSelectedId(c.dataset.crumb));
    });
    bar.querySelector('[data-crumb-root]')?.addEventListener('click', () => Store.setSelectedId(null));
  }

  // ---------- TOPBAR ----------

  function bindTopbar() {
    document.getElementById('undoBtn').addEventListener('click', () => {
      Store.undo();
      refreshPanels(true);
    });
    document.getElementById('redoBtn').addEventListener('click', () => {
      Store.redo();
      refreshPanels(true);
    });

    // Breakpoint switcher
    document.querySelectorAll('#responsiveSwitcher button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#responsiveSwitcher button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Store.setBreakpoint(btn.dataset.bp);
      });
    });

    // Zoom
    document.getElementById('zoomInBtn').addEventListener('click', () => setZoom(zoom + 0.1));
    document.getElementById('zoomOutBtn').addEventListener('click', () => setZoom(zoom - 0.1));

    // Page name
    document.getElementById('pageNameInput').addEventListener('input', e => {
      Store.dispatch(Commands.setSetting('pageTitle', e.target.value));
      // Also update in-page name for save payload
      const page = Store.getPage();
      if (page) page.name = e.target.value;
    });

    document.getElementById('saveBtn').addEventListener('click', save);
    document.getElementById('publishBtn').addEventListener('click', publish);
    document.getElementById('previewBtn').addEventListener('click', preview);
    document.getElementById('exportBtn').addEventListener('click', exportPage);

    document.getElementById('historyBtn').addEventListener('click', openHistory);
    document.getElementById('historyClose').addEventListener('click', closeHistory);
    document.getElementById('historyModal').addEventListener('click', (e) => {
      if (e.target.id === 'historyModal') closeHistory();
    });
  }

  function setZoom(z) {
    zoom = Math.max(0.25, Math.min(2, Math.round(z * 100) / 100));
    applyZoom();
  }

  function applyZoom() {
    const pageEl = document.getElementById('canvasPage');
    if (!pageEl) return;
    pageEl.style.transform = `scale(${zoom})`;
    pageEl.style.transformOrigin = 'top center';
    // Compensate width so the scaled page still fills the viewport nicely
    pageEl.style.width = zoom < 1 ? `${100 / zoom}%` : '100%';
    document.getElementById('zoomLevel').textContent = Math.round(zoom * 100) + '%';
  }

  function updateTopbar() {
    document.getElementById('undoBtn').disabled = !Store.canUndo();
    document.getElementById('redoBtn').disabled = !Store.canRedo();
  }

  function updateSaveStatus() {
    const el = document.getElementById('saveStatus');
    if (Store.isDirty()) {
      el.textContent = 'Unsaved changes';
      el.className = 'save-status dirty';
    } else {
      el.textContent = 'Saved';
      el.className = 'save-status saved';
    }
  }

  // ---------- SAVE / PUBLISH / PREVIEW / EXPORT ----------

  async function save() {
    const page = Store.getPage();
    const name = document.getElementById('pageNameInput').value.trim() || 'Untitled Page';

    try {
      const res = await fetch('api/save.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pageId, name, content: Store.serialize() })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      pageId = data.id;
      Store.markSaved();
      showToast('Saved');

      // Update URL so refresh keeps working
      if (!location.search.includes('id=')) {
        history.replaceState(null, '', `editor.php?id=${pageId}`);
      }
      return data;
    } catch (e) {
      showToast('Save failed: ' + e.message, true);
      throw e;
    }
  }

  async function publish() {
    try {
      await save();
      const res = await fetch('api/publish.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pageId })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('Published → ' + data.url);
      window.open(data.url, '_blank');
    } catch (e) {
      showToast('Publish failed: ' + e.message, true);
    }
  }

  async function preview() {
    try {
      // Preview from current (possibly unsaved) content
      const res = await fetch('api/preview.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: document.getElementById('pageNameInput').value, content: Store.serialize() })
      });
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (e) {
      showToast('Preview failed: ' + e.message, true);
    }
  }

  async function exportPage() {
    try {
      const res = await fetch('api/preview.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: document.getElementById('pageNameInput').value, content: Store.serialize() })
      });
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (document.getElementById('pageNameInput').value || 'page').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.html';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('Exported HTML file');
    } catch (e) {
      showToast('Export failed: ' + e.message, true);
    }
  }

  // ---------- REVISION HISTORY ----------

  async function openHistory() {
    if (pageId <= 0) {
      showToast('Save the page first to build history', true);
      return;
    }
    const modal = document.getElementById('historyModal');
    const list = document.getElementById('historyList');
    modal.hidden = false;
    list.innerHTML = '<div class="history-empty">Loading…</div>';

    try {
      const res = await fetch(`api/revisions.php?id=${pageId}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      renderHistory(data.revisions || []);
    } catch (e) {
      list.innerHTML = `<div class="history-empty">Could not load history: ${escapeH(e.message)}</div>`;
    }
  }

  function closeHistory() {
    document.getElementById('historyModal').hidden = true;
  }

  function renderHistory(revisions) {
    const list = document.getElementById('historyList');
    if (revisions.length === 0) {
      list.innerHTML = '<div class="history-empty">No revisions yet. Save the page a few times to build history.</div>';
      return;
    }

    list.innerHTML = revisions.map(rev => {
      const date = new Date(String(rev.created_at).replace(' ', 'T'));
      const label = isNaN(date) ? rev.created_at : date.toLocaleString();
      const size = rev.size_bytes < 1024
        ? rev.size_bytes + ' B'
        : Math.round(rev.size_bytes / 1024) + ' KB';
      return `<div class="history-row">
        <div class="history-info">
          <div class="history-date">${escapeH(label)}</div>
          <div class="history-meta">Revision #${rev.id} · ${size}</div>
        </div>
        <button class="btn btn-sm" data-restore="${rev.id}">Restore</button>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-restore]').forEach(btn => {
      btn.addEventListener('click', () => restoreRevision(Number(btn.dataset.restore)));
    });
  }

  async function restoreRevision(revisionId) {
    if (!confirm('Restore this revision? The current version will be kept in history.')) return;

    try {
      const res = await fetch('api/revisions.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, revisionId })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      Store.loadFromSerialized(data.content);
      Store.setSelectedId(null);
      closeHistory();
      showToast('Revision restored');
    } catch (e) {
      showToast('Restore failed: ' + e.message, true);
    }
  }

  // ---------- CONTEXT MENU ----------

  let contextTargetId = null;
  function bindContextMenu() {
    const menu = document.getElementById('contextMenu');

    menu.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = contextTargetId;
        hideContextMenu();
        if (!id) return;
        switch (btn.dataset.action) {
          case 'duplicate': Store.dispatch(Commands.duplicateNode(id)); break;
          case 'copy': copyNode(id); break;
          case 'paste': pasteNode(id); break;
          case 'moveUp': moveRelative(id, -1); break;
          case 'moveDown': moveRelative(id, 1); break;
          case 'delete':
            Store.dispatch(Commands.removeNode(id));
            Store.setSelectedId(null);
            break;
        }
      });
    });

    document.addEventListener('click', hideContextMenu);
    document.addEventListener('scroll', hideContextMenu, true);
  }

  function showContextMenu(x, y, nodeId) {
    contextTargetId = nodeId;
    const menu = document.getElementById('contextMenu');
    menu.hidden = false;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    // Keep on screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
  }
  function hideContextMenu() {
    document.getElementById('contextMenu').hidden = true;
  }

  function moveRelative(id, dir) {
    const page = Store.getPage();
    const parentId = NodeUtils.getParentId(page, id);
    if (!parentId) return;
    const idx = NodeUtils.getIndexInParent(page, id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= page.nodes[parentId].children.length) return;
    Store.dispatch(Commands.moveNode(id, parentId, newIdx));
  }

  let clipboard = null;
  function copyNode(id) {
    const page = Store.getPage();
    // Deep-copy subtree into clipboard
    const subtree = {};
    const collect = (nid) => {
      const n = page.nodes[nid];
      if (!n) return;
      subtree[nid] = JSON.parse(JSON.stringify(n));
      (n.children || []).forEach(collect);
    };
    collect(id);
    clipboard = { rootId: id, subtree };
    showToast('Copied');
  }

  function pasteNode(targetId) {
    if (!clipboard) return;
    const page = Store.getPage();
    const target = page.nodes[targetId];
    if (!target) return;

    // Paste as child if container, else as sibling after target
    let parentId, index;
    if (NodeUtils.canHaveChildren(target.type)) {
      parentId = targetId;
      index = target.children.length;
    } else {
      parentId = NodeUtils.getParentId(page, targetId);
      index = NodeUtils.getIndexInParent(page, targetId) + 1;
    }
    if (!parentId) return;

    // Clone with fresh ids
    const idMap = {};
    Object.keys(clipboard.subtree).forEach(oldId => { idMap[oldId] = NodeUtils.genId(); });

    let firstNewId = null;
    const clonedNodes = {};
    Object.entries(clipboard.subtree).forEach(([oldId, node]) => {
      const clone = JSON.parse(JSON.stringify(node));
      clone.id = idMap[oldId];
      clone.children = (node.children || []).map(cid => idMap[cid]).filter(Boolean);
      clonedNodes[clone.id] = clone;
      if (oldId === clipboard.rootId) firstNewId = clone.id;
    });

    const cmd = {
      type: 'PASTE_SUBTREE',
      validate() { return !!firstNewId; },
      apply(pg) {
        const np = JSON.parse(JSON.stringify(pg));
        Object.assign(np.nodes, clonedNodes);
        const parent = np.nodes[parentId];
        if (index < 0 || index > parent.children.length) parent.children.push(firstNewId);
        else parent.children.splice(index, 0, firstNewId);
        return np;
      },
      inverse(pg) { return Commands.removeNode(firstNewId); },
      coalesce: false
    };
    if (Store.dispatch(cmd)) {
      Store.setSelectedId(firstNewId);
      showToast('Pasted');
    }
  }

  // ---------- KEYBOARD SHORTCUTS ----------

  function bindShortcuts() {
    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); Store.undo(); refreshPanels(true); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); Store.redo(); refreshPanels(true); return; }
      if (mod && e.key.toLowerCase() === 'd' && !isEditing) {
        e.preventDefault();
        const sel = Store.getSelectedId();
        if (sel) Store.dispatch(Commands.duplicateNode(sel));
        return;
      }
      if (mod && e.key.toLowerCase() === 'c' && !isEditing) {
        const sel = Store.getSelectedId();
        if (sel) copyNode(sel);
        return;
      }
      if (mod && e.key.toLowerCase() === 'v' && !isEditing) {
        const sel = Store.getSelectedId();
        if (sel) pasteNode(sel);
        return;
      }

      if (isEditing) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = Store.getSelectedId();
        if (sel) {
          e.preventDefault();
          Store.dispatch(Commands.removeNode(sel));
          Store.setSelectedId(null);
        }
        return;
      }

      if (e.key === 'Escape') {
        Store.setSelectedId(null);
        hideContextMenu();
        return;
      }

      // Arrow-key navigation up the tree (Alt+Up / Alt+Down)
      if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault();
        const sel = Store.getSelectedId();
        if (sel) {
          const parentId = NodeUtils.getParentId(Store.getPage(), sel);
          if (parentId) Store.setSelectedId(parentId);
        }
        return;
      }
      if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault();
        const sel = Store.getSelectedId();
        if (sel) {
          const kids = Store.getPage().nodes[sel]?.children || [];
          if (kids.length) Store.setSelectedId(kids[0]);
        }
        return;
      }
      // Move element with Ctrl+Arrow
      if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const sel = Store.getSelectedId();
        if (sel) moveRelative(sel, e.key === 'ArrowUp' ? -1 : 1);
        return;
      }
    });

    // Warn on unload if dirty
    window.addEventListener('beforeunload', (e) => {
      if (Store.isDirty()) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ---------- TOAST ----------

  let toastTimer = null;
  function showToast(msg, isError = false) {
    const t = document.getElementById('saveToast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' toast-error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
  }

  function escapeH(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
  function escapeA(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function refreshPanels(force = true) {
    lastPanelKey = null;
    renderActivePanel(force);
  }

  // Public node actions used by the floating canvas toolbar
  function deleteNodeById(id) {
    if (!id) return;
    Store.dispatch(Commands.removeNode(id));
    Store.setSelectedId(null);
    refreshPanels(true);
  }

  function duplicateNodeById(id) {
    if (!id) return;
    Store.dispatch(Commands.duplicateNode(id));
    refreshPanels(true);
  }

  return { init, insertBlock, showContextMenu, showToast, refreshPanels, deleteNodeById, duplicateNodeById };
})();

// Boot
document.addEventListener('DOMContentLoaded', Editor.init);
