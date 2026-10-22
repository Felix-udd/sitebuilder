<?php require_once __DIR__ . '/config/security.php'; sb_require_admin_access(false); ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SiteBuilder — Editor</title>
<link rel="stylesheet" href="assets/css/editor.css">
<link rel="stylesheet" href="assets/css/site-blocks.css">
</head>
<body>
  <div class="editor-shell v2">
    <!-- TOP BAR -->
    <header class="editor-topbar">
      <div class="topbar-left">
        <a href="index.php" class="topbar-back" title="Back to projects">&larr;</a>
        <input type="text" id="pageNameInput" value="Untitled Page" spellcheck="false" class="topbar-page-name">
        <span id="saveStatus" class="save-status saved">Saved</span>
      </div>
      <div class="topbar-center">
        <div class="responsive-switcher" id="responsiveSwitcher">
          <button data-bp="base" class="active" title="Desktop">🖥</button>
          <button data-bp="tablet" title="Tablet">📱</button>
          <button data-bp="mobile" title="Mobile">📲</button>
        </div>
        <div class="zoom-control">
          <button id="zoomOutBtn" title="Zoom out">−</button>
          <span id="zoomLevel">100%</span>
          <button id="zoomInBtn" title="Zoom in">+</button>
        </div>
      </div>
      <div class="topbar-right">
        <button id="undoBtn" class="btn btn-ghost btn-sm" title="Undo (Ctrl+Z)">↶</button>
        <button id="redoBtn" class="btn btn-ghost btn-sm" title="Redo (Ctrl+Y)">↷</button>
        <div class="topbar-sep"></div>
        <button id="historyBtn" class="btn btn-ghost btn-sm">History</button>
        <button id="previewBtn" class="btn btn-ghost btn-sm">Preview</button>
        <button id="exportBtn" class="btn btn-ghost btn-sm">Export</button>
        <button id="saveBtn" class="btn btn-sm">Save</button>
        <button id="publishBtn" class="btn btn-accent btn-sm">Publish</button>
        <a href="logout.php" class="btn btn-ghost btn-sm" style="text-decoration:none;">Sign out</a>
      </div>
    </header>

    <div id="saveToast" class="toast" role="status" aria-live="polite"></div>

    <!-- LEFT SIDEBAR -->
    <aside class="left-sidebar" id="leftSidebar">
      <div class="sidebar-tabs">
        <button class="sidebar-tab active" data-tab="layers">Layers</button>
        <button class="sidebar-tab" data-tab="blocks">Blocks</button>
        <button class="sb-collapse-btn" id="collapseLeftBtn" title="Collapse panel" aria-label="Collapse left panel">&laquo;</button>
      </div>
      <div class="resize-handle resize-handle--left" id="leftResizeHandle" title="Drag to resize"></div>

      <!-- Layers Panel -->
      <div class="sidebar-panel" id="layersPanel">
        <div class="layers-tree" id="layersTree"></div>
      </div>

      <!-- Blocks Palette -->
      <div class="sidebar-panel hidden" id="blocksPanel">
        <div class="palette-search">
          <input type="text" id="blockSearch" placeholder="Search blocks...">
        </div>
        <div class="palette-categories" id="paletteCategories"></div>
      </div>
    </aside>

    <!-- CANVAS AREA -->
    <div class="canvas-area">
      <!-- Breadcrumb -->
      <div class="breadcrumb-bar" id="breadcrumbBar">
        <span class="breadcrumb-root">Page</span>
      </div>

      <!-- Canvas -->
      <div class="canvas-viewport" id="canvasViewport">
        <div class="canvas-page" id="canvasPage"></div>
      </div>

      <button class="sb-expand-btn sb-expand-btn--left" id="expandLeftBtn" title="Show left panel" aria-label="Show left panel">&raquo;</button>
      <button class="sb-expand-btn sb-expand-btn--right" id="expandRightBtn" title="Show right panel" aria-label="Show right panel">&laquo;</button>
    </div>

    <!-- RIGHT PANEL -->
    <aside class="right-panel" id="rightPanel">
      <div class="panel-tabs">
        <button class="panel-tab active" data-tab="style">Style</button>
        <button class="panel-tab" data-tab="content">Content</button>
        <button class="panel-tab" data-tab="animation">Animation</button>
        <button class="panel-tab" data-tab="settings">Settings</button>
        <button class="sb-collapse-btn" id="collapseRightBtn" title="Collapse panel" aria-label="Collapse right panel">&raquo;</button>
      </div>
      <div class="resize-handle resize-handle--right" id="rightResizeHandle" title="Drag to resize"></div>

      <!-- Style Panel -->
      <div class="panel-content" id="stylePanel">
        <div class="panel-empty">Select an element to edit its styles.</div>
      </div>

      <!-- Content Panel -->
      <div class="panel-content hidden" id="contentPanel">
        <div class="panel-empty">Select an element to edit its content.</div>
      </div>

      <!-- Animation Panel -->
      <div class="panel-content hidden" id="animationPanel">
        <div class="panel-empty">Select an element to add animations.</div>
      </div>

      <!-- Settings Panel -->
      <div class="panel-content hidden" id="settingsPanel">
        <div class="panel-empty">Select an element to edit settings.</div>
      </div>
    </aside>
  </div>

  <!-- Context Menu -->
  <div class="context-menu" id="contextMenu" hidden>
    <button data-action="duplicate">Duplicate</button>
    <button data-action="copy">Copy</button>
    <button data-action="paste">Paste</button>
    <div class="context-sep"></div>
    <button data-action="moveUp">Move Up</button>
    <button data-action="moveDown">Move Down</button>
    <div class="context-sep"></div>
    <button data-action="delete" class="danger">Delete</button>
  </div>

  <!-- Revision History Modal -->
  <div class="modal-overlay" id="historyModal" hidden>
    <div class="modal">
      <div class="modal-header">
        <h3>Revision history</h3>
        <button class="modal-close" id="historyClose" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body" id="historyList"></div>
    </div>
  </div>

  <script src="assets/js/core/node-utils.js"></script>
  <script src="assets/js/core/commands.js"></script>
  <script src="assets/js/core/store.js"></script>
  <script src="assets/js/registry/blocks.js"></script>
  <script src="assets/js/panels/style-panel.js"></script>
  <script src="assets/js/panels/props-panel.js"></script>
  <script src="assets/js/panels/animation-panel.js"></script>
  <script src="assets/js/canvas/canvas.js"></script>
  <script src="assets/js/canvas/layers.js"></script>
  <script src="assets/js/editor.js"></script>
</body>
</html>
