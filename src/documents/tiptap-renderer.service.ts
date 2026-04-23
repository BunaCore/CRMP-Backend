import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

interface TiptapNode {
  type: string;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
  attrs?: Record<string, any>;
}

interface TiptapMark {
  type: string;
  attrs?: Record<string, any>;
}

@Injectable()
export class TiptapRenderer {
  private readonly logger = new Logger(TiptapRenderer.name);

  // ─── Browser singleton ──────────────────────────────────────────────
  // We launch ONE Chrome process per application lifetime and reuse it
  // across all PDF requests. Opening a new page is cheap (~20ms) whereas
  // launching a new browser is expensive (~1-2s) and causes port exhaustion
  // under concurrent load.
  private static browser: puppeteer.Browser | null = null;
  private static launchPromise: Promise<puppeteer.Browser> | null = null;

  private async getBrowser(): Promise<puppeteer.Browser> {
    // Happy path: browser already running
    if (TiptapRenderer.browser?.connected) {
      return TiptapRenderer.browser;
    }
    // If a launch is already in progress, await it (prevents duplicate spawns)
    if (TiptapRenderer.launchPromise) {
      return TiptapRenderer.launchPromise;
    }

    this.logger.log('Launching Puppeteer browser (singleton)…');
    TiptapRenderer.launchPromise = puppeteer
      .launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          // Keep Chrome from loading plugins / extensions that slow startup
          '--disable-extensions',
          '--disable-default-apps',
          // Silence font hinting warnings on Linux
          '--font-render-hinting=none',
        ],
        // Give Chrome itself 30s to start before we bail
        timeout: 30_000,
      })
      .then((b) => {
        TiptapRenderer.browser = b;
        TiptapRenderer.launchPromise = null;
        // If Chrome crashes, clear the reference so the next request re-launches
        b.on('disconnected', () => {
          this.logger.warn('Puppeteer browser disconnected — will re-launch on next request');
          TiptapRenderer.browser = null;
          TiptapRenderer.launchPromise = null;
        });
        return b;
      })
      .catch((err) => {
        TiptapRenderer.launchPromise = null; // allow retry
        throw err;
      });

    return TiptapRenderer.launchPromise;
  }

  /**
   * Render the Tiptap doc node to an HTML fragment (no wrapper).
   */
  renderToHtml(doc: TiptapNode): string {
    return this.renderNode(doc);
  }

  /**
   * Extract all text content from a Tiptap document.
   */
  extractPlainText(doc: TiptapNode): string {
    return this.extractText(doc).trim();
  }

  /**
   * Render the document to a PDF buffer via Puppeteer.
   * Synchronous from the caller's perspective — returns the complete buffer.
   *
   * Trade-off note: Puppeteer is heavier than a pure-JS PDF lib like pdfkit,
   * but it gives us pixel-perfect CSS rendering of the same HTML the user
   * previews in the browser, so the export matches expectations.
   */
  async renderToPdf(doc: TiptapNode, title?: string): Promise<Buffer> {
    const bodyHtml = this.renderToHtml(doc);
    const imgCount = (bodyHtml.match(/<img/g) || []).length;
    const totalLen = bodyHtml.length;
    const allTypes = this.collectNodeTypes(doc);
    this.logger.debug(
      `PDF render start — ${totalLen} chars, ${imgCount} <img> tag(s). ` +
      `Node types: [${allTypes.join(', ')}]`,
    );
    if (bodyHtml.includes('<table')) {
      this.logger.debug('Table detected in HTML, checking structure...');
      // Use a proper regex — note the flags and real (unescaped) character class
      const tableMatches = bodyHtml.match(/<table[\s\S]*?<\/table>/g);
      if (tableMatches) {
        this.logger.debug(`Found ${tableMatches.length} table(s) in HTML`);
        tableMatches.forEach((t, i) => {
          const rows = (t.match(/<tr/g) || []).length;
          const cells = (t.match(/<td|<th/g) || []).length;
          const emptyTd = (t.match(/<td[^>]*>\s*(&nbsp;)?\s*<\/td>/g) || []).length;
          const emptyTh = (t.match(/<th[^>]*>\s*(&nbsp;)?\s*<\/th>/g) || []).length;
          this.logger.debug(
            `Table ${i + 1}: ${rows} row(s), ${cells} cell(s) ` +
            `(${emptyTd + emptyTh} empty/nbsp-only)`,
          );
        });
      } else {
        this.logger.warn('Table tag detected but no complete table structure found in HTML');
      }
    }
    const fullHtml = this.buildPdfHtmlDocument(bodyHtml, title);

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Raise per-page limits so slow machines don't hit the default 30s wall
      page.setDefaultNavigationTimeout(120_000);
      page.setDefaultTimeout(120_000);

      // ── Load content ────────────────────────────────────────────────
      // 'domcontentloaded' fires as soon as the HTML is parsed — it does NOT
      // wait for external resources (Google Fonts, images).  This is the key
      // fix: 'networkidle0' was timing out because it blocked until every
      // Google Fonts HTTP request completed, which could take > 30s on a slow
      // or firewalled connection.
      await page.setContent(fullHtml, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });

      // ── Wait for web-fonts (capped at 6 s) ──────────────────────────
      // document.fonts.ready resolves once all @font-face declarations have
      // either loaded or been rejected.  We race it against a 6-second
      // timeout so a network outage never turns into a hung request.
      await Promise.race([
        page.evaluate(() => document.fonts.ready as unknown as void),
        new Promise<void>((resolve) => setTimeout(resolve, 6_000)),
      ]);

      // ── Wait for tables & log real render dimensions ─────────────────
      if (fullHtml.includes('<table')) {
        this.logger.debug('Waiting for table rendering...');
        try {
          await page.waitForSelector('table', { timeout: 5000 });
          this.logger.debug('Table element found in DOM');

          // Gather real computed dimensions from the browser for debugging
          const tableDiagnostics = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('table')).map((tbl, i) => {
              const rect = tbl.getBoundingClientRect();
              const rows = tbl.querySelectorAll('tr').length;
              const cells = tbl.querySelectorAll('td, th').length;
              const style = window.getComputedStyle(tbl);
              return {
                index: i + 1,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                rows,
                cells,
                tableLayout: style.tableLayout,
                borderCollapse: style.borderCollapse,
                display: style.display,
              };
            });
          });

          tableDiagnostics.forEach((d) => {
            this.logger.debug(
              `Table ${d.index} render: ${d.width}×${d.height}px, ` +
              `${d.rows} rows, ${d.cells} cells — ` +
              `tableLayout=${d.tableLayout}, borderCollapse=${d.borderCollapse}, display=${d.display}`,
            );
            if (d.width === 0 || d.height === 0) {
              this.logger.warn(`Table ${d.index} has zero dimension — it may not appear in the PDF!`);
            }
          });
        } catch (e) {
          this.logger.warn(`Table wait/diagnostics failed: ${(e as Error).message}`);
        }
      }

      // ── Wait for inline images (best-effort) ────────────────────────
      if (imgCount > 0) {
        await page.evaluate(() =>
          Promise.all(
            Array.from(document.images).map((img) =>
              img.complete
                ? Promise.resolve()
                : new Promise<void>((resolve) => {
                    img.onload = () => resolve();
                    img.onerror = () => resolve();
                  }),
            ),
          ),
        );
      }

      // ── Generate PDF ─────────────────────────────────────────────────
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="width:100%; font-size:9px; color:#999; padding:0 40px; text-align:right;">
            <span>${title ? this.escapeHtml(title) : 'Document'}</span>
          </div>`,
        footerTemplate: `
          <div style="width:100%; font-size:9px; color:#999; padding:0 40px; display:flex; justify-content:space-between;">
            <span>Exported <span class="date"></span></span>
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
          </div>`,
        margin: {
          top: '1in',
          right: '1in',
          bottom: '1in',
          left: '1in',
        },
        timeout: 120_000,
      });

      this.logger.debug(`PDF generated — ${pdfBuffer.byteLength} bytes`);
      return Buffer.from(pdfBuffer);
    } finally {
      // Close the PAGE (cheap), keep the BROWSER running for the next request
      await page.close();
    }
  }

  // ─── Node → HTML ────────────────────────────────────────────────────

  private renderNode(node: TiptapNode): string {
    switch (node.type) {
      case 'doc':
        return (node.content || []).map((c) => this.renderNode(c)).join('');

      case 'paragraph': {
        const inner = (node.content || []).map((c) => this.renderNode(c)).join('');
        const style = this.buildBlockStyle(node.attrs);
        return `<p${style}>${inner}</p>`;
      }

      case 'heading': {
        const level = node.attrs?.level || 1;
        const inner = (node.content || []).map((c) => this.renderNode(c)).join('');
        const style = this.buildBlockStyle(node.attrs);
        return `<h${level}${style}>${inner}</h${level}>`;
      }

      case 'text':
        return node.marks?.length
          ? this.applyMarks(node.text || '', node.marks)
          : this.escapeHtml(node.text || '');

      case 'blockquote': {
        const inner = (node.content || []).map((c) => this.renderNode(c)).join('');
        return `<blockquote>${inner}</blockquote>`;
      }

      case 'bulletList':
        return `<ul>${(node.content || []).map((c) => this.renderNode(c)).join('')}</ul>`;

      case 'orderedList':
        return `<ol>${(node.content || []).map((c) => this.renderNode(c)).join('')}</ol>`;

      case 'listItem':
        return `<li>${(node.content || []).map((c) => this.renderNode(c)).join('')}</li>`;

      case 'codeBlock': {
        // Code blocks contain raw text nodes — escape them without recursing
        // through renderNode to avoid double-wrapping.
        const raw = (node.content || []).map((c) => c.text || '').join('');
        const lang = node.attrs?.language;
        const cls = lang ? ` class="language-${this.escapeAttribute(lang)}"` : '';
        return `<pre><code${cls}>${this.escapeHtml(raw)}</code></pre>`;
      }

      case 'hardBreak':
        return '<br />';

      case 'horizontalRule':
        return '<hr />';

      // ── Table nodes ──────────────────────────────────────────────────
      case 'table':
        const tableAttrs = this.buildTableAttrs(node.attrs);
        return `<table${tableAttrs}>${(node.content || []).map((c) => this.renderNode(c)).join('')}</table>`;

      case 'tableRow':
        return `<tr>${(node.content || []).map((c) => this.renderNode(c)).join('')}</tr>`;

      case 'tableHeader': {
        const colspan = node.attrs?.colspan ? ` colspan="${node.attrs.colspan}"` : '';
        const rowspan = node.attrs?.rowspan ? ` rowspan="${node.attrs.rowspan}"` : '';
        const style = this.buildCellStyle(node.attrs);
        const inner = (node.content || []).map((c) => this.renderNode(c)).join('');
        return `<th${colspan}${rowspan}${style}>${inner || '&nbsp;'}</th>`;
      }

      case 'tableCell': {
        const colspan = node.attrs?.colspan ? ` colspan="${node.attrs.colspan}"` : '';
        const rowspan = node.attrs?.rowspan ? ` rowspan="${node.attrs.rowspan}"` : '';
        const style = this.buildCellStyle(node.attrs);
        const inner = (node.content || []).map((c) => this.renderNode(c)).join('');
        return `<td${colspan}${rowspan}${style}>${inner || '&nbsp;'}</td>`;
      }

      case 'image':
      case 'resizableImage':
      case 'imageResize': {
        const src = this.escapeAttribute(node.attrs?.src || '');
        const alt = this.escapeAttribute(node.attrs?.alt || '');
        const title = node.attrs?.title ? ` title="${this.escapeAttribute(node.attrs.title)}"` : '';

        // Preserve user-set dimensions (from resizable image extension)
        const styleparts: string[] = ['max-width: 100%', 'height: auto', 'display: block'];
        if (node.attrs?.width) {
          // width can be a number (px) or a string like '50%'
          const w = String(node.attrs.width);
          styleparts[0] = `max-width: 100%`; // keep the guard
          styleparts.push(`width: ${w.includes('%') || w.includes('px') ? w : w + 'px'}`);
          styleparts.push(`height: auto`);
        }
        if (node.attrs?.height && node.attrs.height !== 'auto') {
          const h = String(node.attrs.height);
          styleparts.push(`height: ${h.includes('%') || h.includes('px') ? h : h + 'px'}`);
        }
        const style = styleparts.join('; ');

        return `<figure style="margin: 0.5em 0;"><img src="${src}" alt="${alt}"${title} style="${style}" /></figure>`;
      }

      default:
        return (node.content || []).map((c) => this.renderNode(c)).join('');
    }
  }

  // ─── Inline mark application ────────────────────────────────────────

  private applyMarks(text: string, marks: TiptapMark[]): string {
    let result = this.escapeHtml(text);
    // Apply innermost marks first → outermost last
    const sorted = [...marks].reverse();

    for (const mark of sorted) {
      switch (mark.type) {
        case 'bold':
          result = `<strong>${result}</strong>`;
          break;
        case 'italic':
          result = `<em>${result}</em>`;
          break;
        case 'strike':
          result = `<del>${result}</del>`;
          break;
        case 'code':
          result = `<code>${result}</code>`;
          break;
        case 'link': {
          const href = this.escapeAttribute(mark.attrs?.href || '');
          result = `<a href="${href}">${result}</a>`;
          break;
        }
        case 'highlight': {
          const color = this.escapeAttribute(mark.attrs?.color || 'yellow');
          result = `<mark style="background-color: ${color};">${result}</mark>`;
          break;
        }
        case 'textStyle': {
          // Carries fontFamily, color (and potentially fontSize) from TipTap TextStyle extension
          const styleParts: string[] = [];
          if (mark.attrs?.fontFamily) {
            styleParts.push(`font-family: ${mark.attrs.fontFamily}`);
          }
          if (mark.attrs?.color) {
            styleParts.push(`color: ${mark.attrs.color}`);
          }
          if (mark.attrs?.fontSize) {
            styleParts.push(`font-size: ${mark.attrs.fontSize}`);
          }
          if (styleParts.length > 0) {
            result = `<span style="${styleParts.join('; ')}">${result}</span>`;
          }
          break;
        }
        case 'underline':
          result = `<u>${result}</u>`;
          break;
        case 'subscript':
          result = `<sub>${result}</sub>`;
          break;
        case 'superscript':
          result = `<sup>${result}</sup>`;
          break;
      }
    }
    return result;
  }

  // ─── Utility ────────────────────────────────────────────────────────

  /**
   * Builds an inline style string from block-level attrs like textAlign and lineHeight.
   * Returns a ` style="..."` attribute string (with leading space) or empty string.
   */
  private buildBlockStyle(attrs?: Record<string, any>): string {
    if (!attrs) return '';
    const parts: string[] = [];
    if (attrs.textAlign && attrs.textAlign !== 'left') {
      parts.push(`text-align: ${attrs.textAlign}`);
    }
    if (attrs.lineHeight) {
      parts.push(`line-height: ${attrs.lineHeight}`);
    }
    // TipTap TextAlign extension may also store alignment directly on the node
    if (attrs['text-align'] && !attrs.textAlign) {
      parts.push(`text-align: ${attrs['text-align']}`);
    }
    return parts.length > 0 ? ` style="${parts.join('; ')}"` : '';
  }

  /**
   * Builds attributes for table elements.
   */
  private buildTableAttrs(attrs?: Record<string, any>): string {
    if (!attrs) return '';
    const parts: string[] = [];
    if (attrs.class) parts.push(`class="${this.escapeAttribute(attrs.class)}"`);
    if (attrs.style) parts.push(`style="${this.escapeAttribute(attrs.style)}"`);
    // Add other table attributes as needed
    return parts.length > 0 ? ` ${parts.join(' ')}` : '';
  }

  /**
   * Builds style attributes for table cells (th, td).
   */
  private buildCellStyle(attrs?: Record<string, any>): string {
    if (!attrs) return '';
    const parts: string[] = [];
    if (attrs.textAlign && attrs.textAlign !== 'left') {
      parts.push(`text-align: ${attrs.textAlign}`);
    }
    if (attrs.verticalAlign) {
      parts.push(`vertical-align: ${attrs.verticalAlign}`);
    }
    if (attrs.backgroundColor) {
      parts.push(`background-color: ${attrs.backgroundColor}`);
    }
    // Add other cell styles as needed
    return parts.length > 0 ? ` style="${parts.join('; ')}"` : '';
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeAttribute(value: string): string {
    return this.escapeHtml(value);
  }

  private extractText(node: TiptapNode): string {
    if (node.type === 'text') return node.text || '';
    if (node.type === 'hardBreak') return '\n';
    if (node.content) return node.content.map((c) => this.extractText(c)).join('');
    return '';
  }

  private collectNodeTypes(node: TiptapNode, types = new Set<string>()): string[] {
    types.add(node.type);
    if (node.content) node.content.forEach((c) => this.collectNodeTypes(c, types));
    return Array.from(types);
  }

  /**
   * Full HTML page used exclusively for Puppeteer PDF rendering.
   * Styled to look clean on paper with good print typography.
   */
  private buildPdfHtmlDocument(bodyContent: string, title?: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title ? this.escapeHtml(title) : 'Document'}</title>

  <!-- Google Fonts: Inter (UI), Noto Sans Ethiopic (Amharic/Ge'ez), Roboto -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Ethiopic:wght@400;700&family=Roboto:wght@400;700&display=swap"
    rel="stylesheet"
  />

  <style>
    /* === Base === */
    body {
      font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      color: #1a1a1a;
      /* Default line-height; individual blocks override via inline style */
      line-height: 1.15;
      margin: 0;
      padding: 0;
      font-size: 12pt;
    }

    /* === Headings ===
       Note: font-size / line-height set here are DEFAULTS.
       Inline styles from TipTap attrs will override them automatically
       because inline styles have higher specificity than class/element rules. */
    h1, h2, h3, h4, h5, h6 {
      margin: 0.4em 0 0.15em;
      font-weight: 600;
      line-height: 1.1;
    }
    h1 { font-size: 1.8em; border-bottom: 1px solid #ddd; padding-bottom: 0.15em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }
    h4 { font-size: 1.1em; }

    /* === Body copy === */
    p { margin: 0 0 0.15em; }

    /* === Blockquote === */
    blockquote {
      margin: 1em 0;
      padding: 0.6em 1em;
      border-left: 4px solid #3b82f6;
      background: #f8fafc;
      color: #374151;
    }
    blockquote p { margin: 0 0 0.4em; }
    blockquote p:last-child { margin-bottom: 0; }

    /* === Lists === */
    ul, ol { margin: 0 0 1em 1.5em; padding: 0; }
    li { margin-bottom: 0.3em; }
    li > ul, li > ol { margin-top: 0.3em; margin-bottom: 0; }

    /* === Code === */
    pre {
      background: #f4f4f5;
      padding: 1em;
      overflow-x: auto;
      border-radius: 6px;
      border: 1px solid #e4e4e7;
      margin: 1em 0;
      font-size: 0.9em;
    }
    code {
      font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
      background: #f4f4f5;
      padding: 0.15em 0.35em;
      border-radius: 3px;
      font-size: 0.9em;
    }
    pre code {
      background: none;
      padding: 0;
      border-radius: 0;
      font-size: inherit;
    }

    /* === Tables ===
       Without explicit border rules, Puppeteer renders tables with invisible
       borders. These rules mirror the TipTap table extension defaults.
       IMPORTANT: Do NOT use table-layout:fixed — it prevents proper column
       sizing and causes layout breakage in PDFs. */
    table {
      border-collapse: collapse;
      border-spacing: 0;
      /* Let the browser auto-size columns from content */
      table-layout: auto;
      width: 100%;
      margin: 1em 0;
      border: 1px solid #4b5563;
    }
    th, td {
      border: 1px solid #6b7280;
      padding: 0.4rem 0.5rem;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: break-word;
      /* min-width ensures the border box is visible even when the cell is empty */
      min-width: 2em;
      /* min-height is ignored for table cells in CSS; use line-height instead */
      line-height: 1.4;
    }
    /* Force empty cells to still render their border box */
    td:empty, th:empty {
      padding: 0.4rem 0.5rem;
    }
    tr {
      page-break-inside: avoid;
    }
    th {
      background-color: #f3f4f6;
      font-weight: 600;
      border-bottom: 2px solid #4b5563;
    }

    /* === Print / PDF overrides ===
       Puppeteer uses the print media type. These rules make tables crisper
       and prevent ghost borders that sometimes appear with collapse+print. */
    @media print {
      table {
        border: 1px solid #000;
        border-collapse: collapse;
      }
      th, td {
        border: 1px solid #333;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      th {
        background-color: #f3f4f6 !important;
      }
      tr {
        page-break-inside: avoid;
      }
      /* Avoid page break immediately after a table header row */
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
    }

    /* === Horizontal rule === */
    hr {
      border: none;
      border-top: 1px solid #d1d5db;
      margin: 1.5em 0;
    }

    /* === Links === */
    a { color: #2563eb; text-decoration: none; }

    /* === Misc === */
    mark { background: #fef08a; padding: 0.1em 0.2em; border-radius: 2px; }
    img { max-width: 100%; height: auto; }
    del { text-decoration: line-through; color: #6b7280; }
    u { text-decoration: underline; }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
  }
}
