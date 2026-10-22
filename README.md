# SiteBuilder

A no-code landing page builder: drag blocks onto a canvas, edit their content,
style, and animations in a side panel, then save, preview, or publish to a real
static HTML file.

## Security and deployment status

This archive is intended for local development. Do not expose the dashboard or management APIs to the public Internet until authentication, authorization, CSRF protection, upload policy, rate limiting, and ownership checks have been configured and tested. The current codebase is a single-workspace prototype, not a hardened multi-tenant SaaS service. Never publish the `.git/` directory, database credentials, or raw source configuration.

## Setup (XAMPP)

1. Copy the whole `sitebuilder` folder into `xampp/htdocs/`, so you end up with
   `xampp/htdocs/sitebuilder/`.
2. Start **Apache** and **MySQL** in the XAMPP control panel.
3. Create the database: open **phpMyAdmin** (`http://localhost/phpmyadmin`),
   go to the **Import** tab, and import `schema.sql`.
   (Or from a terminal: `mysql -u root < schema.sql`.)
4. Visit **`http://localhost/sitebuilder/index.php`** in your browser. Local loopback access works without a password for development.
5. For any remote deployment, configure the server environment variable `SITEBUILDER_ADMIN_PASSWORD` to a strong secret. The dashboard/editor and management APIs require a signed-in session when it is set. If it is unset, remote access is denied. The public form submission endpoint remains separate and is rate-limited.

That's it — no build step, no dependencies to install.

If your MySQL setup isn't the XAMPP default (root user, no password), edit
`config/db.php` and update `DB_USER` / `DB_PASS`.


## Professional upgrade additions

- **Advanced CSS inspector:** add valid CSS properties and values even when there is no dedicated graphical control.
- **Interaction-state CSS:** define hover, focus, active and keyboard focus-visible rules per element.
- **Reusable CSS classes:** create shared class rules in Page Settings and assign class names to elements.
- **Universal backgrounds:** apply color, image and gradient styles across elements; gradient modes include linear, radial and conic. Video backgrounds support a poster and fallback image.
- **Responsive media:** image blocks support mobile/tablet art direction, `srcset`, `sizes`, focal-point positioning and `<picture>` output.
- **Inline rich text:** double-click a Rich Text block to select phrases and apply basic formatting, colors, highlights and links.
- **Published lightbox and sliders:** image/gallery lightbox output and slide/fade/zoom slider modes are included in the compiler/runtime.
- **Generic semantic element:** add a nested semantic HTML element from a controlled tag list.
- **Configurable published breakpoints:** tablet/mobile media-query widths can be set in page Settings.
- **Regression checks:** run `./tests/run-smoke.sh` to execute PHP/JS syntax checks, compiler assertions and HTTP authentication checks.

The implementation log in `docs/UPGRADE_IMPLEMENTATION_LOG.md` tracks every blueprint group and the 25 acceptance tests. Some advanced product goals (synced component variants, asset management/optimization, visual grid placement, a full interaction builder, comprehensive accessibility checks, and multi-user ownership) remain open and are not claimed as completed.

## How it works

- **`index.php`** — dashboard. Lists your projects, and lets you create a blank
  page, start from a built-in template, or import a `.json` template. Projects
  can be opened in the editor, viewed live (once published), or deleted.
- **`editor.php?id=N`** — the visual editor. It is laid out in four areas:
  - **Top bar** — back to dashboard, page name, save status, responsive
    switcher, zoom, undo/redo, History, Preview, Export, Save, and Publish.
  - **Left sidebar** — switch between **Layers** (the element tree, with
    drag-reorder, visibility toggles, and expand/collapse) and **Blocks**
    (a searchable palette of every block type).
  - **Canvas** — click to select, drag palette blocks in, drag to reorder,
    drop indicators show where a block will land, and a breadcrumb bar shows
    the selected element's ancestry. Double-click text to edit it inline.
  - **Right panel** — four tabs for the selected element:
    - **Style** — layout (display/flex/grid/columns/gap/align), spacing,
      sizing, position, background (solid, gradient, image, video),
      effects (shadow, filters, opacity, blend), border, typography,
      transitions, and per-element custom CSS.
    - **Content** — the block's own fields (text, images, links, options,
      gallery items, slide lists, etc.).
    - **Animation** — entrance animations (fade, zoom, bounce, flip, rotate
      with duration/delay/easing/trigger), hover effects (scale, lift, glow,
      brightness, grayscale, tilt), and parallax.
    - **Settings** — page-level options: SEO/social metadata, favicon,
      background, fonts, design tokens (colors, fonts, spacing, radii,
      shadows), and page-wide custom CSS.
- **Responsive editing** — every style can be set per breakpoint:
  **Desktop** (base), **Tablet** (≤991px), and **Mobile** (≤479px). Only the
  values you change for a breakpoint are emitted, as a media query. The Style
  panel shows which breakpoint you're editing.
