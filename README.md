# SiteBuilder

A no-code landing page builder: drag blocks onto a canvas, edit their content and
style in a side panel, then save, preview, or publish to a real static HTML file.

## Setup (XAMPP)

1. Copy the whole `sitebuilder` folder into `xampp/htdocs/`, so you end up with
   `xampp/htdocs/sitebuilder/`.
2. Start **Apache** and **MySQL** in the XAMPP control panel.
3. Create the database: open **phpMyAdmin** (`http://localhost/phpmyadmin`),
   go to the **Import** tab, and import `schema.sql`.
   (Or from a terminal: `mysql -u root < schema.sql`.)
4. Visit **`http://localhost/sitebuilder/index.php`** in your browser.

That's it — no build step, no dependencies to install.

If your MySQL setup isn't the XAMPP default (root user, no password), edit
`config/db.php` and update `DB_USER` / `DB_PASS`.

## How it works

- **`index.php`** — dashboard. Lists your pages, lets you create new ones or
  delete existing ones.
- **`editor.html`** — the builder itself:
  - **Left panel** — block palette. Drag a block onto the canvas to add it.
  - **Center** — the canvas. Click a block to select it, drag to reorder,
    use the ↑ ↓ ⎘ × controls to move/duplicate/delete.
  - **Right panel** — properties for whichever block is selected (text,
    colors, alignment, links, etc. depending on block type).
  - **Top bar** — rename the page, Save, Preview (opens the real rendered
    page in a new tab), and Publish (writes a permanent static file).
- **Blocks available**: Navigation, Hero, Heading, Text, Image, Button,
  Spacer, Divider, 2 Columns, Grid (any number of columns/rows).
- **Position & size controls**: every block has a "Position & size" panel
  with a Width slider, a Horizontal position slider, and a Height field.
  You can also drag directly on the canvas: a small ↔ handle to move a block
  left/right, a handle on its right edge to resize its width, and a handle
  on its bottom edge to resize its height.
- **Grid block**: choose any number of columns (1–6) and rows (1–6); the
  properties panel generates a text box for each cell.
- **Navigation block**: logo text, any number of links (`Label:URL` pairs
  separated by `|`), an optional call-to-action button, and colors.
- **Images**: the Image block's panel lets you either upload a file straight
  from your computer (JPG, PNG, GIF, or WEBP, up to 5MB) or paste an image
  URL. Uploaded files are saved to `uploads/` and referenced by an absolute
  path, so they display correctly in the editor, in previews, and in
  published pages alike.
- **Templates**: clicking "+ New page" opens a picker with a blank canvas,
  three built-in starter templates (Startup Landing, Portfolio, Coming Soon),
  and an "Import a template file" option for `.json` files exported from
  SiteBuilder itself. Whichever you pick becomes a normal, fully editable
  page — there's no separate "template mode."
- **Export**: the editor's "Export" button downloads the current page as a
  `.json` template file, which can be re-imported later (by you or anyone
  else running SiteBuilder) via the same "+ New page" picker.
- **Publishing**: clicking Publish renders the page's JSON block data into a
  clean, standalone HTML file saved to `published/<slug>.html`. That file has
  no dependency on PHP or the database — you can copy it anywhere and it'll
  work as a normal static webpage.

## Project structure

```
sitebuilder/
├── index.php              Dashboard (list/create/delete pages)
├── editor.html             The visual editor
├── schema.sql              MySQL table definition
├── config/
│   ├── db.php               DB connection (edit credentials here if needed)
│   └── paths.php             Computes the app's base URL for upload links
├── api/
│   ├── save.php             Create/update a page (auto-generates a slug)
│   ├── load.php             Fetch one page's data
│   ├── list.php             Fetch all pages for the dashboard
│   ├── delete.php           Delete a page (and its published file, if any)
│   ├── publish.php          Render + write the static HTML file
│   ├── preview.php          Render on the fly, without publishing
│   └── upload.php            Handle image uploads for the Image block
├── includes/render.php     Server-side block → HTML renderer (source of
│                           truth for what actually gets published)
├── uploads/                 Uploaded images (created automatically)
├── assets/
│   ├── css/
│   │   ├── editor.css        Editor/dashboard chrome styling
│   │   └── site-blocks.css   Shared block styles (canvas + published pages)
│   └── js/
│       ├── blocks.js       Block type definitions + live preview rendering
│       ├── templates.js    Built-in starter template definitions
│       └── editor.js       Editor behavior: drag/drop, selection, save/load
└── published/              Where finished static pages get written
```

## Extending it

To add a new block type (e.g. a "Testimonial" block), you touch three places:

1. **`assets/js/blocks.js`** — add an entry to `BLOCK_TYPES` with
   `defaultProps`, a `render()` function for the live canvas, and `fields`
   for the properties panel.
2. **`includes/render.php`** — add a matching `case` in `render_block()` that
   produces the same HTML server-side. This is what makes it into the
   published file, so keep it visually equivalent to the JS version.
3. Nothing else — the palette, canvas, and properties panel all read from
   `BLOCK_TYPES` automatically.
