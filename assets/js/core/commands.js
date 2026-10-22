// All mutation commands for the store.
// Each command: { type, validate(page), apply(page) → newPage, inverse(page) → command, coalesce? }

const Commands = (() => {

  // ---- Node CRUD ----

  function addNode(parentId, node, index = -1) {
    return {
      type: 'ADD_NODE',
      validate(page) {
        const parent = page.nodes[parentId];
        if (!parent) return false;
        return NodeUtils.canBeChildOf(node.type, parent.type);
      },
      apply(page) {
        return NodeUtils.insertNode(page, parentId, node, index);
      },
      inverse(page) {
        return removeNode(node.id);
      },
      coalesce: false
    };
  }

  function removeNode(id) {
    return {
      type: 'REMOVE_NODE',
      validate(page) {
        // Can't remove the root
        return id !== page.rootId && !!page.nodes[id];
      },
      apply(page) {
        return NodeUtils.removeNode(page, id);
      },
      inverse(page) {
        // Re-insert the subtree — caller should capture the subtree before dispatching
        // For simplicity, this is a no-op inverse (deep clone would need the subtree)
        // We store the subtree in the command closure for a proper inverse
        return null;
      },
      coalesce: false
    };
  }

  // Better removeNode that captures the subtree for undo
  function removeNodeWithInverse(id) {
    let capturedSubtree = null;
    let capturedParentId = null;
    let capturedIndex = -1;

    return {
      type: 'REMOVE_NODE',
      validate(page) {
        if (id === page.rootId || !page.nodes[id]) return false;
        capturedParentId = NodeUtils.getParentId(page, id);
        capturedIndex = NodeUtils.getIndexInParent(page, id);
        // Capture subtree
        capturedSubtree = {};
        const collect = (nid) => {
          const node = page.nodes[nid];
          if (!node) return;
          capturedSubtree[nid] = JSON.parse(JSON.stringify(node));
          (node.children || []).forEach(collect);
        };
        collect(id);
        return true;
      },
      apply(page) {
        return NodeUtils.removeNode(page, id);
      },
      inverse() {
        // Build a command that re-inserts the captured subtree
        return {
          type: 'RESTORE_SUBTREE',
          validate: () => !!capturedSubtree,
          apply(page) {
            let newPage = JSON.parse(JSON.stringify(page));
            // Re-insert all captured nodes
            Object.entries(capturedSubtree).forEach(([nid, node]) => {
              newPage.nodes[nid] = node;
            });
            // Re-attach to parent
            if (capturedParentId && newPage.nodes[capturedParentId]) {
              const parent = newPage.nodes[capturedParentId];
              const insertAt = Math.min(capturedIndex, parent.children.length);
              parent.children.splice(insertAt, 0, id);
            }
            return newPage;
          },
          inverse() {
            return removeNodeWithInverse(id);
          },
          coalesce: false
        };
      },
      coalesce: false
    };
  }

  function moveNode(id, newParentId, newIndex = -1) {
    let oldParentId = null;
    let oldIndex = -1;

    return {
      type: 'MOVE_NODE',
      validate(page) {
        if (id === newParentId) return false;
        if (NodeUtils.isDescendant(page, id, newParentId)) return false;
        const node = page.nodes[id];
        const parent = page.nodes[newParentId];
        if (!node || !parent) return false;
        if (!NodeUtils.canBeChildOf(node.type, parent.type)) return false;
        oldParentId = NodeUtils.getParentId(page, id);
        oldIndex = NodeUtils.getIndexInParent(page, id);
        return true;
      },
      apply(page) {
        return NodeUtils.moveNode(page, id, newParentId, newIndex);
      },
      inverse() {
        return moveNode(id, oldParentId, oldIndex);
      },
      coalesce: false
    };
  }

  function duplicateNode(id) {
    return {
      type: 'DUPLICATE_NODE',
      validate(page) {
        return id !== page.rootId && !!page.nodes[id];
      },
      apply(page) {
        const newPage = JSON.parse(JSON.stringify(page));
        const source = newPage.nodes[id];
        if (!source) return page;

        // Deep clone the subtree
        const idMap = {};
        const cloneSubtree = (nid) => {
          const node = newPage.nodes[nid];
          const newId = NodeUtils.genId();
          idMap[nid] = newId;
          const clone = JSON.parse(JSON.stringify(node));
          clone.id = newId;
          clone.children = (node.children || []).map(cid => {
            cloneSubtree(cid);
            return idMap[cid];
          });
          newPage.nodes[newId] = clone;
          return newId;
        };

        const newRootId = cloneSubtree(id);

        // Insert after original
        const parentId = NodeUtils.getParentId(newPage, id);
        if (parentId && newPage.nodes[parentId]) {
          const parent = newPage.nodes[parentId];
          const idx = parent.children.indexOf(id);
          parent.children.splice(idx + 1, 0, newRootId);
        }

        return newPage;
      },
      inverse(page) {
        // Find the duplicate by looking at children after the original
        return null;
      },
      coalesce: false
    };
  }

  // ---- Style updates ----

  function setStyle(nodeId, breakpoint, property, value) {
    let oldValue;

    return {
      type: 'SET_STYLE',
      coalesceKey: `SET_STYLE:${nodeId}:${breakpoint}:${property}`,
      validate(page) {
        if (!page.nodes[nodeId]) return false;
        const node = page.nodes[nodeId];
        oldValue = node.style?.[breakpoint]?.[property];
        return true;
      },
      apply(page) {
        return NodeUtils.updateStyle(page, nodeId, breakpoint, property, value);
      },
      inverse() {
        return setStyle(nodeId, breakpoint, property, oldValue);
      },
      coalesce: true // typing in style fields should coalesce
    };
  }

  // ---- Props updates ----

  function setProp(nodeId, key, value) {
    let oldValue;

    return {
      type: 'SET_PROP',
      coalesceKey: `SET_PROP:${nodeId}:${key}`,
      validate(page) {
        if (!page.nodes[nodeId]) return false;
        oldValue = page.nodes[nodeId].props?.[key];
        return true;
      },
      apply(page) {
        return NodeUtils.updateProps(page, nodeId, key, value);
      },
      inverse() {
        return setProp(nodeId, key, oldValue);
      },
      coalesce: true
    };
  }

  // ---- Animation updates ----

  function setAnimation(nodeId, animationType, config) {
    let oldValue;

    return {
      type: 'SET_ANIMATION',
      coalesceKey: `SET_ANIMATION:${nodeId}:${animationType}`,
      validate(page) {
        if (!page.nodes[nodeId]) return false;
        oldValue = page.nodes[nodeId].animations?.[animationType];
        return true;
      },
      apply(page) {
        return NodeUtils.updateAnimation(page, nodeId, animationType, config);
      },
      inverse() {
        return setAnimation(nodeId, animationType, oldValue);
      },
      coalesce: true
    };
  }

  // ---- Page settings ----

  function setSetting(key, value) {
    let oldValue;

    return {
      type: 'SET_SETTING',
      coalesceKey: `SET_SETTING:${key}`,
      validate(page) {
        oldValue = page.settings?.[key];
        return true;
      },
      apply(page) {
        const newPage = JSON.parse(JSON.stringify(page));
        newPage.settings[key] = value;
        return newPage;
      },
      inverse() {
        return setSetting(key, oldValue);
      },
      coalesce: true
    };
  }

  // ---- Token updates ----

  function setToken(category, name, value) {
    let oldValue;

    return {
      type: 'SET_TOKEN',
      coalesceKey: `SET_TOKEN:${category}:${name}`,
      validate(page) {
        oldValue = page.tokens?.[category]?.[name];
        return true;
      },
      apply(page) {
        const newPage = JSON.parse(JSON.stringify(page));
        if (!newPage.tokens[category]) newPage.tokens[category] = {};
        newPage.tokens[category][name] = value;
        return newPage;
      },
      inverse() {
        return setToken(category, name, oldValue);
      },
      coalesce: true
    };
  }

  // ---- Custom CSS ----

  function setCustomCSS(css) {
    let oldValue;

    return {
      type: 'SET_CUSTOM_CSS',
      validate(page) {
        oldValue = page.customCSS || '';
        return true;
      },
      apply(page) {
        const newPage = JSON.parse(JSON.stringify(page));
        newPage.customCSS = css;
        return newPage;
      },
      inverse() {
        return setCustomCSS(oldValue);
      },
      coalesce: true
    };
  }

  return {
    addNode,
    removeNode: removeNodeWithInverse,
    moveNode,
    duplicateNode,
    setStyle,
    setProp,
    setAnimation,
    setSetting,
    setToken,
    setCustomCSS
  };
})();
