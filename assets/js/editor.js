// Editor state and all interactive behavior: palette, canvas, drag/drop
// (both whole-block reordering and, for grid/columns/nav, individual
// element reordering within a block), properties panel, save/load/publish.

const params = new URLSearchParams(window.location.search);
const pageId = params.get('id');

const state = {
  id: pageId ? Number(pageId) : null,
  name: 'Untitled Page',
  blocks: [],
  settings: { pageTitle: 'Untitled Page', pageBackground: '#FFFFFF', fontFamily: 'Arial, Helvetica, sans-serif' },
  selectedId: null,
  dirty: false
};

const paletteEl = document.getElementById('palette');
const canvasPageEl = document.getElementById('canvasPage');
const propsPanelEl = document.getElementById('propsPanel');
const pageNameInput = document.getElementById('pageNameInput');
const saveStatusEl = document.getElementById('saveStatus');

function markDirty() {
  state.dirty = true;
  saveStatusEl.textContent = 'Unsaved changes';
}

function markSaved() {
  state.dirty = false;
  saveStatusEl.textContent = 'Saved';
}

// ---------- Palette ----------
function renderPalette() {
  paletteEl.innerHTML = '<div class="palette-title">Blocks</div>';
  Object.entries(BLOCK_TYPES).forEach(([type, def]) => {
    const item = document.createElement('div');
    item.className = 'palette-item';
    item.draggable = true;
    item.innerHTML = `<span class="palette-item-icon">${def.icon}</span><span>${def.label}</span>`;
    item.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', 'new:' + type);
      e.dataTransfer.effectAllowed = 'copy';
    });
    item.addEventListener('click', () => {
      const block = createBlock(type);
      state.blocks.push(block);
      markDirty();
      selectBlock(block.id);
    });
    paletteEl.appendChild(item);
  });
}

// ---------- Drag helpers ----------
function startPointerDrag(onMove, onEnd) {
  function move(e) { onMove(e); }
  function up(e) {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    onEnd && onEnd(e);
  }
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

function attachLayoutHandles(wrapper, block) {
  const posEl = wrapper.querySelector('.sb-pos');
  if (!posEl) return;
  posEl.style.position = 'relative';

  const moveHandle = document.createElement('div');
  moveHandle.className = 'layout-handle handle-move';
  moveHandle.title = 'Drag to reposition horizontally';
  moveHandle.draggable = false;
  moveHandle.textContent = '\u2194';

  const widthHandle = document.createElement('div');
  widthHandle.className = 'layout-handle handle-width';
  widthHandle.title = 'Drag to resize width';
  widthHandle.draggable = false;

  const heightHandle = document.createElement('div');
  heightHandle.className = 'layout-handle handle-height';
  heightHandle.title = 'Drag to resize height';
  heightHandle.draggable = false;

  posEl.appendChild(moveHandle);
  posEl.appendChild(widthHandle);
  posEl.appendChild(heightHandle);

  moveHandle.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    const canvasWidth = canvasPageEl.getBoundingClientRect().width;
    const startX = e.clientX;
    const startOffset = block.layout.offsetXPct;
    startPointerDrag(ev => {
      const deltaPct = (ev.clientX - startX) / canvasWidth * 100;
      const newOffset = Math.max(0, Math.min(100 - block.layout.widthPct, startOffset + deltaPct));
      posEl.style.marginLeft = newOffset + '%';
      block.layout.offsetXPct = newOffset;
    }, () => {
      markDirty();
      renderCanvas();
      renderPropsPanel();
    });
  });

  widthHandle.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    const canvasWidth = canvasPageEl.getBoundingClientRect().width;
    const startX = e.clientX;
    const startWidth = block.layout.widthPct;
    startPointerDrag(ev => {
      const deltaPct = (ev.clientX - startX) / canvasWidth * 100;
      const newWidth = Math.max(10, Math.min(100 - block.layout.offsetXPct, startWidth + deltaPct));
      posEl.style.width = newWidth + '%';
      block.layout.widthPct = newWidth;
    }, () => {
      markDirty();
      renderCanvas();
      renderPropsPanel();
    });
  });

  heightHandle.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = block.layout.minHeight || posEl.getBoundingClientRect().height;
    posEl.style.display = 'flex';
    posEl.style.flexDirection = 'column';
    posEl.style.justifyContent = 'center';
    startPointerDrag(ev => {
      const deltaY = ev.clientY - startY;
      const newHeight = Math.max(0, startHeight + deltaY);
      posEl.style.minHeight = newHeight + 'px';
      block.layout.minHeight = Math.round(newHeight);
    }, () => {
      markDirty();
      renderCanvas();
      renderPropsPanel();
    });
  });
}

