// Command-pattern store with coalesced undo/redo.
// Separates transient state (drag in progress, typing) from committed state.
// Commands are pure: each has validate(), apply() → new state, inverse() → command to undo.

const Store = (() => {
  let _page = null;       // committed page IR
  let _past = [];         // undo stack (snapshots)
  let _future = [];       // redo stack
  let _listeners = [];    // change subscribers
  let _selectedId = null; // UI selection
  let _breakpoint = 'base'; // current editing breakpoint
  let _dirty = false;     // unsaved changes flag
  let _lastCommandKey = null;
  let _lastCommandTime = 0;
  let _coalesceWindow = 500; // ms — commands with same key within this window coalesce

  const HISTORY_LIMIT = 100;

  // ---- Core API ----

  function getPage() {
    return _page;
  }

  function setPage(page) {
    _page = page;
    _past = [];   // snapshots BEFORE each change
    _future = [];
    _dirty = false;
    _lastCommandKey = null;
    notify();
  }

  function getSelectedId() {
    return _selectedId;
  }

  function setSelectedId(id) {
    if (_selectedId === id) return;
    _selectedId = id;
    notify();
  }

  function getBreakpoint() {
    return _breakpoint;
  }

  function setBreakpoint(bp) {
    if (_breakpoint === bp) return;
    _breakpoint = bp;
    notify();
  }

  function isDirty() {
    return _dirty;
  }

  function markSaved() {
    _dirty = false;
    notify();
  }

  function subscribe(fn) {
    _listeners.push(fn);
    return () => {
      _listeners = _listeners.filter(l => l !== fn);
    };
  }

  function notify() {
    const snapshot = {
      page: _page,
      selectedId: _selectedId,
      breakpoint: _breakpoint,
      dirty: _dirty,
      canUndo: _past.length > 0,
      canRedo: _future.length > 0
    };
    _listeners.forEach(fn => fn(snapshot));
  }

  // ---- Snapshot / history ----

  function snapshot() {
    return JSON.stringify({
      page: _page,
      selectedId: _selectedId
    });
  }

  function restoreSnapshot(snap) {
    const data = JSON.parse(snap);
    _page = data.page;
    _selectedId = data.selectedId;
    // Ensure selected node still exists
    if (_selectedId && !_page.nodes[_selectedId]) {
      _selectedId = null;
    }
  }

  // ---- Command dispatch ----

  function dispatch(command) {
    if (!_page) return false;

    // Validate
    if (command.validate && !command.validate(_page)) {
      return false;
    }

    // Coalescing: identical editing target within a short window becomes ONE
    // undo step. The pre-change snapshot was already stored by the first
    // command in the run, so the whole run undoes/redoes atomically.
    const key = command.coalesceKey || command.type;
    const now = Date.now();
    const shouldCoalesce = (
      command.coalesce !== false &&
      _lastCommandKey === key &&
      (now - _lastCommandTime) < _coalesceWindow &&
      _past.length > 0
    );

    // Snapshot before applying
    const before = snapshot();

    // Apply
    const nextPage = command.apply(_page);
    if (!nextPage) return false;

    _page = nextPage;

    // History management
    if (!shouldCoalesce) {
      _past.push(before);
      if (_past.length > HISTORY_LIMIT) {
        _past.shift();
      }
    }
    _future = [];

    _lastCommandKey = key;
    _lastCommandTime = now;
    _dirty = true;
    notify();
    return true;
  }

  function undo() {
    if (_past.length === 0) return false;
    _future.push(snapshot());
    restoreSnapshot(_past.pop());
    _lastCommandKey = null;
    _dirty = true;
    notify();
    return true;
  }

  function redo() {
    if (_future.length === 0) return false;
    _past.push(snapshot());
    restoreSnapshot(_future.pop());
    _lastCommandKey = null;
    _dirty = true;
    notify();
    return true;
  }

  function canUndo() {
    return _past.length > 0;
  }

  function canRedo() {
    return _future.length > 0;
  }

  function getHistoryDepth() {
    return { past: _past.length, future: _future.length };
  }

  // ---- Page creation ----

  function createEmptyPage(name = 'Untitled Page') {
    const rootId = NodeUtils.genId('page');
    return {
      id: rootId,
      name,
      rootId,
      nodes: {
        [rootId]: {
          id: rootId,
          type: 'page',
          children: [],
          props: {},
          style: {},
          meta: {}
        }
      },
      settings: {
        pageTitle: name,
        pageDescription: '',
        pageBackground: '#FFFFFF',
        fontFamily: 'Inter, system-ui, sans-serif',
        maxContentWidth: '1200px',
        favicon: '',
        ogImage: '',
        ogTitle: '',
        ogDescription: ''
      },
      tokens: {
        colors: {
          primary: '#146EF5',
          secondary: '#7C3AED',
          accent: '#F59E0B',
          background: '#FFFFFF',
          surface: '#F8FAFC',
          text: '#0F172A',
          textMuted: '#64748B'
        },
        fonts: {
          heading: 'Poppins',
          body: 'Inter',
          accent: 'JetBrains Mono'
        },
        spacing: {
          xs: '8px',
          sm: '16px',
          md: '24px',
          lg: '48px',
          xl: '80px'
        },
        radii: {
          sm: '4px',
          md: '8px',
          lg: '16px',
          full: '9999px'
        },
        shadows: {
          sm: '0 1px 2px rgba(0,0,0,0.05)',
          md: '0 4px 6px rgba(0,0,0,0.07)',
          lg: '0 10px 15px rgba(0,0,0,0.1)'
        }
      },
      customCSS: '',
      meta: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
  }

  // ---- Migration from old format ----

  function migrateFromOldFormat(content) {
    // content = { blocks: [...], settings: {...} }
    const page = createEmptyPage();
    if (content.settings) {
      Object.assign(page.settings, content.settings);
    }

    const blocks = content.blocks || [];
    blocks.forEach(block => {
      const node = {
        id: block.id || NodeUtils.genId(),
        type: mapOldType(block.type),
        children: [],
        props: { ...block.props },
        style: { base: {} },
        meta: {}
      };

      // Map old layout to style
      if (block.layout) {
        if (block.layout.minHeight) {
          node.style.base['min-height'] = block.layout.minHeight + 'px';
        }
      }

      page.nodes[node.id] = node;
      page.nodes[page.rootId].children.push(node.id);
    });

    return page;
  }

  function mapOldType(oldType) {
    const map = {
      'hero': 'hero',
      'heading': 'heading',
      'text': 'text',
      'image': 'image',
      'button': 'button',
      'spacer': 'spacer',
      'divider': 'divider',
      'columns': 'flex',
      'grid': 'grid',
      'nav': 'navbar',
      'html': 'custom-html'
    };
    return map[oldType] || oldType;
  }

  // ---- Navbar link normalization ----
  // Older pages stored navbar links as a single string prop (`links`).
  // Convert them into real `nav-link` child nodes so each link can be selected
  // and styled individually. Idempotent: skips navbars that already have children.
  function normalizeNavLinks(page) {
    if (!page || !page.nodes) return page;
    let changed = false;
    const np = NodeUtils.deepClone(page);

    Object.values(np.nodes).forEach(node => {
      if (!node || node.type !== 'navbar') return;
      if (!Array.isArray(node.children)) node.children = [];
      if (node.children.length > 0) return;
      const raw = String((node.props && node.props.links) || '').trim();
      if (!raw) return;

      raw.split('|').map(s => s.trim()).filter(Boolean).forEach(pair => {
        const idx = pair.indexOf(':');
        const label = (idx === -1 ? pair : pair.slice(0, idx)).trim();
        const url = (idx === -1 ? '#' : pair.slice(idx + 1)).trim() || '#';
        if (!label) return;
        const id = NodeUtils.genId('nl');
        np.nodes[id] = {
          id, type: 'nav-link', children: [],
          props: { label, url, newTab: false },
          style: { base: {} }, animations: {}, meta: {}
        };
        node.children.push(id);
      });
      node.props.links = '';
      changed = true;
    });

    return changed ? np : page;
  }

  // ---- Serialize for saving ----

  function serialize() {
    return {
      version: 2,
      page: _page
    };
  }

  function loadFromSerialized(data) {
    if (data.version === 2 && data.page) {
      setPage(normalizeNavLinks(data.page));
    } else if (data.blocks) {
      // Old format — migrate
      setPage(normalizeNavLinks(migrateFromOldFormat(data)));
    } else {
      setPage(createEmptyPage());
    }
  }

  return {
    getPage,
    setPage,
    getSelectedId,
    setSelectedId,
    getBreakpoint,
    setBreakpoint,
    isDirty,
    markSaved,
    subscribe,
    notify,
    dispatch,
    undo,
    redo,
    canUndo,
    canRedo,
    getHistoryDepth,
    createEmptyPage,
    migrateFromOldFormat,
    serialize,
    loadFromSerialized
  };
})();
