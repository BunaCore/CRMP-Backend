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
    this.logger.debug(`PDF HTML: ${totalLen} chars, ${imgCount} <img> tag(s). Node types in doc: [${allTypes.join(', ')}]`);
    const fullHtml = this.buildPdfHtmlDocument(bodyHtml, title);

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--allow-running-insecure-content',
        '--disable-dev-shm-usage',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
      // Wait for all images to finish loading before printing
      await page.evaluate(() =>
        Promise.all(
          Array.from(document.images).map(
            (img) =>
              img.complete
                ? Promise.resolve()
                : new Promise<void>((resolve) => {
                    img.onload = () => resolve();
                    img.onerror = () => resolve(); // resolve even on error so PDF still generates
                  }),
          ),
        ),
      );

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
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  // ─── Node → HTML ────────────────────────────────────────────────────

  private renderNode(node: TiptapNode): string {
    switch (node.type) {
      case 'doc':
        return (node.content || []).map((c) => this.renderNode(c)).join('');

      case 'paragraph': {
        const inner = (node.content || []).map((c) => this.renderNode(c)).join('');
        return `<p>${inner}</p>`;
      }

      case 'heading': {
        const level = node.attrs?.level || 1;
        const inner = (node.content || []).map((c) => this.renderNode(c)).join('');
        return `<h${level}>${inner}</h${level}>`;
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
      }
    }
    return result;
  }

  // ─── Utility ────────────────────────────────────────────────────────

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
  <style>
    /* === Base === */
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      color: #1a1a1a;
      line-height: 1.15;
      margin: 0;
      padding: 0;
      font-size: 12pt;
    }

    /* === Headings === */
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

    /* === Horizontal rule === */
    hr {
      border: none;
      border-top: 1px solid #d1d5db;
      margin: 1.5em 0;
    }

    /* === Links === */
    a { color: #2563eb; text-decoration: none; }

    /* === Other === */
    mark { background: #fef08a; padding: 0.1em 0.2em; border-radius: 2px; }
    img { max-width: 100%; height: auto; }
    del { text-decoration: line-through; color: #6b7280; }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
  }
}