// Individual-element dragging within a block: grid cells (reorder),
// columns (swap left/right), nav links (reorder). Each handler calls
// stopPropagation() so it never triggers the whole-block reorder listeners
// on the wrapper.
function attachElementDragHandlers(wrapper, block) {
  if (block.type === 'grid') {
    const cellEls = wrapper.querySelectorAll('.sb-grid-cell[draggable]');
    let dragFromIndex = null;

    cellEls.forEach(cellEl => {
      cellEl.addEventListener('dragstart', e => {
        e.stopPropagation();
        dragFromIndex = Number(cellEl.dataset.cellIndex);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'cell:' + dragFromIndex);
        cellEl.classList.add('dragging-element');
      });
      cellEl.addEventListener('dragend', () => {
        cellEl.classList.remove('dragging-element');
      });
      cellEl.addEventListener('dragover', e => {
        e.preventDefault();
        e.stopPropagation();
        cellEl.classList.add('element-drop-target');
      });
      cellEl.addEventListener('dragleave', () => {
        cellEl.classList.remove('element-drop-target');
      });
      cellEl.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        cellEl.classList.remove('element-drop-target');
        const toIndex = Number(cellEl.dataset.cellIndex);
        if (dragFromIndex === null || dragFromIndex === toIndex) return;
        const cells = block.props.cells;
        const [moved] = cells.splice(dragFromIndex, 1);
        cells.splice(toIndex, 0, moved);
        dragFromIndex = null;
        markDirty();
        renderCanvas();
        renderPropsPanel();
      });
    });
  }

  if (block.type === 'columns') {
    const colEls = wrapper.querySelectorAll('.sb-col[draggable]');
    let dragFromSide = null;

    colEls.forEach(colEl => {
      colEl.addEventListener('dragstart', e => {
        e.stopPropagation();
        dragFromSide = colEl.dataset.colSide;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'col:' + dragFromSide);
        colEl.classList.add('dragging-element');
      });
      colEl.addEventListener('dragend', () => {
        colEl.classList.remove('dragging-element');
      });
      colEl.addEventListener('dragover', e => {
        e.preventDefault();
        e.stopPropagation();
        colEl.classList.add('element-drop-target');
      });
      colEl.addEventListener('dragleave', () => {
        colEl.classList.remove('element-drop-target');
      });
      colEl.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        colEl.classList.remove('element-drop-target');
        const toSide = colEl.dataset.colSide;
        if (!dragFromSide || dragFromSide === toSide) return;
        const tmp = block.props.leftText;
        block.props.leftText = block.props.rightText;
        block.props.rightText = tmp;
        dragFromSide = null;
        markDirty();
        renderCanvas();
        renderPropsPanel();
      });
    });
  }

  if (block.type === 'nav') {
    const linkEls = wrapper.querySelectorAll('.sb-nav-links a[data-link-index]');
    let dragFromIndex = null;

    linkEls.forEach(linkEl => {
      linkEl.addEventListener('dragstart', e => {
        e.stopPropagation();
        dragFromIndex = Number(linkEl.dataset.linkIndex);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'navlink:' + dragFromIndex);
        linkEl.classList.add('dragging-element');
      });
      linkEl.addEventListener('dragend', () => {
        linkEl.classList.remove('dragging-element');
      });
      linkEl.addEventListener('dragover', e => {
        e.preventDefault();
        e.stopPropagation();
        linkEl.classList.add('element-drop-target');
      });
      linkEl.addEventListener('dragleave', () => {
        linkEl.classList.remove('element-drop-target');
      });
      linkEl.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        linkEl.classList.remove('element-drop-target');
        const toIndex = Number(linkEl.dataset.linkIndex);
        if (dragFromIndex === null || dragFromIndex === toIndex) return;
        const pairs = String(block.props.links || '').split('|').map(s => s.trim()).filter(Boolean);
        const [moved] = pairs.splice(dragFromIndex, 1);
        pairs.splice(toIndex, 0, moved);
        block.props.links = pairs.join('|');
        dragFromIndex = null;
        markDirty();
        renderCanvas();
        renderPropsPanel();
      });
    });
  }
}

