// Node utilities for the flat node-map IR.
// The IR is a page object: { id, name, nodes: { [id]: Node }, rootId, settings, tokens, meta }
// Node = { id, type, children: [ids], props, style, layout, animations, meta }
// All tree operations are pure — they return new objects, never mutate.

const NodeUtils = (() => {
  let _counter = 0;

  function genId(prefix = 'n') {
    _counter++;
    return prefix + Date.now().toString(36) + _counter.toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Get a node by id from the page
  function getNode(page, id) {
    return page.nodes[id] || null;
  }

  // Get children of a node as node objects
  function getChildren(page, id) {
    const node = page.nodes[id];
    if (!node) return [];
    return node.children.map(cid => page.nodes[cid]).filter(Boolean);
  }

  // Get child ids of a node
  function getChildIds(page, id) {
    const node = page.nodes[id];
    return node ? [...node.children] : [];
  }

  // Find the parent id of a node
  function getParentId(page, id) {
    for (const [nid, node] of Object.entries(page.nodes)) {
      if (node.children && node.children.includes(id)) return nid;
    }
    return null;
  }

  // Get the full ancestor chain from root to a node (array of ids)
  function getAncestors(page, id) {
    const chain = [];
    let current = id;
    while (current) {
      const parentId = getParentId(page, current);
      if (!parentId) break;
      chain.unshift(parentId);
      current = parentId;
    }
    return chain;
  }

  // Get breadcrumb path (nodes from root to target, excluding root)
  function getBreadcrumb(page, id) {
    const ancestors = getAncestors(page, id);
    return [...ancestors, id].map(aid => page.nodes[aid]).filter(Boolean);
  }

  // Get the index of a node within its parent's children
  function getIndexInParent(page, id) {
    const parentId = getParentId(page, id);
    if (!parentId) return -1;
    const parent = page.nodes[parentId];
    return parent.children.indexOf(id);
  }

  // Depth-first traversal: visits every node in the tree
  function traverse(page, callback, startId = null) {
    const rootId = startId || page.rootId;
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop();
      const node = page.nodes[id];
      if (!node) continue;
      callback(node, id);
      if (node.children) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push(node.children[i]);
        }
      }
    }
  }

  // Collect all descendant ids of a node (not including the node itself)
  function getDescendantIds(page, id) {
    const result = [];
    const node = page.nodes[id];
    if (!node) return result;
    const stack = [...(node.children || [])];
    while (stack.length) {
      const cid = stack.pop();
      const child = page.nodes[cid];
      if (!child) continue;
      result.push(cid);
      if (child.children) {
        stack.push(...child.children);
      }
    }
    return result;
  }

  // Check if nodeId is a descendant of ancestorId
  function isDescendant(page, ancestorId, nodeId) {
    return getDescendantIds(page, ancestorId).includes(nodeId);
  }

  // Insert a node into the tree. Returns a NEW page (immutable).
  // parentId: where to insert; index: position within parent's children
  function insertNode(page, parentId, node, index = -1) {
    const newPage = deepClone(page);
    newPage.nodes[node.id] = node;

    const parent = newPage.nodes[parentId];
    if (parent) {
      if (index < 0 || index > parent.children.length) {
        parent.children.push(node.id);
      } else {
        parent.children.splice(index, 0, node.id);
      }
    }
    return newPage;
  }

  // Remove a node and all its descendants. Returns a NEW page.
  function removeNode(page, id) {
    const newPage = deepClone(page);
    const descendantIds = getDescendantIds(newPage, id);
    const allToRemove = [id, ...descendantIds];

    // Remove from parent's children
    const parentId = getParentId(newPage, id);
    if (parentId && newPage.nodes[parentId]) {
      const parent = newPage.nodes[parentId];
      const idx = parent.children.indexOf(id);
      if (idx !== -1) parent.children.splice(idx, 1);
    }

    // Delete all nodes
    allToRemove.forEach(nid => delete newPage.nodes[nid]);
    return newPage;
  }

  // Move a node to a new parent/position. Returns a NEW page.
  function moveNode(page, id, newParentId, newIndex = -1) {
    if (id === newParentId) return page;
    if (isDescendant(page, id, newParentId)) return page; // can't move into own descendant

    const newPage = deepClone(page);
    const node = newPage.nodes[id];
    const oldParentId = getParentId(newPage, id);

    if (!node || !oldParentId) return page;

    // Remove from old parent
    const oldParent = newPage.nodes[oldParentId];
    const oldIdx = oldParent.children.indexOf(id);
    if (oldIdx !== -1) oldParent.children.splice(oldIdx, 1);

    // Insert into new parent
    const newParent = newPage.nodes[newParentId];
    if (!newParent) return page;

    // Adjust index if moving within same parent and old index was before new index
    if (oldParentId === newParentId && oldIdx < newIndex) {
      newIndex--;
    }

    if (newIndex < 0 || newIndex > newParent.children.length) {
      newParent.children.push(id);
    } else {
      newParent.children.splice(newIndex, 0, id);
    }

    return newPage;
  }

  // Update a node's properties. Returns a NEW page.
  function updateNode(page, id, updates) {
    const newPage = deepClone(page);
    const node = newPage.nodes[id];
    if (!node) return page;
    Object.assign(node, updates);
    return newPage;
  }

  // Update a node's style for a specific breakpoint. Returns a NEW page.
  // style = { base: {...}, tablet: {...}, mobile: {...} }
  function updateStyle(page, id, breakpoint, property, value) {
    const newPage = deepClone(page);
    const node = newPage.nodes[id];
    if (!node) return page;

    if (!node.style) node.style = {};
    if (!node.style[breakpoint]) node.style[breakpoint] = {};

    if (value === null || value === undefined || value === '') {
      delete node.style[breakpoint][property];
      // Clean up empty breakpoint objects
      if (Object.keys(node.style[breakpoint]).length === 0) {
        delete node.style[breakpoint];
      }
    } else {
      node.style[breakpoint][property] = value;
    }
    return newPage;
  }

  // Update a node's props. Returns a NEW page.
  function updateProps(page, id, key, value) {
    const newPage = deepClone(page);
    const node = newPage.nodes[id];
    if (!node) return page;
    if (!node.props) node.props = {};
    node.props[key] = value;
    return newPage;
  }

  // Update a node's animation. Returns a NEW page.
  function updateAnimation(page, id, animationType, config) {
    const newPage = deepClone(page);
    const node = newPage.nodes[id];
    if (!node) return page;
    if (!node.animations) node.animations = {};
    if (config === null) {
      delete node.animations[animationType];
    } else {
      node.animations[animationType] = config;
    }
    return newPage;
  }

  // Resolve effective styles for a node at a given breakpoint.
  // Merges base -> tablet -> mobile (desktop-first cascade).
  function resolveStyles(node, breakpoint = 'base') {
    const merged = { ...(node.style?.base || {}) };
    if (breakpoint === 'tablet' || breakpoint === 'mobile') {
      Object.assign(merged, node.style?.tablet || {});
    }
    if (breakpoint === 'mobile') {
      Object.assign(merged, node.style?.mobile || {});
    }
    return merged;
  }

  // Get only the properties that differ at a breakpoint (for CSS generation).
  function getBreakpointOverrides(node, breakpoint) {
    return { ...(node.style?.[breakpoint] || {}) };
  }

  // Check if a node type can have children
  function canHaveChildren(type) {
    const containerTypes = ['page', 'section', 'container', 'flex', 'grid', 'stack', 'navbar', 'footer', 'html-element'];
    return containerTypes.includes(type);
  }

  // Check if a node type can be a child of another type
  function canBeChildOf(childType, parentType) {
    if (!canHaveChildren(parentType)) return false;
    // Page can hold anything
    if (parentType === 'page') return true;
    // Containers can hold most things
    const containerTypes = ['section', 'container', 'flex', 'grid', 'stack', 'html-element'];
    if (containerTypes.includes(parentType)) return true;
    // Navbar and footer have restricted children
    if (parentType === 'navbar' || parentType === 'footer') {
      return ['container', 'flex', 'logo', 'nav-links', 'nav-link', 'button', 'text', 'image', 'icon', 'social-icons', 'heading', 'form', 'input', 'textarea', 'select', 'submit-button', 'divider', 'spacer'].includes(childType);
    }
    return false;
  }

  // Count nodes in the tree
  function countNodes(page) {
    return Object.keys(page.nodes).length;
  }

  // Get a flat ordered list of all content nodes (for keyboard navigation)
  function getFlatOrder(page) {
    const result = [];
    traverse(page, (node) => {
      result.push(node.id);
    });
    return result;
  }

  return {
    genId,
    deepClone,
    getNode,
    getChildren,
    getChildIds,
    getParentId,
    getAncestors,
    getBreadcrumb,
    getIndexInParent,
    traverse,
    getDescendantIds,
    isDescendant,
    insertNode,
    removeNode,
    moveNode,
    updateNode,
    updateStyle,
    updateProps,
    updateAnimation,
    resolveStyles,
    getBreakpointOverrides,
    canHaveChildren,
    canBeChildOf,
    countNodes,
    getFlatOrder
  };
})();
