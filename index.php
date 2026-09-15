<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SiteBuilder</title>
<link rel="stylesheet" href="assets/css/editor.css">
<style>
  /* Fix: Ensure modal is hidden when hidden attribute is present */
  .modal-backdrop[hidden] {
    display: none !important;
  }

  /* Optional: smooth transition for better UX */
  .modal-backdrop {
    transition: opacity 0.2s ease;
  }
  .modal-backdrop[hidden] {
    opacity: 0;
    pointer-events: none;
  }
</style>
</head>
<body class="dash-body">
  <div class="dash-shell">
    <header class="dash-header">
      <div class="dash-brand">
        <span class="dash-mark">SB</span>
        <span>SiteBuilder</span>
      </div>
      <button id="newPageBtn" class="btn btn-accent">+ New project</button>
    </header>

    <main class="dash-main">
      <div class="dash-section-label">Your projects</div>
      <div id="emptyState" class="dash-empty" hidden>
        <p>No projects yet.</p>
        <p class="dash-empty-sub">Create your first landing page to get started.</p>
      </div>
      <div class="project-grid" id="projectGrid" hidden></div>
    </main>
  </div>

  <div class="modal-backdrop" id="newPageModal" hidden>
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">New project</span>
        <button class="modal-close" id="modalCloseBtn" aria-label="Close">&times;</button>
      </div>

      <div class="modal-section-label">Start from</div>
      <div class="template-grid" id="templateGrid">
        <button class="template-card blank-card" data-template="">
          <div class="template-card-swatch" style="background:repeating-linear-gradient(45deg,#2a2e38,#2a2e38 6px,#232630 6px,#232630 12px);"></div>
          <div class="template-card-name">Blank page</div>
          <div class="template-card-desc">Start with an empty canvas.</div>
        </button>
        <!-- template cards injected here -->
      </div>

      <div class="modal-section-label">Or import a template file</div>
      <div class="import-row">
        <p>Choose a .json template exported from SiteBuilder.</p>
        <label class="btn btn-sm" for="importFileInput">Choose file</label>
        <input type="file" id="importFileInput" accept="application/json,.json">
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" id="modalCancelBtn">Cancel</button>
      </div>
    </div>
  </div>

  <script src="assets/js/templates.js"></script>
  <script>
    (function() {
      'use strict';

      const projectGrid = document.getElementById('projectGrid');
      const emptyState = document.getElementById('emptyState');
      const newPageModal = document.getElementById('newPageModal');
      const templateGrid = document.getElementById('templateGrid');
      const importFileInput = document.getElementById('importFileInput');
      const newPageBtn = document.getElementById('newPageBtn');
      const modalCloseBtn = document.getElementById('modalCloseBtn');
      const modalCancelBtn = document.getElementById('modalCancelBtn');

      // ----- Helper to hide/show modal -----
      function showModal() {
        newPageModal.hidden = false;
      }
      function hideModal() {
        newPageModal.hidden = true;
      }

      // ----- Load pages -----
      async function loadPages() {
        try {
          const res = await fetch('api/list.php');
          const pages = await res.json();

          if (!Array.isArray(pages) || pages.length === 0) {
            emptyState.hidden = false;
            projectGrid.hidden = true;
            return;
          }

          emptyState.hidden = true;
          projectGrid.hidden = false;
          projectGrid.innerHTML = '';

          pages.forEach(page => {
            const updated = new Date(page.updated_at.replace(' ', 'T'));
            const updatedStr = updated.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

            const card = document.createElement('div');
            card.className = 'project-card';
            card.innerHTML = `
              <a class="project-card-swatch" href="editor.html?id=${page.id}">
                <span class="project-card-swatch-mark">${escapeHtml(page.name.slice(0, 1).toUpperCase())}</span>
              </a>
              <div class="project-card-body">
                <div class="project-card-top">
                  <span class="project-card-name">${escapeHtml(page.name)}</span>
                  <span class="badge ${page.is_published ? 'badge-live' : 'badge-draft'}">
                    ${page.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <div class="project-card-meta">Updated ${updatedStr}</div>
                <div class="project-card-actions">
                  <a class="btn btn-sm" href="editor.html?id=${page.id}">Edit</a>
                  ${page.is_published ? `<a class="btn btn-ghost btn-sm" href="published/${page.slug}.html" target="_blank">View live</a>` : ''}
                  <button class="btn btn-ghost btn-sm btn-danger" data-id="${page.id}" data-name="${escapeHtml(page.name)}">Delete</button>
                </div>
              </div>
            `;
            projectGrid.appendChild(card);
          });

          document.querySelectorAll('.btn-danger').forEach(btn => {
            btn.addEventListener('click', async () => {
              if (!confirm(`Delete "${btn.dataset.name}"? This can't be undone.`)) return;
              await fetch('api/delete.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: btn.dataset.id })
              });
              loadPages();
            });
          });
        } catch (err) {
          console.error('Failed to load pages:', err);
        }
      }

      function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
      }

      // ----- Template gallery -----
      if (typeof TEMPLATES !== 'undefined') {
        Object.entries(TEMPLATES).forEach(([id, tpl]) => {
          const btn = document.createElement('button');
          btn.className = 'template-card';
          btn.dataset.template = id;
          btn.innerHTML = `
            <div class="template-card-swatch" style="background:${tpl.content.settings.pageBackground || '#eee'};"></div>
            <div class="template-card-name">${escapeHtml(tpl.name)}</div>
            <div class="template-card-desc">${escapeHtml(tpl.description)}</div>
          `;
          btn.addEventListener('click', () => createPage(prompt('Page name:', tpl.name), tpl.content));
          templateGrid.appendChild(btn);
        });
      } else {
        console.warn('TEMPLATES is not defined. Check if templates.js loaded.');
      }

      // Blank card
      const blankCard = document.querySelector('.blank-card');
      if (blankCard) {
        blankCard.addEventListener('click', () => {
          createPage(prompt('Page name:', 'My New Page'), {
            blocks: [],
            settings: { pageTitle: 'My New Page', pageBackground: '#FFFFFF', fontFamily: 'Arial, Helvetica, sans-serif' }
          });
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
            alert('That file is not valid JSON.');
            importFileInput.value = '';
            return;
          }
          const content = parsed.content && Array.isArray(parsed.content.blocks) ? parsed.content : parsed;
          if (!Array.isArray(content.blocks)) {
            alert("This file doesn't look like a SiteBuilder template (no blocks found).");
            importFileInput.value = '';
            return;
          }
          const defaultName = parsed.name || file.name.replace(/\.json$/i, '');
          createPage(prompt('Page name:', defaultName), {
            blocks: content.blocks,
            settings: content.settings || { pageTitle: defaultName, pageBackground: '#FFFFFF', fontFamily: 'Arial, Helvetica, sans-serif' }
          });
          importFileInput.value = '';
        };
        reader.readAsText(file);
      });

      // ----- Create page -----
      async function createPage(name, content) {
        if (!name) return;
        try {
          const res = await fetch('api/save.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, content })
          });
          const data = await res.json();
          if (data.id) {
            window.location.href = `editor.html?id=${data.id}`;
          } else {
            alert(data.error || 'Failed to create page');
          }
        } catch (err) {
          alert('Network error: ' + err.message);
        }
      }

      // ----- Modal controls -----
      if (newPageBtn) {
        newPageBtn.addEventListener('click', showModal);
      }
      if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', hideModal);
      }
      if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', hideModal);
      }
      if (newPageModal) {
        // Click on backdrop (outside the modal box) closes it
        newPageModal.addEventListener('click', e => {
          if (e.target === newPageModal) hideModal();
        });
      }

      // ESC key closes modal
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && newPageModal && !newPageModal.hidden) {
          hideModal();
        }
      });

      // ----- Init -----
      loadPages();
    })();
  </script>
</body>
</html>