// ---------- Canvas ----------
function renderCanvas() {
  if (state.blocks.length === 0) {
    canvasPageEl.innerHTML = `<div class="canvas-empty">Drag a block here to start building
      <span class="canvas-empty-mono">/// empty canvas</span></div>`;
    setupCanvasDropZone(canvasPageEl);
    return;
  }

  canvasPageEl.innerHTML = '';
  state.blocks.forEach(block => {
    const def = BLOCK_TYPES[block.type];
    if (!def) return;
    block.layout = normalizeLayout(block.layout);

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-canvas-block' + (state.selectedId === block.id ? ' selected' : '');
    wrapper.dataset.id = block.id;
    wrapper.draggable = true;
    wrapper.innerHTML = `
      <span class="block-tag">${def.label}</span>
      <div class="block-controls">
        <button data-action="up" title="Move up">↑</button>
        <button data-action="down" title="Move down">↓</button>
        <button data-action="dup" title="Duplicate">⎘</button>
        <button data-action="del" title="Delete">×</button>
      </div>
      ${renderBlockOuter(block)}
    `;

    wrapper.addEventListener('click', e => {
      if (e.target.closest('.block-controls') || e.target.closest('.layout-handle')) return;
      if (e.target.closest('a')) e.preventDefault();
      selectBlock(block.id);
    });

    wrapper.querySelector('[data-action="up"]').addEventListener('click', () => moveBlock(block.id, -1));
    wrapper.querySelector('[data-action="down"]').addEventListener('click', () => moveBlock(block.id, 1));
    wrapper.querySelector('[data-action="dup"]').addEventListener('click', () => duplicateBlock(block.id));
    wrapper.querySelector('[data-action="del"]').addEventListener('click', () => deleteBlock(block.id));

    wrapper.addEventListener('dragstart', e => {
      e.stopPropagation();
      e.dataTransfer.setData('text/plain', 'reorder:' + block.id);
      e.dataTransfer.effectAllowed = 'move';
    });

    wrapper.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      const rect = wrapper.getBoundingClientRect();
      const isTop = (e.clientY - rect.top) < rect.height / 2;
      wrapper.classList.toggle('drag-over-top', isTop);
      wrapper.classList.toggle('drag-over-bottom', !isTop);
    });

    wrapper.addEventListener('dragleave', () => {
      wrapper.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    wrapper.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      const rect = wrapper.getBoundingClientRect();
      const isTop = (e.clientY - rect.top) < rect.height / 2;
      wrapper.classList.remove('drag-over-top', 'drag-over-bottom');
      handleDrop(e, block.id, isTop);
    });

    canvasPageEl.appendChild(wrapper);

    attachElementDragHandlers(wrapper, block);

    if (state.selectedId === block.id) {
      attachLayoutHandles(wrapper, block);
    }
  });

  setupCanvasDropZone(canvasPageEl);
}

