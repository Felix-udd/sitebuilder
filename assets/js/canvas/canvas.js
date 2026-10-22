// Canvas: renders the page IR into the editing viewport.
// Handles selection, hover outlines, drag & drop (palette + reorder), inline editing.

const Canvas = (() => {
  const viewportId = 'canvasViewport';
  const pageId = 'canvasPage';

  let dragState = null; // { source: 'palette'|'node', blockType?, nodeId? }
  let dropTarget = null; // { parentId, index }
  let pointerDrag = null; // { nodeId, startX, startY, active, target, ghost, ... }
  let lastDragTime = 0;   // suppress the click that follows a drag
  let canvasSliderTimers = [];
  let richTextToolbar = null;

  // ---------- RENDER ----------

  function render() {
    const page = Store.getPage();
    const pageEl = document.getElementById(pageId);
    if (!page || !pageEl) return;

    const bp = Store.getBreakpoint();
    const root = page.nodes[page.rootId];

    // Page wrapper styles
    const pageStyle = NodeUtils.resolveStyles(root, bp);
    const pageBg = root.props?.backgroundColor || page.settings?.pageBackground || '#FFFFFF';
    pageEl.style.cssText = styleObjToCSS(pageStyle) + `background:${pageBg};min-height:600px;`;

    // Apply breakpoint viewport width to canvas
    const viewport = document.getElementById(viewportId);
    if (viewport) {
      viewport.classList.remove('bp-tablet', 'bp-mobile');
      if (bp === 'tablet') viewport.classList.add('bp-tablet');
      if (bp === 'mobile') viewport.classList.add('bp-mobile');
    }

    const html = renderChildren(page, root, bp);
    canvasSliderTimers.forEach(timer => clearInterval(timer));
    canvasSliderTimers = [];
    pageEl.innerHTML = html || renderEmptyRoot();
    initCanvasSliders(pageEl);

    // Inject page-wide + per-element custom CSS into the canvas preview
    const css = collectCustomCSS(page, root);
    if (css.trim()) {
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-canvas-custom-css', '');
      styleEl.textContent = css;
      pageEl.appendChild(styleEl);
    }

    applySelection();
    attachCanvasEvents();
  }

  function initCanvasSliders(scope) {
    scope.querySelectorAll('.sb-slider').forEach(slider => {
      const track = slider.querySelector('.sb-slider-track');
      if (!track) return;
      const slides = Array.from(track.children);
      if (!slides.length) return;
      const dots = Array.from(slider.querySelectorAll('.sb-slider-dot'));
      const prev = slider.querySelector('.sb-slider-prev');
      const next = slider.querySelector('.sb-slider-next');
      const mode = ['slide', 'fade', 'zoom'].includes(slider.dataset.transition) ? slider.dataset.transition : 'slide';
      let current = 0;
      const goTo = index => {
        const infinite = slider.dataset.infinite !== 'false';
        if (index < 0) index = infinite ? slides.length - 1 : 0;
        if (index >= slides.length) index = infinite ? 0 : slides.length - 1;
        current = index;
        if (mode === 'slide') {
          track.style.transform = `translateX(-${index * 100}%)`;
          track.style.position = 'relative';
          slides.forEach(slide => { slide.style.position = 'relative'; slide.style.inset = ''; slide.style.opacity = ''; slide.style.transform = ''; });
        } else {
          track.style.position = 'relative'; track.style.transform = 'none';
          slides.forEach((slide, i) => {
            slide.style.position = 'absolute'; slide.style.inset = '0'; slide.style.minWidth = '100%';
            slide.style.opacity = i === index ? '1' : '0';
            slide.style.transform = mode === 'zoom' && i !== index ? 'scale(1.06)' : 'scale(1)';
            slide.style.transition = 'opacity .45s ease, transform .45s ease';
            slide.style.pointerEvents = i === index ? 'auto' : 'none';
          });
        }
        dots.forEach((dot, i) => { dot.style.background = i === index ? '#146EF5' : '#CBD5E1'; dot.setAttribute('aria-current', i === index ? 'true' : 'false'); });
      };
      prev?.addEventListener('click', e => { e.stopPropagation(); goTo(current - 1); });
      next?.addEventListener('click', e => { e.stopPropagation(); goTo(current + 1); });
      dots.forEach((dot, i) => dot.addEventListener('click', e => { e.stopPropagation(); goTo(i); }));
      goTo(0);
      if (slider.dataset.autoplay === 'true' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const timer = setInterval(() => { if (!slider.matches(':hover') && !slider.contains(document.activeElement)) goTo(current + 1); }, Math.max(1500, Number(slider.dataset.interval) || 5000));
        canvasSliderTimers.push(timer);
      }
    });
  }

  function renderChildren(page, node, bp) {
    if (!node.children || node.children.length === 0) return '';
    return node.children
      .map(cid => renderNode(page, page.nodes[cid], bp))
      .filter(Boolean)
      .join('');
  }

  function renderNode(page, node, bp) {
    if (!node) return '';
    const def = BLOCK_REGISTRY[node.type];

    // Children first (recursive)
    const childrenHtml = renderChildren(page, node, bp);

    let inner;
    if (def && def.render) {
      // Registry render functions consume props + children html
      try {
        inner = def.render(node.props || {}, childrenHtml);
      } catch (e) {
        console.error('Render error for', node.type, e);
        inner = `<div style="padding:12px;background:#FEE2E2;color:#991B1B;font-size:12px;">Error rendering ${escapeH(node.type)}</div>`;
      }
    } else {
      inner = `<div style="padding:12px;color:#94A3B8;border:1px dashed #CBD5E1;">Unknown block: ${escapeH(node.type)}</div>`;
    }

    // Apply resolved styles as inline style on wrapper
    const resolved = NodeUtils.resolveStyles(node, bp);
    const wrapperStyle = styleObjToCSS(resolved);
    const p = node.props || {};
    let universalBg = '';
    if (p.backgroundType === 'color' && p.backgroundColor) universalBg = `background-color:${p.backgroundColor};`;
    else if (p.backgroundType === 'gradient') { const kind = ['linear','radial','conic'].includes(p.gradientType) ? p.gradientType : 'linear'; const stops = (p.gradientStops || ['#667eea','#764ba2']).join(','); universalBg = `background-image:${kind === 'radial' ? `radial-gradient(ellipse at center,${stops})` : kind === 'conic' ? `conic-gradient(from ${p.gradientAngle || 135}deg,${stops})` : `linear-gradient(${p.gradientAngle || 135}deg,${stops})`};`; }
    else if ((p.backgroundType === 'image' || p.backgroundType === 'video') && p.backgroundImage) {
      const posX = p.backgroundPositionX || p.backgroundPosition || 'center';
      const posY = p.backgroundPositionY || 'center';
      universalBg = `background-image:url('${String(p.backgroundImage).replace(/["'\\\n\r]/g, '')}');background-position:${posX} ${posY};background-size:${p.backgroundSize || 'cover'};background-repeat:${p.backgroundRepeat || 'no-repeat'};background-attachment:${p.backgroundAttachment || 'scroll'};`;
    }

    // Entrance animation classes for live editor preview
    const anim = node.animations || {};
    let animAttrs = '';
    if (anim.entrance && anim.entrance.animation) {
      animAttrs += ` data-entrance="${escapeA(anim.entrance.animation)}" data-entrance-duration="${anim.entrance.duration || 600}" data-entrance-delay="${anim.entrance.delay || 0}"`;
    }

    // Anchor id from Settings — surfaced so in-page links resolve in the canvas
    const anchorAttr = node.meta?.anchorId
      ? ` id="${escapeA(node.meta.anchorId)}" data-anchor="${escapeA(node.meta.anchorId)}"`
      : '';

    // Container drop-zone support
    const isContainer = NodeUtils.canHaveChildren(node.type);
    const emptyContainer = isContainer && (!node.children || node.children.length === 0)
      ? `<div class="drop-placeholder" data-empty-for="${node.id}">Drop blocks here</div>` : '';

    // Wrapper is the interactive element (selection, drag handles)
    const customClasses = Array.isArray(node.meta?.cssClasses) ? node.meta.cssClasses : String(node.meta?.cssClass || '').split(/\s+/).filter(Boolean);
    const safeClasses = customClasses.map(c => String(c).replace(/[^A-Za-z0-9_-]/g, '-')).filter(Boolean).join(' ');
    if (safeClasses) {
      const classText = safeClasses.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      inner = inner.replace(/^(\s*<[^\s>]+)/, opening => {
        if (/\sclass="[^"]*"/.test(opening)) return opening.replace(/class="([^"]*)"/, (_, existing) => `class="${existing} ${classText}"`);
        return opening + ` class="${classText}"`;
      });
    }
    const wrapperClasses = `sb-node sb-${String(node.id).replace(/[^A-Za-z0-9_-]/g, '-')} ${safeClasses}`.trim();
    return `<div class="${wrapperClasses}" data-node-id="${node.id}" data-node-type="${node.type}"${anchorAttr}${animAttrs} style="${escapeA(wrapperStyle + universalBg)}">
      ${inner}
      ${emptyContainer}
    </div>`;
  }

  function collectCustomCSS(page, node) {
    let css = '';
    if (node === page.nodes[page.rootId]) {
      css += page.customCSS || '';
      Object.entries(page.classStyles || {}).forEach(([name, declarations]) => {
        const safeName = String(name).replace(/[^A-Za-z0-9_-]/g, '');
        if (!safeName || !declarations || typeof declarations !== 'object') return;
        const rules = Object.entries(declarations).filter(([prop, value]) => /^(--[a-z0-9_-]+|[a-z][a-z0-9-]*)$/i.test(prop) && typeof value === 'string' && value.trim() && !/[{}<>;]/.test(value)).map(([prop, value]) => `${prop}:${value} !important`).join(';');
        if (rules) css += `\n.${safeName}{${rules}}\n`;
      });
    }
    if (node.meta && node.meta.customCSS) css += '\n' + node.meta.customCSS;
    const states = node.meta?.stateStyles || {};
    const pseudos = { hover: ':hover', focus: ':focus', active: ':active', 'focus-visible': ':focus-visible' };
    Object.entries(pseudos).forEach(([state, pseudo]) => {
      const declarations = Object.entries(states[state] || {}).filter(([prop, value]) => /^(--[a-z0-9_-]+|[a-z][a-z0-9-]*)$/i.test(prop) && typeof value === 'string' && value.trim() && !/[{}<>;]/.test(value)).map(([prop, value]) => `${prop}:${value} !important`).join(';');
      if (declarations) css += `\n.sb-${String(node.id).replace(/[^A-Za-z0-9_-]/g, '-')}${pseudo}{${declarations}}\n`;
    });
    (node.children || []).forEach(cid => {
      const child = page.nodes[cid];
      if (child) css += collectCustomCSS(page, child);
    });
    return css;
  }

  function renderEmptyRoot() {
    return `<div class="drop-placeholder drop-placeholder--root" data-empty-for="${Store.getPage().rootId}">
      Start building — drag blocks from the left panel
    </div>`;
  }

  // ---------- SELECTION & HOVER ----------

  function applySelection() {
    const selId = Store.getSelectedId();
    document.querySelectorAll('#canvasPage .sb-node.is-selected').forEach(el => el.classList.remove('is-selected'));
    if (selId) {
      const el = document.querySelector(`#canvasPage [data-node-id="${selId}"]`);
      if (el) {
        el.classList.add('is-selected');
        showToolbar(el);
        showResizeLayer(el);
        return;
      }
    }
    if (!selId) { hideToolbar(); hideResizeLayer(); }
  }

  function clearHighlights() {
    document.querySelectorAll('.sb-node.is-hovered').forEach(el => el.classList.remove('is-hovered'));
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  }

  // ---------- EVENTS ----------

  function attachCanvasEvents() {
    const pageEl = document.getElementById(pageId);
    if (!pageEl || pageEl._bound) return;
    pageEl._bound = true;

    // Click to select (event delegation — survives re-renders)
    pageEl.addEventListener('click', (e) => {
      // Ignore the click that fires at the end of a drag gesture
      if (Date.now() - lastDragTime < 300) { e.stopPropagation(); return; }
      const nodeEl = e.target.closest('[data-node-id]');
      if (nodeEl) {
        e.stopPropagation();
        e.preventDefault(); // block anchor navigation inside the canvas
        Store.setSelectedId(nodeEl.dataset.nodeId);
      } else {
        Store.setSelectedId(null);
      }
    });

    // Hover outline (event delegation)
    pageEl.addEventListener('mouseover', (e) => {
      clearHighlights();
      const nodeEl = e.target.closest('[data-node-id]');
      if (nodeEl) {
        nodeEl.classList.add('is-hovered');
        showToolbar(nodeEl);
      }
    });
    pageEl.addEventListener('mouseleave', () => {
      clearHighlights();
      // Keep the toolbar if a node is still selected, else hide it.
      if (!Store.getSelectedId()) hideToolbar();
    });

    // Right-click context menu
    pageEl.addEventListener('contextmenu', (e) => {
      const nodeEl = e.target.closest('[data-node-id]');
      if (nodeEl) {
        e.preventDefault();
        Store.setSelectedId(nodeEl.dataset.nodeId);
        Editor.showContextMenu(e.clientX, e.clientY, nodeEl.dataset.nodeId);
      }
    });

    // Double-click inline editing for text-bearing blocks
    pageEl.addEventListener('dblclick', (e) => {
      const nodeEl = e.target.closest('[data-node-id]');
      if (!nodeEl) return;
      const node = Store.getPage().nodes[nodeEl.dataset.nodeId];
      if (!node) return;
      const editable = resolveInlineEdit(node, nodeEl, e.target);
      if (editable) {
        e.preventDefault();
        startInlineEdit(node, editable, nodeEl);
      }
    });

    // Drag & drop from palette and reorder
    pageEl.addEventListener('dragover', onDragOver);
    pageEl.addEventListener('dragleave', onDragLeave);
    pageEl.addEventListener('drop', onDrop);

    // Direct pointer dragging of elements on the canvas (grab & move)
    pageEl.addEventListener('pointerdown', onPointerDown);
    pageEl.addEventListener('pointermove', onPointerMove);
    pageEl.addEventListener('pointerup', onPointerUp);
    pageEl.addEventListener('pointercancel', onPointerUp);

    // Node dragging (reorder within canvas)
    pageEl.addEventListener('dragstart', (e) => {
      const nodeEl = e.target.closest('[data-node-id]');
      if (nodeEl) {
        dragState = { source: 'node', nodeId: nodeEl.dataset.nodeId };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', nodeEl.dataset.nodeId);
        nodeEl.classList.add('is-dragging');
      }
    });
    pageEl.addEventListener('dragend', () => {
      dragState = null;
      clearHighlights();
      document.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
    });

    // Keep the floating toolbar anchored during scroll / resize
    const vp = document.getElementById(viewportId);
    if (vp && !vp._tbBound) {
      vp._tbBound = true;
      vp.addEventListener('scroll', refreshToolbar, { passive: true });
    }
    if (!window._tbResizeBound) {
      window._tbResizeBound = true;
      window.addEventListener('resize', refreshToolbar);
    }
  }

  function showNodeBadge(nodeEl) {
    // Legacy transient badge — superseded by the persistent floating toolbar.
    // Kept as a no-op hook so existing call sites remain safe.
  }

  // ---------- FLOATING ELEMENT TOOLBAR ----------

  let tbEl = null;
  let tbNodeId = null;

  function ensureToolbar() {
    if (tbEl) return tbEl;
    tbEl = document.createElement('div');
    tbEl.className = 'sb-el-toolbar';
    tbEl.innerHTML = `
      <span class="sb-el-tag" data-tb-tag></span>
      <button type="button" class="sb-tb" data-tb="drag" title="Drag to move">⠿</button>
      <button type="button" class="sb-tb" data-tb="duplicate" title="Duplicate">⧉</button>
      <button type="button" class="sb-tb del" data-tb="delete" title="Delete">✕</button>
    `;
    document.body.appendChild(tbEl);

    tbEl.addEventListener('pointerdown', (e) => {
      // The drag grip starts a real pointer drag on the owning node.
      const grip = e.target.closest('[data-tb="drag"]');
      if (!grip || !tbNodeId) return;
      e.preventDefault();
      e.stopPropagation();
      const nodeEl = document.querySelector(`#${pageId} [data-node-id="${tbNodeId}"]`);
      if (nodeEl) {
        pointerDrag = {
          nodeId: tbNodeId, nodeEl,
          startX: e.clientX, startY: e.clientY,
          active: true, target: null, ghost: null,
          offsetX: 0, offsetY: 0, pointerId: e.pointerId
        };
        beginDrag(e);
      }
    });

    tbEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tb]');
      if (!btn || !tbNodeId) return;
      e.preventDefault();
      e.stopPropagation();
      const id = tbNodeId;
      if (btn.dataset.tb === 'duplicate') Editor.duplicateNodeById(id);
      else if (btn.dataset.tb === 'delete') { hideToolbar(); Editor.deleteNodeById(id); }
    });

    return tbEl;
  }

  function showToolbar(nodeEl) {
    const id = nodeEl.dataset.nodeId;
    if (!id) return;
    tbNodeId = id;
    const tb = ensureToolbar();
    const tag = tb.querySelector('[data-tb-tag]');
    const def = BLOCK_REGISTRY[nodeEl.dataset.nodeType];
    if (tag) tag.textContent = (def && def.label) || nodeEl.dataset.nodeType;
    tb.classList.add('is-visible');
    positionToolbar(nodeEl);
  }

  function positionToolbar(nodeEl) {
    if (!tbEl || !tbNodeId) return;
    const r = nodeEl.getBoundingClientRect();
    // Anchor to the top-right corner of the node; flip below if clipped.
    const tbW = tbEl.offsetWidth || 140;
    let left = r.right - tbW;
    let top = r.top - (tbEl.offsetHeight || 26);
    if (top < 4) top = r.top + 2;
    if (left < 4) left = r.left + 2;
    tbEl.style.left = Math.round(left) + 'px';
    tbEl.style.top = Math.round(top) + 'px';
  }

  function hideToolbar() {
    tbNodeId = null;
    if (tbEl) tbEl.classList.remove('is-visible');
  }

  function refreshToolbar() {
    refreshResizeLayer();
    if (!tbNodeId) return;
    const nodeEl = document.querySelector(`#${pageId} [data-node-id="${tbNodeId}"]`);
    if (!nodeEl) { hideToolbar(); return; }
    positionToolbar(nodeEl);
  }

  // ---------- DRAG & DROP ----------

  // ----- Direct element dragging (pointer events) -----

  function onPointerDown(e) {
    if (e.button !== 0) return;
    // Never hijack interactions with text editing or form controls
    if (e.target.isContentEditable) return;
    if (e.target.closest('[contenteditable="true"]')) return;
    if (e.target.closest('input, textarea, select')) return;
    const nodeEl = e.target.closest('[data-node-id]');
    if (!nodeEl) return;
    pointerDrag = {
      nodeId: nodeEl.dataset.nodeId,
      nodeEl,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      target: null,
      ghost: null,
      offsetX: 0,
      offsetY: 0,
      pointerId: e.pointerId
    };
    // Don't preventDefault here — a plain click must still select the node.
  }

  function onPointerMove(e) {
    if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return;

    if (!pointerDrag.active) {
      const dist = Math.hypot(e.clientX - pointerDrag.startX, e.clientY - pointerDrag.startY);
      if (dist < 6) return; // below threshold → treat as a click
      beginDrag(e);
    }

    e.preventDefault();
    moveGhost(e.clientX, e.clientY);

    const target = computeDropTarget(e.clientX, e.clientY, pointerDrag.nodeId);
    pointerDrag.target = target;
    if (target) showDropIndicator(target);
    else document.querySelectorAll('.drop-indicator').forEach(el => el.remove());

    autoScroll(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return;
    const wasActive = pointerDrag.active;
    const target = pointerDrag.target;
    const nodeId = pointerDrag.nodeId;

    try { document.getElementById(pageId)?.releasePointerCapture(e.pointerId); } catch (err) {}

    if (wasActive) {
      lastDragTime = Date.now();
      if (target && Number.isInteger(target.index)) {
        const page = Store.getPage();
        if (page.nodes[nodeId]) {
          Store.dispatch(Commands.moveNode(nodeId, target.parentId, target.index));
        }
      }
    }

    // Cleanup
    if (pointerDrag.ghost) pointerDrag.ghost.remove();
    document.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
    document.body.classList.remove('sb-dragging-active');
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    pointerDrag = null;

    const selectedId = Store.getSelectedId();
    const selectedEl = selectedId ? document.querySelector(`#${pageId} [data-node-id="${selectedId}"]`) : null;
    if (selectedEl) showResizeLayer(selectedEl);
  }

  function beginDrag(e) {
    const { nodeEl } = pointerDrag;
    const rect = nodeEl.getBoundingClientRect();

    const ghost = nodeEl.cloneNode(true);
    ghost.classList.remove('is-selected', 'is-hovered', 'is-dragging');
    ghost.querySelectorAll('.node-badge, .drop-placeholder, .drop-indicator').forEach(el => el.remove());
    ghost.classList.add('drag-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    document.body.appendChild(ghost);

    pointerDrag.ghost = ghost;
    pointerDrag.offsetX = pointerDrag.startX - rect.left;
    pointerDrag.offsetY = pointerDrag.startY - rect.top;
    pointerDrag.active = true;

    nodeEl.classList.add('is-dragging');
    document.body.classList.add('sb-dragging-active');
    hideResizeLayer();
    Store.setSelectedId(pointerDrag.nodeId);

    try { document.getElementById(pageId)?.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function moveGhost(x, y) {
    if (!pointerDrag.ghost) return;
    pointerDrag.ghost.style.left = (x - pointerDrag.offsetX) + 'px';
    pointerDrag.ghost.style.top = (y - pointerDrag.offsetY) + 'px';
  }

  function autoScroll(x, y) {
    const vp = document.getElementById(viewportId);
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const edge = 40;
    if (y < r.top + edge) vp.scrollTop -= 12;
    else if (y > r.bottom - edge) vp.scrollTop += 12;
    if (x < r.left + edge) vp.scrollLeft -= 12;
    else if (x > r.right - edge) vp.scrollLeft += 12;
  }

  // Rect-based hit test: pick the deepest container under the point, then an
  // insertion index among its children (skipping the dragged node + descendants).
  function computeDropTarget(x, y, draggedId) {
    const page = Store.getPage();
    const pageEl = document.getElementById(pageId);
    if (!page || !pageEl) return null;

    const pageRect = pageEl.getBoundingClientRect();
    if (x < pageRect.left || x > pageRect.right || y < pageRect.top || y > pageRect.bottom) {
      return null;
    }

    const bad = new Set([draggedId, ...NodeUtils.getDescendantIds(page, draggedId)]);

    // Smallest container whose rect contains the point = deepest drop zone
    let bestId = page.rootId;
    let bestArea = Infinity;
    const consider = (id) => {
      if (bad.has(id)) return;
      const node = page.nodes[id];
      if (!node || !NodeUtils.canHaveChildren(node.type)) return;
      const el = id === page.rootId ? pageEl : pageEl.querySelector(`[data-node-id="${id}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const area = r.width * r.height;
        if (area < bestArea) { bestArea = area; bestId = id; }
      }
    };
    consider(page.rootId);
    Object.keys(page.nodes).forEach(consider);

    const container = page.nodes[bestId];
    const full = container.children || [];

    const horiz = isHorizontal(container);

    let index = full.length;
    let refId = null;
    for (let i = 0; i < full.length; i++) {
      const cid = full[i];
      if (bad.has(cid)) continue;
      const kEl = pageEl.querySelector(`[data-node-id="${cid}"]`);
      if (!kEl) continue;
      const kr = kEl.getBoundingClientRect();
      const mid = horiz ? kr.left + kr.width / 2 : kr.top + kr.height / 2;
      const pos = horiz ? x : y;
      if (pos < mid) { index = i; refId = cid; break; }
    }

    return { parentId: bestId, index, refId };
  }

  function isHorizontal(container) {
    const dir = String(container.props?.direction || '');
    if (container.type === 'flex') return dir.indexOf('row') === 0;
    if (container.type === 'stack') return dir === 'row';
    if (container.type === 'grid' || container.type === 'navbar' || container.type === 'footer') return true;
    return false;
  }

  function onDragOver(e) {
    if (!dragState) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragState.source === 'palette' ? 'copy' : 'move';

    const target = findDropTarget(e.clientX, e.clientY);
    if (target) {
      dropTarget = target;
      showDropIndicator(target);
    }
  }

  function onDragLeave(e) {
    if (e.target === document.getElementById(pageId)) {
      document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    }
  }

  function onDrop(e) {
    e.preventDefault();
    if (!dragState || !dropTarget) {
      clearHighlights();
      return;
    }

    const { parentId, index } = dropTarget;

    if (dragState.source === 'palette') {
      Editor.insertBlock(dragState.blockType, parentId, index);
    } else if (dragState.source === 'node') {
      Store.dispatch(Commands.moveNode(dragState.nodeId, parentId, index));
    }

    dragState = null;
    dropTarget = null;
    clearHighlights();
  }

  // Hit-test: find the best parent+index for the drop point
  function findDropTarget(x, y) {
    const pageEl = document.getElementById(pageId);
    if (!pageEl) return null;

    // Find the deepest node under the cursor
    const elements = document.elementsFromPoint(x, y);
    let containerEl = null;
    let childEl = null;

    for (const el of elements) {
      if (!pageEl.contains(el)) continue;
      const nodeEl = el.closest('[data-node-id]');
      if (!nodeEl) continue;
      const nodeId = nodeEl.dataset.nodeId;
      const node = Store.getPage().nodes[nodeId];
      if (node && NodeUtils.canHaveChildren(node.type)) {
        containerEl = nodeEl;
        // Which child are we over?
        const childNodeEl = el.closest('[data-node-id]');
        childEl = (childNodeEl && childNodeEl !== nodeEl) ? childNodeEl : null;
        break;
      }
    }

    if (!containerEl) {
      // Over a leaf node — drop into its parent
      const leafEl = elements.map(el => el.closest && el.closest('[data-node-id]')).find(Boolean);
      if (!leafEl) {
        // Empty canvas / not over any node → append to page root
        const page = Store.getPage();
        return { parentId: page.rootId, index: page.nodes[page.rootId].children.length };
      }
      const leafId = leafEl.dataset.nodeId;
      const page = Store.getPage();
      const parentId = NodeUtils.getParentId(page, leafId);
      if (!parentId) return null;
      const parent = page.nodes[parentId];
      const siblings = parent.children;
      const leafIdx = siblings.indexOf(leafId);
      const rect = leafEl.getBoundingClientRect();
      const after = y > rect.top + rect.height / 2;
      return { parentId, index: leafIdx + (after ? 1 : 0) };
    }

    const containerId = containerEl.dataset.nodeId;
    const page = Store.getPage();
    const container = page.nodes[containerId];

    if (!childEl) {
      // Empty container or between children — append
      return { parentId: containerId, index: container.children.length };
    }

    const childId = childEl.dataset.nodeId;
    const rect = childEl.getBoundingClientRect();
    const horizontal = ['flex', 'row'].includes(container.props?.direction) || container.type === 'flex' && container.props?.direction !== 'column';
    const before = horizontal ? x < rect.left + rect.width / 2 : y < rect.top + rect.height / 2;
    const childIdx = container.children.indexOf(childId);
    return { parentId: containerId, index: before ? childIdx : childIdx + 1 };
  }

  function showDropIndicator(target) {
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    const pageEl = document.getElementById(pageId);
    const parentId = target.parentId;

    let refEl = null;
    const page = Store.getPage();
    const isRoot = parentId === page.rootId;
    const parentEl = isRoot ? pageEl : pageEl.querySelector(`[data-node-id="${parentId}"]`);
    if (!parentEl) return;

    const children = page.nodes[parentId]?.children || [];
    let refId = ('refId' in target) ? target.refId : (children[target.index] || null);
    if (refId) refEl = pageEl.querySelector(`[data-node-id="${refId}"]`);

    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';

    if (refEl) {
      const rect = refEl.getBoundingClientRect();
      const pageRect = pageEl.getBoundingClientRect();
      indicator.style.position = 'absolute';
      indicator.style.left = (rect.left - pageRect.left) + 'px';
      indicator.style.top = (rect.top - pageRect.top - 2) + 'px';
      indicator.style.width = rect.width + 'px';
      indicator.style.height = '4px';
    } else {
      const rect = parentEl.getBoundingClientRect();
      const pageRect = pageEl.getBoundingClientRect();
      indicator.style.position = 'absolute';
      indicator.style.left = (rect.left - pageRect.left + 8) + 'px';
      indicator.style.top = (rect.bottom - pageRect.top - 4) + 'px';
      indicator.style.width = (rect.width - 16) + 'px';
      indicator.style.height = '4px';
    }
    pageEl.style.position = pageEl.style.position || 'relative';
    pageEl.appendChild(indicator);
  }

  // ---------- INLINE TEXT EDITING ----------

  function resolveInlineEdit(node, nodeEl, clicked) {
    const within = el => !!(el && nodeEl.contains(el));
    const pick = (selector, key) => {
      let el = clicked && clicked.closest ? clicked.closest(selector) : null;
      if (!within(el)) el = nodeEl.querySelector(selector);
      return within(el) ? { key, el } : null;
    };

    switch (node.type) {
      case 'heading': return pick('h1,h2,h3,h4,h5,h6', 'text');
      case 'text': return pick('p', 'text');
      case 'blockquote': return pick('blockquote p, p', 'text');
      case 'rich-text': {
        const el = nodeEl.querySelector('.sb-rich-text');
        return el ? { key: 'html', el } : null;
      }
      case 'button': return pick('a', 'text');
      case 'nav-link': return pick('a', 'label');
      case 'logo': return pick('a span, a', 'text');
      case 'submit-button': return pick('button', 'text');
      case 'input':
      case 'textarea':
      case 'select': return pick('label', 'label');
      case 'list': {
        const lis = Array.from(nodeEl.querySelectorAll('li'));
        if (!lis.length) return null;
        let li = clicked && clicked.closest ? clicked.closest('li') : null;
        if (!li || !within(li)) li = lis[0];
        return { key: 'items', el: li, list: true, index: lis.indexOf(li) };
      }
      case 'hero': {
        const el = clicked && clicked.closest ? clicked.closest('h1,h2,h3,h4,h5,h6,p,a') : null;
        if (within(el)) {
          if (/^H[1-6]$/.test(el.tagName)) return { key: 'heading', el };
          if (el.tagName === 'A') return { key: 'buttonText', el };
          if (el.tagName === 'P') return { key: 'subheading', el };
        }
        const h = nodeEl.querySelector('h1,h2,h3,h4,h5,h6');
        return h ? { key: 'heading', el: h } : null;
      }
    }
    return null;
  }

  function listItems(node) {
    return String(node.props?.items || '').split(/[|\n]/).map(s => s.trim()).filter(Boolean);
  }

  function startInlineEdit(node, editable, nodeEl) {
    const key = editable.key;
    const target = editable.el;
    if (!target) return;

    const isHtml = key === 'html';
    const isList = !!editable.list;

    let originalValue;
    if (isList) {
      originalValue = listItems(node)[editable.index] ?? '';
    } else {
      originalValue = node.props[key] ?? '';
    }

    const originalHtml = target.innerHTML;
    const originalText = target.innerText.trim();

    if (isHtml) {
      if (richTextToolbar) richTextToolbar.remove();
      richTextToolbar = document.createElement('div');
      richTextToolbar.className = 'sb-richtext-toolbar';
      richTextToolbar.setAttribute('role', 'toolbar');
      richTextToolbar.setAttribute('aria-label', 'Text formatting');
      richTextToolbar.innerHTML = `
        <button type="button" data-rich-command="bold" title="Bold"><strong>B</strong></button>
        <button type="button" data-rich-command="italic" title="Italic"><em>I</em></button>
        <button type="button" data-rich-command="underline" title="Underline"><u>U</u></button>
        <button type="button" data-rich-command="insertUnorderedList" title="Bulleted list">• List</button>
        <button type="button" data-rich-command="superscript" title="Superscript">x²</button>
        <button type="button" data-rich-command="subscript" title="Subscript">x₂</button>
        <label title="Text color">A <input type="color" data-rich-color value="#1f2937" aria-label="Text color"></label>
        <label title="Highlight color">▰ <input type="color" data-rich-highlight value="#fff59d" aria-label="Highlight color"></label>
        <button type="button" data-rich-link title="Add link">Link</button>
        <button type="button" data-rich-done title="Finish editing">Done</button>`;
      document.body.appendChild(richTextToolbar);
      const rect = target.getBoundingClientRect();
      richTextToolbar.style.top = `${Math.max(8, rect.top - 48)}px`;
      richTextToolbar.style.left = `${Math.max(8, Math.min(window.innerWidth - 360, rect.left))}px`;
      richTextToolbar.addEventListener('mousedown', e => e.preventDefault());
      richTextToolbar.querySelectorAll('[data-rich-command]').forEach(btn => btn.addEventListener('click', () => {
        target.focus(); document.execCommand(btn.dataset.richCommand, false, null);
      }));
      richTextToolbar.querySelector('[data-rich-color]')?.addEventListener('input', e => { target.focus(); document.execCommand('foreColor', false, e.target.value); });
      richTextToolbar.querySelector('[data-rich-highlight]')?.addEventListener('input', e => { target.focus(); document.execCommand('hiliteColor', false, e.target.value); });
      richTextToolbar.querySelector('[data-rich-link]')?.addEventListener('click', () => {
        const url = window.prompt('Enter the link URL (https://, mailto:, tel: or a relative path):');
        if (url) { target.focus(); document.execCommand('createLink', false, url); }
      });
      richTextToolbar.querySelector('[data-rich-done]')?.addEventListener('click', () => { target.blur(); });
    }

    target.contentEditable = 'true';
    target.focus();
    target.classList.add('inline-editing');
    document.execCommand('selectAll', false, null);

    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      target.contentEditable = 'false';
      target.classList.remove('inline-editing');
      if (richTextToolbar) { richTextToolbar.remove(); richTextToolbar = null; }

      if (!save) {
        target.innerHTML = originalHtml;
        return;
      }

      if (isList) {
        const text = target.innerText.trim();
        if (text === originalText) return;
        const parts = listItems(node);
        parts[editable.index] = text;
        Store.dispatch(Commands.setProp(node.id, 'items', parts.filter(Boolean).join('|')));
        if (typeof Editor !== 'undefined') Editor.refreshPanels(false);
        return;
      }

      const text = isHtml ? target.innerHTML.trim() : target.innerText.trim();
      if (text === (isHtml ? String(originalValue).trim() : originalText)) return;
      Store.dispatch(Commands.setProp(node.id, key, text));
      if (typeof Editor !== 'undefined') Editor.refreshPanels(false);
    };

    target.addEventListener('blur', () => finish(true), { once: true });
    target.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Enter' && !e.shiftKey && !isHtml) { e.preventDefault(); finish(true); }
      e.stopPropagation();
    });
  }

  // ---------- RESIZE HANDLES & SNAPPING ----------

  const RZ_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  let rzLayer = null;
  let rzNodeId = null;
  let rzNodeEl = null;
  let rzState = null;
  let rzGuides = null;

  function ensureResizeLayer() {
    if (rzLayer) return rzLayer;

    rzLayer = document.createElement('div');
    rzLayer.className = 'sb-resize-layer';
    rzLayer.hidden = true;
    rzLayer.innerHTML = RZ_HANDLES.map(h => `<span class="sb-rz sb-rz-${h}" data-rz="${h}"></span>`).join('') +
      '<span class="sb-resize-size" data-rz-size></span>';
    document.body.appendChild(rzLayer);
    rzLayer.addEventListener('pointerdown', onResizeStart);

    rzGuides = {
      v: document.createElement('div'),
      h: document.createElement('div')
    };
    rzGuides.v.className = 'sb-snap-guide sb-snap-guide--v';
    rzGuides.h.className = 'sb-snap-guide sb-snap-guide--h';
    Object.values(rzGuides).forEach(g => { g.hidden = true; document.body.appendChild(g); });

    return rzLayer;
  }

  function showResizeLayer(nodeEl) {
    ensureResizeLayer();
    rzNodeId = nodeEl.dataset.nodeId;
    rzNodeEl = nodeEl;
    rzLayer.hidden = false;
    positionResizeLayer();
  }

  function hideResizeLayer() {
    rzNodeId = null;
    rzNodeEl = null;
    if (rzLayer) rzLayer.hidden = true;
    hideGuides();
  }

  function refreshResizeLayer() {
    if (!rzNodeId || !rzLayer || rzLayer.hidden || rzState) return;
    const nodeEl = document.querySelector(`#${pageId} [data-node-id="${rzNodeId}"]`);
    if (!nodeEl) { hideResizeLayer(); return; }
    rzNodeEl = nodeEl;
    positionResizeLayer();
  }

  function positionResizeLayer() {
    if (!rzNodeEl || !rzLayer) return;
    const r = rzNodeEl.getBoundingClientRect();
    rzLayer.style.left = Math.round(r.left) + 'px';
    rzLayer.style.top = Math.round(r.top) + 'px';
    rzLayer.style.width = Math.round(r.width) + 'px';
    rzLayer.style.height = Math.round(r.height) + 'px';
  }

  function canvasZoom() {
    const pageEl = document.getElementById(pageId);
    if (!pageEl || !pageEl.offsetWidth) return 1;
    return (pageEl.getBoundingClientRect().width / pageEl.offsetWidth) || 1;
  }

  function collectSnapTargets(nodeEl) {
    const parentWrap = nodeEl.parentElement && nodeEl.parentElement.closest
      ? nodeEl.parentElement.closest('[data-node-id]')
      : null;
    const parentEl = parentWrap || document.getElementById(pageId);
    const parentRect = parentEl ? parentEl.getBoundingClientRect() : null;
    const xs = [];
    const ys = [];

    if (parentRect) {
      xs.push(parentRect.left, parentRect.left + parentRect.width / 2, parentRect.right);
      ys.push(parentRect.top, parentRect.top + parentRect.height / 2, parentRect.bottom);
    }

    if (parentEl) {
      Array.from(parentEl.children).forEach(sib => {
        if (sib === nodeEl || !sib.dataset || !sib.dataset.nodeId) return;
        const r = sib.getBoundingClientRect();
        if (!r.width && !r.height) return;
        xs.push(r.left, r.left + r.width / 2, r.right);
        ys.push(r.top, r.top + r.height / 2, r.bottom);
      });
    }

    return { xs, ys, parentRect };
  }

  function onResizeStart(e) {
    const handleEl = e.target.closest('[data-rz]');
    if (!handleEl || !rzNodeEl) return;
    e.preventDefault();
    e.stopPropagation();

    const node = Store.getPage().nodes[rzNodeId];
    if (!node) return;

    const bp = Store.getBreakpoint();
    const resolved = NodeUtils.resolveStyles(node, bp);
    const rect = rzNodeEl.getBoundingClientRect();
    const zoom = canvasZoom();

    rzState = {
      id: rzNodeId,
      nodeEl: rzNodeEl,
      bp,
      handle: handleEl.dataset.rz,
      startX: e.clientX,
      startY: e.clientY,
      startRect: rect,
      zoom,
      startW: rect.width / zoom,
      startH: rect.height / zoom,
      startML: parseFloat(resolved.marginLeft) || 0,
      startMT: parseFloat(resolved.marginTop) || 0,
      ratio: rect.height ? rect.width / rect.height : 1,
      targets: collectSnapTargets(rzNodeEl),
      styleBackup: rzNodeEl.getAttribute('style') || '',
      moved: false,
      current: null
    };

    document.body.classList.add('sb-resizing');
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', onResizeEnd);
    window.addEventListener('pointercancel', onResizeCancel);
  }

  function applyResizePreview(w, h, offsetX, offsetY) {
    const s = rzState;
    if (!s) return;
    const el = s.nodeEl;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.maxWidth = 'none';
    el.style.marginLeft = (s.startML + offsetX) + 'px';
    el.style.marginTop = (s.startMT + offsetY) + 'px';
  }

  function nearestSnap(value, list, threshold) {
    let best = null;
    list.forEach(candidate => {
      const d = Math.abs(candidate - value);
      if (d <= threshold && (!best || d < best.d)) best = { d, value: candidate };
    });
    return best;
  }

  function onResizeMove(e) {
    const s = rzState;
    if (!s) return;
    s.moved = true;

    const dx = (e.clientX - s.startX) / s.zoom;
    const dy = (e.clientY - s.startY) / s.zoom;
    const dirs = {
      w: s.handle.includes('w'),
      e: s.handle.includes('e'),
      n: s.handle.includes('n'),
      s: s.handle.includes('s')
    };

    let w = s.startW;
    let h = s.startH;
    if (dirs.e) w = s.startW + dx;
    if (dirs.w) w = s.startW - dx;
    if (dirs.s) h = s.startH + dy;
    if (dirs.n) h = s.startH - dy;

    if (e.shiftKey) {
      if ((dirs.e || dirs.w) && (dirs.n || dirs.s)) {
        if (Math.abs(dx) >= Math.abs(dy)) h = w / s.ratio;
        else w = h * s.ratio;
      } else if (dirs.e || dirs.w) {
        h = w / s.ratio;
      } else {
        w = h * s.ratio;
      }
    }

    w = Math.max(24, w);
    h = Math.max(24, h);

    applyResizePreview(w, h, dirs.w ? s.startW - w : 0, dirs.n ? s.startH - h : 0);
    positionResizeLayer();

    const threshold = 6;
    let snapX = null;
    let snapY = null;
    let rect = s.nodeEl.getBoundingClientRect();

    if (dirs.e || dirs.w) {
      const edge = dirs.e ? rect.right : rect.left;
      const hit = nearestSnap(edge, s.targets.xs, threshold);
      if (hit) {
        const delta = (hit.value - edge) / s.zoom;
        w = Math.max(24, dirs.e ? w + delta : w - delta);
        snapX = hit.value;
      }
    }
    if (dirs.n || dirs.s) {
      const edge = dirs.s ? rect.bottom : rect.top;
      const hit = nearestSnap(edge, s.targets.ys, threshold);
      if (hit) {
        const delta = (hit.value - edge) / s.zoom;
        h = Math.max(24, dirs.s ? h + delta : h - delta);
        snapY = hit.value;
      }
    }

    applyResizePreview(w, h, dirs.w ? s.startW - w : 0, dirs.n ? s.startH - h : 0);
    positionResizeLayer();
    rect = s.nodeEl.getBoundingClientRect();

    const label = rzLayer.querySelector('[data-rz-size]');
    if (label) label.textContent = `${Math.round(w)} × ${Math.round(h)}`;

    if (snapX != null) showGuide('v', snapX, s.targets.parentRect);
    else hideGuide('v');
    if (snapY != null) showGuide('h', snapY, s.targets.parentRect);
    else hideGuide('h');

    s.current = {
      w, h,
      offsetX: dirs.w ? s.startW - w : 0,
      offsetY: dirs.n ? s.startH - h : 0
    };
  }

  function onResizeEnd() {
    if (!rzState) return;
    const s = rzState;
    window.removeEventListener('pointermove', onResizeMove);
    window.removeEventListener('pointerup', onResizeEnd);
    window.removeEventListener('pointercancel', onResizeCancel);
    document.body.classList.remove('sb-resizing');
    hideGuides();

    if (s.moved && s.current) {
      const styles = {
        width: Math.round(s.current.w) + 'px',
        height: Math.round(s.current.h) + 'px'
      };
      if (s.current.offsetX) styles.marginLeft = Math.round(s.startML + s.current.offsetX) + 'px';
      if (s.current.offsetY) styles.marginTop = Math.round(s.startMT + s.current.offsetY) + 'px';
      Store.dispatch(Commands.setStyles(s.id, s.bp, styles));
      if (typeof Editor !== 'undefined') Editor.refreshPanels(false);
    } else {
      s.nodeEl.setAttribute('style', s.styleBackup);
    }

    rzState = null;
    refreshResizeLayer();
  }

  function onResizeCancel() {
    if (!rzState) return;
    const s = rzState;
    window.removeEventListener('pointermove', onResizeMove);
    window.removeEventListener('pointerup', onResizeEnd);
    window.removeEventListener('pointercancel', onResizeCancel);
    document.body.classList.remove('sb-resizing');
    hideGuides();
    s.nodeEl.setAttribute('style', s.styleBackup);
    rzState = null;
    refreshResizeLayer();
  }

  function showGuide(axis, pos, parentRect) {
    if (!rzGuides) return;
    const g = rzGuides[axis];
    g.hidden = false;
    if (axis === 'v') {
      const pr = parentRect || { top: 0, height: window.innerHeight };
      g.style.left = Math.round(pos) + 'px';
      g.style.top = Math.round(pr.top) + 'px';
      g.style.height = Math.round(pr.height) + 'px';
    } else {
      const pr = parentRect || { left: 0, width: window.innerWidth };
      g.style.top = Math.round(pos) + 'px';
      g.style.left = Math.round(pr.left) + 'px';
      g.style.width = Math.round(pr.width) + 'px';
    }
  }

  function hideGuide(axis) {
    if (rzGuides && rzGuides[axis]) rzGuides[axis].hidden = true;
  }

  function hideGuides() {
    hideGuide('v');
    hideGuide('h');
  }

  // ---------- HELPERS ----------

  function styleObjToCSS(style) {
    if (!style) return '';
    return Object.entries(style)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => `${k}:${v}`)
      .join(';') + (Object.keys(style).length ? ';' : '');
  }

  function escapeH(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
  function escapeA(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // Palette drag start helper (called by editor.js)
  function startPaletteDrag(e, blockType) {
    dragState = { source: 'palette', blockType };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', blockType);
  }

  // Keep floating overlays aligned after zoom changes
  function refreshOverlays() {
    refreshToolbar();
  }

  return { render, startPaletteDrag, clearHighlights, refreshOverlays };
})();
