// Layers Panel: hierarchical tree view of the page nodes.
// Supports expand/collapse, click-to-select, drag reorder, and nesting display.

const Layers = (() => {
  let collapsed = new Set(); // collapsed node ids
  const hidden = new Set();  // hidden node ids (editor-only visibility)

  function render() {
    const page = Store.getPage();
    const treeEl = document.getElementById('layersTree');
    if (!page || !treeEl) return;

    const selId = Store.getSelectedId();
    treeEl.innerHTML = renderNode(page, page.rootId, 0, selId);

    attachEvents(treeEl);
  }

  function renderNode(page, nodeId, depth, selId) {
    const node = page.nodes[nodeId];
    if (!node) return '';

    const def = BLOCK_REGISTRY[node.type];
    const label = def ? def.label : node.type;
    const icon = def ? def.icon : '◻';
    const hasChildren = node.children && node.children.length > 0;
    const isCollapsed = collapsed.has(nodeId);
    const isSel = nodeId === selId;
    const isRoot = nodeId === page.rootId;
    const isHidden = hidden.has(nodeId);

    const childrenHtml = (hasChildren && !isCollapsed)
      ? node.children.map(cid => renderNode(page, cid, depth + 1, selId)).join('')
      : '';

    return `
      <div class="layer-item ${isSel ? 'is-selected' : ''} ${isRoot ? 'layer-root' : ''}" data-layer-id="${nodeId}" draggable="${!isRoot}">
        <div class="layer-row" style="padding-left:${depth * 16 + 6}px">
          ${hasChildren
            ? `<button class="layer-toggle ${isCollapsed ? 'collapsed' : ''}" data-toggle="${nodeId}">▸</button>`
            : '<span class="layer-toggle-spacer"></span>'}
          <span class="layer-icon">${icon}</span>
          <span class="layer-label" title="${escapeA(node.type)}">${escapeH(label)}</span>
          <button class="layer-eye ${isHidden ? '' : 'visible'}" data-hide="${nodeId}" title="Toggle visibility">${isHidden ? '🚫' : '👁'}</button>
        </div>
        ${childrenHtml}
      </div>`;
  }

  function attachEvents(treeEl) {
    // Select on click
    treeEl.querySelectorAll('.layer-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-toggle]') || e.target.closest('[data-hide]')) return;
        const id = row.parentElement.dataset.layerId;
        Store.setSelectedId(id);
      });
    });

    // Expand/collapse
    treeEl.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.toggle;
        if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
        render();
      });
    });

    // Visibility toggle (editor-only; sets display:none style)
    treeEl.querySelectorAll('[data-hide]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.hide;
        const isHidden = hidden.has(id);
        if (isHidden) {
          hidden.delete(id);
          Store.dispatch(Commands.setStyle(id, Store.getBreakpoint(), 'display', null));
        } else {
          hidden.add(id);
          Store.dispatch(Commands.setStyle(id, Store.getBreakpoint(), 'display', 'none'));
        }
        render();
      });
    });

    // Drag reorder within layers
    let dragLayerId = null;
    treeEl.querySelectorAll('.layer-item[draggable="true"]').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        dragLayerId = item.dataset.layerId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragLayerId);
        item.classList.add('is-dragging');
      });
      item.addEventListener('dragend', () => {
        dragLayerId = null;
        treeEl.querySelectorAll('.is-dragging,.is-drop-target').forEach(el =>
          el.classList.remove('is-dragging', 'is-drop-target'));
      });
      item.addEventListener('dragover', (e) => {
        if (!dragLayerId) return;
        e.preventDefault();
        item.classList.add('is-drop-target');
      });
      item.addEventListener('dragleave', () => item.classList.remove('is-drop-target'));
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.classList.remove('is-drop-target');
        if (!dragLayerId || dragLayerId === item.dataset.layerId) return;

        const targetId = item.dataset.layerId;
        const page = Store.getPage();
        const targetNode = page.nodes[targetId];
        const dragNode = page.nodes[dragLayerId];
        if (!targetNode || !dragNode) return;

        // Drop INTO target if it's a container, else drop as sibling before it
        if (NodeUtils.canHaveChildren(targetNode.type)) {
          Store.dispatch(Commands.moveNode(dragLayerId, targetId, targetNode.children.length));
        } else {
          const parentId = NodeUtils.getParentId(page, targetId);
          const idx = NodeUtils.getIndexInParent(page, targetId);
          if (parentId) Store.dispatch(Commands.moveNode(dragLayerId, parentId, idx));
        }
        dragLayerId = null;
      });
    });
  }

  // Expand ancestors of a node so it becomes visible in the tree
  function revealNode(nodeId) {
    const page = Store.getPage();
    if (!page) return;
    const ancestors = NodeUtils.getAncestors(page, nodeId);
    let changed = false;
    ancestors.forEach(a => { if (collapsed.has(a)) { collapsed.delete(a); changed = true; } });
    if (changed) render();
  }

  function escapeH(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
  function escapeA(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  return { render, revealNode };
})();