function setupCanvasDropZone(el) {
  el.ondragover = e => {
    if (state.blocks.length > 0) return;
    e.preventDefault();
    el.classList.add('drag-over-empty');
  };
  el.ondragleave = () => el.classList.remove('drag-over-empty');
  el.ondrop = e => {
    el.classList.remove('drag-over-empty');
    if (state.blocks.length > 0) return;
    e.preventDefault();
    handleDrop(e, null, true);
  };
}

function handleDrop(e, targetId, insertBefore) {
  const data = e.dataTransfer.getData('text/plain');
  if (!data) return;

  if (data.startsWith('new:')) {
    const type = data.slice(4);
    const block = createBlock(type);
    if (!block) return;
    insertBlockRelative(block, targetId, insertBefore);
    markDirty();
    selectBlock(block.id);
    return;
  }

  if (data.startsWith('reorder:')) {
    const draggedId = data.slice(8);
    if (draggedId === targetId) return;
    const draggedIndex = state.blocks.findIndex(b => b.id === draggedId);
    if (draggedIndex === -1) return;
    const [draggedBlock] = state.blocks.splice(draggedIndex, 1);
    insertBlockRelative(draggedBlock, targetId, insertBefore);
    markDirty();
    renderCanvas();
  }
}

function insertBlockRelative(block, targetId, insertBefore) {
  if (!targetId) {
    state.blocks.push(block);
    renderCanvas();
    return;
  }
  const targetIndex = state.blocks.findIndex(b => b.id === targetId);
  const insertAt = insertBefore ? targetIndex : targetIndex + 1;
  state.blocks.splice(insertAt, 0, block);
  renderCanvas();
}

function selectBlock(id) {
  state.selectedId = id;
  renderCanvas();
  renderPropsPanel();
}

function moveBlock(id, direction) {
  const index = state.blocks.findIndex(b => b.id === id);
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.blocks.length) return;
  const [block] = state.blocks.splice(index, 1);
  state.blocks.splice(newIndex, 0, block);
  markDirty();
  renderCanvas();
}

function duplicateBlock(id) {
  const index = state.blocks.findIndex(b => b.id === id);
  if (index === -1) return;
  const original = state.blocks[index];
  const copy = {
    id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: original.type,
    props: JSON.parse(JSON.stringify(original.props)),
    layout: JSON.parse(JSON.stringify(normalizeLayout(original.layout)))
  };
  state.blocks.splice(index + 1, 0, copy);
  markDirty();
  selectBlock(copy.id);
}

function deleteBlock(id) {
  state.blocks = state.blocks.filter(b => b.id !== id);
  if (state.selectedId === id) state.selectedId = null;
  markDirty();
  renderCanvas();
  renderPropsPanel();
}