- **Blocks** — 48 blocks across eight categories: **Layout** (sections,
  columns, grid, containers), **Typography** (heading, text, rich text, list,
  quote), **Media** (image, gallery, video, icon), **Interactive** (accordion,
  tabs, slider/carousel, before/after, counter, progress bar, countdown),
  **Forms** (form, input, textarea, select, checkbox, submit button),
  **Marketing** (hero, CTA banner, pricing table, feature grid, testimonial),
  **Navigation** (navbar, footer, social icons), and **Advanced** (custom HTML,
  custom CSS, code embed, spacer, divider).
- **Animations** — entrance animations are compiled into keyframes and played
  by a small runtime script; viewport-triggered animations wait until the
  element scrolls into view. Hover effects are emitted as `:hover` rules.
- **Images** — image fields let you upload a file (JPG, PNG, GIF, or WEBP, up
  to 5MB) or paste a URL. Uploads are stored in `uploads/` and recorded in the
  `assets` table.
- **Forms** — published forms POST their values to `api/submit.php`, which
  stores each submission in the `form_submissions` table (optionally showing a
  success message and/or redirecting, as configured per form).
- **Revision history** — every save that changes a page snapshots the previous
  version into `page_revisions`. The top bar's **History** button lists recent
  revisions and can restore any of them (the current version is snapshotted
  first, so a restore is itself undoable).
- **Publishing** — Publish renders the page's JSON into a clean, standalone
  HTML file at `published/<slug>.html` with inlined CSS and any needed runtime
  JS. That file has no dependency on PHP or the database — copy it anywhere and
  it works as a normal static webpage.
- **Export/Preview** — Preview renders the current (even unsaved) page in a new
  tab; Export downloads the same rendered HTML as a file.

## Project structure

```
sitebuilder/
├── index.php                Dashboard (list/create/import/delete projects)
├── editor.php              The visual editor shell
├── schema.sql               MySQL tables (pages, form_submissions, assets, page_revisions)
├── config/
│   ├── db.php                DB connection (edit credentials here if needed)
│   ├── paths.php             Computes upload paths/URLs
│   └── security.php          Session/access gate and mutation-origin checks
├── login.php                 Administrator sign-in when password protection is enabled
├── logout.php                End the administrator session
├── api/
│   ├── save.php              Create/update a page; snapshots revisions
│   ├── load.php              Fetch one page's data
│   ├── list.php              Fetch all pages for the dashboard
│   ├── delete.php            Delete a page (and its published file)
│   ├── publish.php           Compile + write the static HTML file
│   ├── preview.php           Compile on the fly, without publishing
│   ├── upload.php            Image uploads (validated, recorded in assets)
│   ├── submit.php            Receives published-form submissions
│   └── revisions.php         List / restore page revisions
├── includes/
│   ├── compiler.php          IR → semantic HTML (+ entrance-animation runtime)
│   ├── css-generator.php     IR styles → CSS (base + per-breakpoint + hover)
│   └── render.php            Legacy v1 block renderer (fallback only)
├── uploads/                 Uploaded images (created automatically)
├── assets/
│   ├── css/
│   │   ├── editor.css         Editor + dashboard chrome styling
│   │   └── site-blocks.css    Shared block styles
│   └── js/
│       ├── core/
│       │   ├── node-utils.js   Tree helpers + per-breakpoint style resolution
│       │   ├── commands.js     Pure, invertible edit commands
│       │   └── store.js        State + coalesced undo/redo, serialization, migration
│       ├── registry/
│       │   └── blocks.js       Block definitions, default props, render, fields
│       ├── panels/
│       │   ├── style-panel.js      Style tab controls
│       │   ├── props-panel.js      Content tab controls (incl. uploads)
│       │   └── animation-panel.js  Animation tab controls
│       ├── canvas/
│       │   ├── canvas.js       Canvas rendering, selection, drag/drop, inline edit
│       │   └── layers.js       Layers tree
│       ├── editor.js         Editor orchestrator (load/save/publish, shortcuts…)
│       └── templates.js      Built-in starter templates (migrated to v2 on load)
└── published/               Where finished static pages get written
```

### Data model

A page is stored as a versioned document:

```
{ version: 2, page: { id, name, rootId, nodes, settings, tokens, customCSS, meta } }
```

`nodes` is a flat `id → node` map, where each node has `type`, `children`
(ids), `props`, `style: { base, tablet, mobile }`, `animations`, and `meta`.
Pages saved by older versions of SiteBuilder are migrated automatically when
loaded or compiled.

## Extending it

To add a new block type (e.g. a "Testimonial" block), touch two places:

1. **`assets/js/registry/blocks.js`** — add an entry to `BLOCK_REGISTRY` with
   `label`, `category`, `icon`, `defaultProps`, `render()` (canvas preview),
   `fields` (content panel), and `canHaveChildren` if it's a container. The
   palette, canvas, layers, and content panel read from this automatically.
2. **`includes/compiler.php`** — add a matching `case` in `compile_node()` that
   produces the same HTML server-side, so the published page matches the
   canvas.

Styling, responsive overrides, animations, and custom CSS all flow through the
shared IR, so a new block gets those for free. Tokens live in the page's
`tokens` object and are emitted as CSS custom properties.
