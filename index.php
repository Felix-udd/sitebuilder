<?php require_once __DIR__ . '/config/security.php'; sb_require_admin_access(false); ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SiteBuilder</title>
<link rel="stylesheet" href="assets/css/editor.css">
<link rel="stylesheet" href="assets/css/dashboard.css">
</head>
<body class="dash-body">
  <div class="dash-shell">
    <header class="dash-header">
      <div class="dash-brand">
        <span class="dash-mark">SB</span>
        <span>SiteBuilder</span>
      </div>
      <div class="dash-search">
        <input id="projectSearch" type="search" placeholder="Search projects&hellip;" autocomplete="off" aria-label="Search projects">
      </div>
      <div class="dash-header-actions">
        <a href="logout.php" class="btn btn-ghost" style="text-decoration:none;">Sign out</a>
        <button id="newPageBtn" class="btn btn-accent">+ New project</button>
      </div>
    </header>

    <main class="dash-main">
      <div class="dash-toolbar">
        <div class="dash-toolbar-left">
          <h1 class="dash-title">Your projects</h1>
          <span class="dash-count" id="projectCount">0</span>
        </div>
        <div class="dash-toolbar-right">
          <label class="dash-sort">
            Sort
            <select id="sortSelect" aria-label="Sort projects">
              <option value="updated">Last updated</option>
              <option value="created">Recently created</option>
              <option value="name">Name (A&ndash;Z)</option>
            </select>
          </label>
          <div class="dash-view" id="viewToggle" role="group" aria-label="Layout">
            <button type="button" data-view="grid" class="active" title="Grid view" aria-label="Grid view">&#9638;</button>
            <button type="button" data-view="list" title="List view" aria-label="List view">&#9776;</button>
          </div>
        </div>
      </div>

      <div class="project-grid" id="skeletonGrid" aria-hidden="true">
        <div class="skeleton-card">
          <div class="skeleton-swatch shimmer"></div>
          <div class="skeleton-body">
            <div class="skeleton-line shimmer" style="width:70%"></div>
            <div class="skeleton-line shimmer" style="width:45%"></div>
          </div>
        </div>
        <div class="skeleton-card">
          <div class="skeleton-swatch shimmer"></div>
          <div class="skeleton-body">
            <div class="skeleton-line shimmer" style="width:60%"></div>
            <div class="skeleton-line shimmer" style="width:40%"></div>
          </div>
        </div>
        <div class="skeleton-card">
          <div class="skeleton-swatch shimmer"></div>
          <div class="skeleton-body">
            <div class="skeleton-line shimmer" style="width:75%"></div>
            <div class="skeleton-line shimmer" style="width:50%"></div>
          </div>
        </div>
        <div class="skeleton-card">
          <div class="skeleton-swatch shimmer"></div>
          <div class="skeleton-body">
            <div class="skeleton-line shimmer" style="width:65%"></div>
            <div class="skeleton-line shimmer" style="width:42%"></div>
          </div>
        </div>
      </div>

      <div id="emptyState" class="dash-empty" hidden>
        <div class="dash-empty-icon">&#10024;</div>
        <p>No projects yet</p>
        <p class="dash-empty-sub">Create your first landing page and start building in minutes.</p>
        <button class="btn btn-accent" id="emptyCreateBtn">Create your first page</button>
      </div>

      <div id="dbErrorState" class="dash-empty dash-error" hidden>
        <div class="dash-empty-icon">&#9888;</div>
        <p>SiteBuilder needs a database connection</p>
        <p class="dash-empty-sub">Start MySQL in XAMPP and import <code>schema.sql</code> before creating a project.</p>
        <button class="btn" id="dbRetryBtn">Retry connection</button>
      </div>

      <div id="noResultsState" class="dash-empty" hidden>
        <div class="dash-empty-icon">&#128269;</div>
        <p id="noResultsText">No projects match your search</p>
        <p class="dash-empty-sub">Try a different name, or clear the search.</p>
        <button class="btn" id="clearSearchBtn">Clear search</button>
      </div>

      <div class="project-grid" id="projectGrid" hidden></div>
    </main>

    <footer class="dash-footer">SiteBuilder &middot; running locally</footer>
  </div>

  <div class="modal-backdrop" id="newPageModal" hidden>
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="newPageTitle">
      <div class="modal-header">
        <span class="modal-title" id="newPageTitle">New project</span>
        <button class="modal-close" id="modalCloseBtn" aria-label="Close">&times;</button>
      </div>

      <div class="modal-section-label">Project name</div>
      <div class="name-row">
        <input type="text" id="newPageName" placeholder="My New Page" autocomplete="off" aria-label="Project name" maxlength="120">
      </div>

      <div class="modal-section-label">Start from</div>
      <div class="template-grid" id="templateGrid">
        <button class="template-card blank-card" data-template="">
          <div class="template-card-swatch" style="background:repeating-linear-gradient(45deg,#e7eaf3,#e7eaf3 6px,#dfe4f0 6px,#dfe4f0 12px);"></div>
          <div class="template-card-name">Blank page</div>
          <div class="template-card-desc">Start with an empty canvas.</div>
        </button>
        <!-- template cards injected here -->
      </div>

      <div class="modal-section-label">Or import a template file</div>
      <div class="import-row">
        <p>Choose a <strong>.json</strong> template exported from SiteBuilder.</p>
        <label class="btn btn-sm" for="importFileInput">Choose file</label>
        <input type="file" id="importFileInput" accept="application/json,.json">
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" id="modalCancelBtn">Cancel</button>
      </div>
    </div>
  </div>

  <div class="toast" id="dashToast" role="status" aria-live="polite"></div>

  <script src="assets/js/core/node-utils.js"></script>
  <script src="assets/js/core/store.js"></script>
  <script src="assets/js/templates.js"></script>
  <script>
    (function() {
      'use strict';

      const projectGrid = document.getElementById('projectGrid');
      const skeletonGrid = document.getElementById('skeletonGrid');
      const emptyState = document.getElementById('emptyState');
      const dbErrorState = document.getElementById('dbErrorState');
      const noResultsState = document.getElementById('noResultsState');
      const noResultsText = document.getElementById('noResultsText');
      const projectCount = document.getElementById('projectCount');
      const searchInput = document.getElementById('projectSearch');
      const sortSelect = document.getElementById('sortSelect');
      const viewToggle = document.getElementById('viewToggle');
      const newPageModal = document.getElementById('newPageModal');
      const templateGrid = document.getElementById('templateGrid');
      const newPageName = document.getElementById('newPageName');
      const importFileInput = document.getElementById('importFileInput');
      const newPageBtn = document.getElementById('newPageBtn');
      const emptyCreateBtn = document.getElementById('emptyCreateBtn');
      const dbRetryBtn = document.getElementById('dbRetryBtn');
      const clearSearchBtn = document.getElementById('clearSearchBtn');
      const modalCloseBtn = document.getElementById('modalCloseBtn');
      const modalCancelBtn = document.getElementById('modalCancelBtn');
      const toastEl = document.getElementById('dashToast');

      const state = { pages: [], q: '', sort: 'updated', view: 'grid', loaded: false };

      // ----- Helpers -----
      function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str == null ? '' : str);
        return div.innerHTML;
      }

      function escapeAttr(str) {
        return escapeHtml(str).replace(/"/g, '&quot;');
      }

      function relTime(value) {
        if (!value) return '';
        const d = new Date(String(value).replace(' ', 'T'));
        if (isNaN(d.getTime())) return '';
        const diff = Math.floor((Date.now() - d.getTime()) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      }

      function swatch(name) {
        let h = 0;
        const s = String(name || 'page');
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
        return `linear-gradient(135deg, hsl(${h} 72% 62%), hsl(${(h + 42) % 360} 74% 50%))`;
      }

      let toastTimer;
      function toast(msg, isError) {
        toastEl.textContent = msg;
        toastEl.classList.toggle('toast-error', !!isError);
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
      }

      async function api(url, options) {
        const res = await fetch(url, options);
        let data = null;
        try { data = await res.json(); } catch (e) { data = null; }
        return { ok: res.ok, status: res.status, data: data };
      }

      function postJSON(url, payload) {
        return api(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      // ----- Load & render -----
      async function loadPages() {
        state.loaded = false;
        skeletonGrid.hidden = false;
        emptyState.hidden = true;
        dbErrorState.hidden = true;
        noResultsState.hidden = true;
        projectGrid.hidden = true;

        try {
          const { ok, status, data } = await api('api/list.php');
          skeletonGrid.hidden = true;

          if (!ok && data && data.error && status >= 500) {
            dbErrorState.hidden = false;
            return;
          }
          state.pages = Array.isArray(data) ? data : [];
          state.loaded = true;
          renderProjects();
        } catch (err) {
          skeletonGrid.hidden = true;
          dbErrorState.hidden = false;
          console.error('Failed to load pages:', err);
        }
      }

      function visiblePages() {
        let list = state.pages.slice();
        const q = state.q.trim().toLowerCase();
        if (q) {
          list = list.filter(p =>
            String(p.name).toLowerCase().includes(q) ||
            String(p.slug || '').toLowerCase().includes(q));
        }
        const byDate = key => (a, b) => String(b[key] || '').localeCompare(String(a[key] || ''));
        if (state.sort === 'name') list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        else if (state.sort === 'created') list.sort(byDate('updated_at'));
        else list.sort(byDate('updated_at'));
        return list;
      }

      function renderProjects() {
        projectCount.textContent = state.pages.length === 1 ? '1 project' : state.pages.length + ' projects';

        if (!state.pages.length) {
          emptyState.hidden = false;
          noResultsState.hidden = true;
          projectGrid.hidden = true;
          return;
        }

        const list = visiblePages();
        if (!list.length) {
          noResultsText.textContent = 'No projects match \u201c' + state.q.trim() + '\u201d';
          noResultsState.hidden = false;
          emptyState.hidden = true;
          projectGrid.hidden = true;
          return;
        }

        emptyState.hidden = true;
        noResultsState.hidden = true;
        projectGrid.hidden = false;
        projectGrid.classList.toggle('is-list', state.view === 'list');
        projectGrid.innerHTML = list.map(cardHTML).join('');
      }

      function cardHTML(page) {
        const initial = escapeHtml(String(page.name || '?').slice(0, 1).toUpperCase());
        const badge = page.is_published
          ? '<span class="badge badge-live">Published</span>'
          : '<span class="badge badge-draft">Draft</span>';
        const viewLive = page.is_published
          ? `<a class="btn btn-ghost btn-sm" href="published/${encodeURIComponent(page.slug)}.html" target="_blank" rel="noopener">View live</a>`
          : '';
        const copyLink = page.is_published
          ? `<button type="button" data-action="copylink" data-slug="${escapeAttr(page.slug)}">Copy live link</button>`
          : '';
        return `
          <div class="project-card" data-id="${page.id}" data-name="${escapeAttr(page.name)}" data-slug="${escapeAttr(page.slug)}">
            <a class="project-card-swatch" href="editor.php?id=${page.id}" style="background:${swatch(page.name)}" aria-label="Edit ${escapeAttr(page.name)}">
              <span class="project-card-swatch-mark">${initial}</span>
              <span class="project-card-open">Open editor</span>
            </a>
            <div class="project-card-body">
              <div class="project-card-top">
                <span class="project-card-name" title="${escapeAttr(page.name)}">${escapeHtml(page.name)}</span>
                ${badge}
              </div>
              <div class="project-card-meta">Updated ${relTime(page.updated_at)}</div>
              <div class="project-card-actions">
                <a class="btn btn-sm" href="editor.php?id=${page.id}">Edit</a>
                ${viewLive}
                <span class="spacer"></span>
                <div class="card-menu">
                  <button type="button" class="card-menu-btn" data-action="menu" aria-label="More actions" aria-haspopup="true">&#8943;</button>
                  <div class="card-menu-pop" hidden>
                    <button type="button" data-action="rename">Rename</button>
                    <button type="button" data-action="duplicate">Duplicate</button>
                    ${copyLink}
                    <div class="card-menu-sep"></div>
                    <button type="button" class="danger" data-action="delete">Delete</button>
                  </div>
                </div>
              </div>
            </div>
          </div>`;
      }

      // ----- Card interactions (delegated) -----
      projectGrid.addEventListener('click', async (e) => {
        const menuBtn = e.target.closest('[data-action="menu"]');
        if (menuBtn) {
          const pop = menuBtn.parentElement.querySelector('.card-menu-pop');
          const open = !pop.hidden;
          closeAllMenus();
          pop.hidden = open;
          if (!pop.hidden) menuBtn.closest('.project-card').style.zIndex = '50';
          return;
        }

        const actionBtn = e.target.closest('.card-menu-pop [data-action]');
        if (!actionBtn) return;
        const card = actionBtn.closest('.project-card');
        const id = card.dataset.id;
        const name = card.dataset.name;
        const slug = card.dataset.slug;
        const action = actionBtn.dataset.action;
        closeAllMenus();

        if (action === 'rename') return renamePage(id, name);
        if (action === 'duplicate') return duplicatePage(id, name);
        if (action === 'copylink') return copyLiveLink(slug);
        if (action === 'delete') return deletePage(id, name);
      });

      function closeAllMenus() {
        document.querySelectorAll('.card-menu-pop').forEach(p => { p.hidden = true; });
        document.querySelectorAll('.project-card').forEach(c => { c.style.zIndex = ''; });
      }

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.card-menu')) closeAllMenus();
      });

      async function renamePage(id, currentName) {
        const name = prompt('Rename project:', currentName);
        if (!name || name === currentName) return;
        const loaded = await api('api/load.php?id=' + encodeURIComponent(id));
        if (!loaded.data || loaded.data.error) { toast('Could not load project', true); return; }
        const saved = await postJSON('api/save.php', { id: Number(id), name: name, content: loaded.data.content });
        if (saved.ok && saved.data && saved.data.id) { toast('Project renamed'); loadPages(); }
        else toast((saved.data && saved.data.error) || 'Rename failed', true);
      }

      async function duplicatePage(id, name) {
        const loaded = await api('api/load.php?id=' + encodeURIComponent(id));
        if (!loaded.data || loaded.data.error) { toast('Could not load project', true); return; }
        const saved = await postJSON('api/save.php', { name: name + ' copy', content: loaded.data.content });
        if (saved.ok && saved.data && saved.data.id) { toast('Project duplicated'); loadPages(); }
        else toast((saved.data && saved.data.error) || 'Duplicate failed', true);
      }

      async function deletePage(id, name) {
        if (!confirm('Delete "' + name + '"? This can\'t be undone.')) return;
        const res = await postJSON('api/delete.php', { id: Number(id) });
        if (res.ok) { toast('Project deleted'); loadPages(); }
        else toast((res.data && res.data.error) || 'Delete failed', true);
      }

      function copyLiveLink(slug) {
        const url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'published/' + slug + '.html';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(() => toast('Live link copied'), () => toast(url));
        } else {
          toast(url);
        }
      }

      // ----- Toolbar -----
      let searchTimer;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { state.q = searchInput.value; renderProjects(); }, 120);
      });
      sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; renderProjects(); });
      viewToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-view]');
        if (!btn) return;
        state.view = btn.dataset.view;
        viewToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
        if (!projectGrid.hidden) projectGrid.classList.toggle('is-list', state.view === 'list');
      });
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        state.q = '';
        renderProjects();
        searchInput.focus();
      });
      dbRetryBtn.addEventListener('click', loadPages);

      // ----- Template gallery -----
      if (typeof TEMPLATES !== 'undefined') {
        Object.entries(TEMPLATES).forEach(([id, tpl]) => {
          const btn = document.createElement('button');
          btn.className = 'template-card';
          btn.dataset.template = id;
          const bg = (tpl.content && tpl.content.settings && tpl.content.settings.pageBackground) || '#e9edf6';
          btn.innerHTML = `
            <div class="template-card-swatch" style="background:${bg};"></div>
            <div class="template-card-name">${escapeHtml(tpl.name)}</div>
            <div class="template-card-desc">${escapeHtml(tpl.description)}</div>
          `;
          btn.addEventListener('click', () => {
            createPage(nameValue(tpl.name), { version: 2, page: Store.migrateFromOldFormat(tpl.content) });
          });
          templateGrid.appendChild(btn);
        });
      } else {
        console.warn('TEMPLATES is not defined. Check if templates.js loaded.');
      }

      // Blank card
      const blankCard = document.querySelector('.blank-card');
      if (blankCard) {
        blankCard.addEventListener('click', () => {
          const name = nameValue('My New Page');
          createPage(name, { version: 2, page: Store.createEmptyPage(name) });
        });
      }

      // Import file
      importFileInput.addEventListener('change', () => {
        const file = importFileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          let parsed;
          try {
            parsed = JSON.parse(reader.result);
          } catch (e) {
            toast('That file is not valid JSON.', true);
            importFileInput.value = '';
            return;
          }
          const legacy = parsed.content && Array.isArray(parsed.content.blocks)
            ? parsed.content
            : (Array.isArray(parsed.blocks) ? parsed : null);

          let content;
          if (parsed.version === 2 && parsed.page) {
            content = parsed;
          } else if (parsed.page && parsed.page.nodes) {
            content = { version: 2, page: parsed.page };
          } else if (legacy) {
            content = { version: 2, page: Store.migrateFromOldFormat(legacy) };
          } else {
            toast("This file doesn't look like a SiteBuilder template.", true);
            importFileInput.value = '';
            return;
          }

          const defaultName = parsed.name || file.name.replace(/\.json$/i, '');
          importFileInput.value = '';
          createPage(nameValue(defaultName), content);
        };
        reader.readAsText(file);
      });

      // ----- Create page -----
      // Resolve a project name from the modal field, falling back to a default.
      function nameValue(fallback) {
        const typed = (newPageName && newPageName.value || '').trim();
        return typed || fallback || 'Untitled Page';
      }

      async function createPage(name, content) {
        name = String(name || '').trim();
        if (!name) {
          if (newPageName) {
            newPageName.classList.add('error');
            newPageName.focus();
          }
          toast('Please enter a project name.', true);
          return;
        }
        try {
          const res = await postJSON('api/save.php', { name: name, content: content });
          if (res.data && res.data.id) {
            window.location.href = 'editor.php?id=' + res.data.id;
          } else if (res.data && res.data.error && /Database|connection|MySQL|table|schema/i.test(res.data.error)) {
            hideModal();
            dbErrorState.hidden = false;
            emptyState.hidden = true;
            projectGrid.hidden = true;
            toast('Database setup is missing.', true);
          } else {
            toast((res.data && res.data.error) || 'Failed to create page', true);
          }
        } catch (err) {
          toast('Network error: ' + err.message, true);
        }
      }

      // ----- Modal controls -----
      function showModal() {
        if (newPageName) {
          newPageName.value = '';
          newPageName.classList.remove('error');
        }
        newPageModal.hidden = false;
        if (newPageName) setTimeout(() => newPageName.focus(), 30);
      }
      function hideModal() { newPageModal.hidden = true; }

      if (newPageName) {
        newPageName.addEventListener('input', () => newPageName.classList.remove('error'));
        newPageName.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const name = nameValue('My New Page');
            createPage(name, { version: 2, page: Store.createEmptyPage(name) });
          }
        });
      }

      if (newPageBtn) newPageBtn.addEventListener('click', showModal);
      if (emptyCreateBtn) emptyCreateBtn.addEventListener('click', showModal);
      if (modalCloseBtn) modalCloseBtn.addEventListener('click', hideModal);
      if (modalCancelBtn) modalCancelBtn.addEventListener('click', hideModal);
      if (newPageModal) {
        newPageModal.addEventListener('click', e => { if (e.target === newPageModal) hideModal(); });
      }
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          if (newPageModal && !newPageModal.hidden) hideModal();
          closeAllMenus();
        }
      });

      // ----- Init -----
      loadPages();
    })();
  </script>
</body>
</html>