// ---------- Properties panel ----------
function renderPropsPanel() {
  const block = state.blocks.find(b => b.id === state.selectedId);
  if (!block) {
    propsPanelEl.innerHTML = `<div class="props-empty">Select a block to edit its properties.</div>`;
    return;
  }

  const def = BLOCK_TYPES[block.type];
  propsPanelEl.innerHTML = `<div class="props-title">${def.label}</div>`;

  block.layout = normalizeLayout(block.layout);
  const layoutSection = document.createElement('div');
  layoutSection.className = 'layout-section';
  layoutSection.innerHTML = `
    <div class="props-subtitle">Position &amp; size</div>
    <div class="field">
      <label>Width: <span data-role="width-val">${block.layout.widthPct}%</span></label>
      <input type="range" min="10" max="100" value="${block.layout.widthPct}" data-role="width-range">
    </div>
    <div class="field">
      <label>Horizontal position: <span data-role="offset-val">${block.layout.offsetXPct}%</span></label>
      <input type="range" min="0" max="${100 - block.layout.widthPct}" value="${block.layout.offsetXPct}" data-role="offset-range">
    </div>
    <div class="field">
      <label>Height in px (0 = auto)</label>
      <input type="number" min="0" value="${block.layout.minHeight}" data-role="height-input">
    </div>
  `;
  propsPanelEl.appendChild(layoutSection);

  const widthRange = layoutSection.querySelector('[data-role="width-range"]');
  const offsetRange = layoutSection.querySelector('[data-role="offset-range"]');
  const heightInput = layoutSection.querySelector('[data-role="height-input"]');

  widthRange.addEventListener('input', () => {
    block.layout.widthPct = Number(widthRange.value);
    block.layout.offsetXPct = Math.min(block.layout.offsetXPct, 100 - block.layout.widthPct);
    offsetRange.max = 100 - block.layout.widthPct;
    offsetRange.value = block.layout.offsetXPct;
    layoutSection.querySelector('[data-role="width-val"]').textContent = block.layout.widthPct + '%';
    layoutSection.querySelector('[data-role="offset-val"]').textContent = block.layout.offsetXPct + '%';
    markDirty();
    renderCanvas();
  });
  offsetRange.addEventListener('input', () => {
    block.layout.offsetXPct = Number(offsetRange.value);
    layoutSection.querySelector('[data-role="offset-val"]').textContent = block.layout.offsetXPct + '%';
    markDirty();
    renderCanvas();
  });
  heightInput.addEventListener('input', () => {
    block.layout.minHeight = Math.max(0, Number(heightInput.value) || 0);
    markDirty();
    renderCanvas();
  });

  def.fields.forEach(field => {
    const fieldWrap = document.createElement('div');
    fieldWrap.className = 'field';

    if (field.type === 'grid') {
      const resizeCells = () => {
        const cols = Math.max(1, Math.min(6, Number(fieldWrap.querySelector('[data-role="cols-input"]')?.value) || block.props.columns || 3));
        const rows = Math.max(1, Math.min(6, Number(fieldWrap.querySelector('[data-role="rows-input"]')?.value) || block.props.rows || 1));
        const total = cols * rows;
        const cells = block.props.cells || [];
        while (cells.length < total) cells.push('New item');
        cells.length = total;
        block.props.columns = cols;
        block.props.rows = rows;
        block.props.cells = cells;
      };
      resizeCells();

      const renderCellInputs = () => {
        const listEl = fieldWrap.querySelector('[data-role="cells-list"]');
        listEl.innerHTML = '';
        block.props.cells.forEach((cellText, idx) => {
          const ta = document.createElement('textarea');
          ta.value = cellText;
          ta.rows = 2;
          ta.addEventListener('input', e => {
            block.props.cells[idx] = e.target.value;
            markDirty();
            renderCanvas();
          });
          listEl.appendChild(ta);
        });
      };

      fieldWrap.innerHTML = `
        <label>Grid layout</label>
        <div class="field-row">
          <div class="field"><label>Columns</label><input type="number" min="1" max="6" value="${block.props.columns}" data-role="cols-input"></div>
          <div class="field"><label>Rows</label><input type="number" min="1" max="6" value="${block.props.rows}" data-role="rows-input"></div>
        </div>
        <div class="field"><label>Gap (px)</label><input type="number" min="0" value="${block.props.gap ?? 16}" data-role="gap-input"></div>
        <label>Cell text (drag cells on the canvas to reorder)</label>
        <div data-role="cells-list" class="grid-cells-list"></div>
      `;
      renderCellInputs();

      fieldWrap.querySelector('[data-role="cols-input"]').addEventListener('input', () => {
        resizeCells(); markDirty(); renderCanvas(); renderCellInputs();
      });
      fieldWrap.querySelector('[data-role="rows-input"]').addEventListener('input', () => {
        resizeCells(); markDirty(); renderCanvas(); renderCellInputs();
      });
      fieldWrap.querySelector('[data-role="gap-input"]').addEventListener('input', e => {
        block.props.gap = Number(e.target.value) || 0;
        markDirty();
        renderCanvas();
      });

      propsPanelEl.appendChild(fieldWrap);
      return;
    }

    if (field.type === 'image') {
      const currentUrl = block.props[field.key] || '';
      fieldWrap.innerHTML = `
        <label>${field.label}</label>
        ${currentUrl ? `<img class="field-thumb" src="${escapeHtml(currentUrl)}" alt="">` : ''}
        <div class="field-upload-row">
          <button type="button" class="btn btn-sm" data-role="upload-btn">Upload from computer</button>
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" data-role="upload-input" hidden>
        </div>
        <input type="url" placeholder="or paste an image URL" value="${escapeHtml(currentUrl)}" data-role="url-input">
        <div class="field-upload-status" data-role="upload-status"></div>
      `;

      const urlInput = fieldWrap.querySelector('[data-role="url-input"]');
      const uploadBtn = fieldWrap.querySelector('[data-role="upload-btn"]');
      const uploadInput = fieldWrap.querySelector('[data-role="upload-input"]');
      const statusEl = fieldWrap.querySelector('[data-role="upload-status"]');

      urlInput.addEventListener('input', e => {
        block.props[field.key] = e.target.value;
        markDirty();
        renderCanvas();
      });

      uploadBtn.addEventListener('click', () => uploadInput.click());

      uploadInput.addEventListener('change', async () => {
        const file = uploadInput.files[0];
        if (!file) return;

        statusEl.textContent = 'Uploading…';
        uploadBtn.disabled = true;

        try {
          const formData = new FormData();
          formData.append('image', file);
          const res = await fetch('api/upload.php', { method: 'POST', body: formData });
          const data = await res.json();

          if (!res.ok || data.error) {
            statusEl.textContent = data.error || 'Upload failed.';
            uploadBtn.disabled = false;
            return;
          }

          block.props[field.key] = data.url;
          markDirty();
          renderCanvas();
          renderPropsPanel();
        } catch (err) {
          statusEl.textContent = 'Upload failed. Check your connection and try again.';
          uploadBtn.disabled = false;
        }
      });

      propsPanelEl.appendChild(fieldWrap);
      return;
    }

    if (field.type === 'align') {
      fieldWrap.innerHTML = `<label>${field.label}</label>
        <div class="align-group">
          <button type="button" data-val="left">Left</button>
          <button type="button" data-val="center">Center</button>
          <button type="button" data-val="right">Right</button>
        </div>`;
      const buttons = fieldWrap.querySelectorAll('button');
      buttons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === block.props[field.key]);
        btn.addEventListener('click', () => {
          block.props[field.key] = btn.dataset.val;
          markDirty();
          renderCanvas();
          buttons.forEach(b => b.classList.toggle('active', b === btn));
        });
      });
      propsPanelEl.appendChild(fieldWrap);
      return;
    }

    if (field.type === 'select') {
      const options = field.options.map(opt =>
        `<option value="${opt.value}" ${block.props[field.key] === opt.value ? 'selected' : ''}>${opt.label}</option>`
      ).join('');
      fieldWrap.innerHTML = `<label>${field.label}</label><select>${options}</select>`;
      fieldWrap.querySelector('select').addEventListener('change', e => {
        block.props[field.key] = e.target.value;
        markDirty();
        renderCanvas();
      });
      propsPanelEl.appendChild(fieldWrap);
      return;
    }

    if (field.type === 'color') {
      const val = block.props[field.key] || '#000000';
      fieldWrap.innerHTML = `<label>${field.label}</label>
        <div class="color-row">
          <input type="color" value="${val}">
          <input type="text" value="${val}" data-role="color-text">
        </div>`;
      const colorInput = fieldWrap.querySelector('input[type="color"]');
      const textInput = fieldWrap.querySelector('[data-role="color-text"]');
      colorInput.addEventListener('input', e => {
        block.props[field.key] = e.target.value;
        textInput.value = e.target.value;
        markDirty();
        renderCanvas();
      });
      textInput.addEventListener('input', e => {
        block.props[field.key] = e.target.value;
        markDirty();
        renderCanvas();
      });
      propsPanelEl.appendChild(fieldWrap);
      return;
    }

    if (field.type === 'number') {
      fieldWrap.innerHTML = `<label>${field.label}</label><input type="number" value="${block.props[field.key]}">`;
      fieldWrap.querySelector('input').addEventListener('input', e => {
        block.props[field.key] = Number(e.target.value) || 0;
        markDirty();
        renderCanvas();
      });
      propsPanelEl.appendChild(fieldWrap);
      return;
    }

    if (field.type === 'textarea') {
      fieldWrap.innerHTML = `<label>${field.label}</label><textarea rows="4">${escapeHtml(block.props[field.key] || '')}</textarea>`;
      fieldWrap.querySelector('textarea').addEventListener('input', e => {
        block.props[field.key] = e.target.value;
        markDirty();
        renderCanvas();
      });
      propsPanelEl.appendChild(fieldWrap);
      return;
    }

    // text / url default
    fieldWrap.innerHTML = `<label>${field.label}</label><input type="${field.type === 'url' ? 'url' : 'text'}" value="${escapeHtml(block.props[field.key] || '')}">`;
    fieldWrap.querySelector('input').addEventListener('input', e => {
      block.props[field.key] = e.target.value;
      markDirty();
      renderCanvas();
    });
    propsPanelEl.appendChild(fieldWrap);
  });
}

