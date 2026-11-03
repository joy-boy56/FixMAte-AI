# How to Open Browser Console

## Chrome / Edge / Brave
- Press **F12** or **Ctrl+Shift+I** (Windows/Linux)
- Press **Cmd+Option+I** (Mac)
- Click the **Console** tab at the top

## Firefox
- Press **F12** or **Ctrl+Shift+K** (Windows/Linux)
- Press **Cmd+Option+K** (Mac)
- Click the **Console** tab

## What to Look For
- Red error messages (these are JavaScript errors)
- Yellow warnings (usually not critical)
- Look for errors related to: `upload.js`, `app.js`, `projectExplorer.js`, `diagnostics.js`, `explanation.js`

---

## Potential Issue Found in Code

I noticed a bug in the HTML that could cause the upload to fail:

**In `public/index.html`**, the file input has `webkitdirectory directory` attributes hardcoded:
```html
<input type="file" id="file-input" multiple webkitdirectory directory style="display: none;" accept="...">
```

But these should only be set when clicking "Upload Folder", not by default. This causes the file dialog to always open in folder selection mode.

Let me fix this.