// ---------- Save / load / publish / preview / export ----------
async function loadPage() {
  if (!state.id) {
    renderPalette();
    renderCanvas();
    renderPropsPanel();
    return;
  }
  const res = await fetch(`api/load.php?id=${state.id}`);
  const data = await res.json();
  if (data.error) {
    alert(data.error);
    return;
  }
  state.name = data.name;
  state.blocks = (data.content?.blocks || []).map(b => ({ ...b, layout: normalizeLayout(b.layout) }));
  state.settings = data.content?.settings || state.settings;
  pageNameInput.value = state.name;
  renderPalette();
  renderCanvas();
  renderPropsPanel();
}

async function savePage() {
  state.name = pageNameInput.value.trim() || 'Untitled Page';
  const res = await fetch('api/save.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: state.id,
      name: state.name,
      content: { blocks: state.blocks, settings: state.settings }
    })
  });
  const data = await res.json();
  if (data.error) {
    alert(data.error);
    return;
  }
  if (!state.id) {
    state.id = data.id;
    const url = new URL(window.location);
    url.searchParams.set('id', state.id);
    window.history.replaceState({}, '', url);
  }
  markSaved();
}

async function publishPage() {
  if (state.dirty || !state.id) {
    await savePage();
  }
  const res = await fetch('api/publish.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: state.id })
  });
  const data = await res.json();
  if (data.error) {
    alert(data.error);
    return;
  }
  window.open(data.url, 'sitebuilder_publish');
}

async function previewPage() {
  if (state.dirty || !state.id) {
    await savePage();
  }
  window.open(`api/preview.php?id=${state.id}`, 'sitebuilder_preview');
}

function exportTemplate() {
  const payload = {
    name: state.name,
    content: { blocks: state.blocks, settings: state.settings }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = state.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
  a.href = url;
  a.download = `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('saveBtn').addEventListener('click', savePage);
document.getElementById('publishBtn').addEventListener('click', publishPage);
document.getElementById('previewBtn').addEventListener('click', previewPage);
document.getElementById('exportBtn').addEventListener('click', exportTemplate);
pageNameInput.addEventListener('input', markDirty);

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    savePage();
  }
});

loadPage();
