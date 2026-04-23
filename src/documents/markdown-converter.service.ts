import { Injectable } from '@nestjs/common';

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

/**
 * Converts between Markdown and Tiptap JSON.
 *
 * Supported elements:
 *   headings (1-6), paragraphs, bullet lists, ordered lists (with nesting),
 *   blockquotes (multi-line), code blocks (fenced), horizontal rules,
 *   GFM pipe tables, inline: bold, italic, strikethrough, inline code, links.
 *
 * Known limitations:
 *   - Task lists, footnotes are NOT supported.
 *   - Image nodes are exported but not created on import.
 *   - Highlight / textStyle marks are preserved in Tiptap but dropped in
 *     Markdown (no standard equivalent).
 *   - Deeply nested lists (>2 levels) are flattened on import.
 */
@Injectable()
export class MarkdownConverter {
  // ─── Markdown → Tiptap ──────────────────────────────────────────────

  markdownToTiptap(markdown: string): TiptapNode {
    const lines = markdown.split('\n');
    const content: TiptapNode[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // ── Fenced code block ───────────────────────────────────────
      if (line.startsWith('```')) {
        const language = line.slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        const codeText = codeLines.join('\n');
        content.push({
          type: 'codeBlock',
          attrs: language ? { language } : undefined,
          content: codeText ? [{ type: 'text', text: codeText }] : undefined,
        });
        continue;
      }

      // ── Multi-line blockquotes ──────────────────────────────────
      if (line.startsWith('> ') || line === '>') {
        const quoteLines: string[] = [];
        while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) {
          quoteLines.push(lines[i].startsWith('> ') ? lines[i].slice(2) : '');
          i++;
        }
        // Parse inner content as paragraphs separated by blank quote-lines
        const innerParagraphs: TiptapNode[] = [];
        let currentParaText = '';
        for (const ql of quoteLines) {
          if (ql === '') {
            if (currentParaText) {
              innerParagraphs.push({
                type: 'paragraph',
                content: this.parseInlineMarkdown(currentParaText.trim()),
              });
              currentParaText = '';
            }
          } else {
            currentParaText += (currentParaText ? ' ' : '') + ql;
          }
        }
        if (currentParaText) {
          innerParagraphs.push({
            type: 'paragraph',
            content: this.parseInlineMarkdown(currentParaText.trim()),
          });
        }
        content.push({
          type: 'blockquote',
          content: innerParagraphs.length > 0 ? innerParagraphs : [
            { type: 'paragraph', content: [{ type: 'text', text: '' }] },
          ],
        });
        continue;
      }

      // ── Headings ────────────────────────────────────────────────
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        content.push({
          type: 'heading',
          attrs: { level: headingMatch[1].length },
          content: this.parseInlineMarkdown(headingMatch[2]),
        });
        i++;
        continue;
      }

      // ── Horizontal rule ─────────────────────────────────────────
      if (/^[-*_]{3,}$/.test(line.trim())) {
        content.push({ type: 'horizontalRule' });
        i++;
        continue;
      }

      // ── Lists (bullet + ordered, with nesting) ──────────────────
      if (this.isListLine(line)) {
        const listNode = this.parseList(lines, i);
        content.push(listNode.node);
        i = listNode.nextIndex;
        continue;
      }

      // ── GFM pipe table ──────────────────────────────────────────
      // A table starts with a header row (cells separated by |) immediately
      // followed by an alignment/separator row (|---|---|).
      if (this.isTableLine(line) && i + 1 < lines.length && this.isTableSeparator(lines[i + 1])) {
        const tableResult = this.parseMarkdownTable(lines, i);
        content.push(tableResult.node);
        i = tableResult.nextIndex;
        continue;
      }

      // ── Blank line ──────────────────────────────────────────────
      if (line.trim() === '') {
        i++;
        continue;
      }

      // ── Regular paragraph ───────────────────────────────────────
      content.push({
        type: 'paragraph',
        content: this.parseInlineMarkdown(line),
      });
      i++;
    }

    return {
      type: 'doc',
      content: content.length > 0
        ? content
        : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
    };
  }

  // ─── Tiptap → Markdown ──────────────────────────────────────────────

  tiptapToMarkdown(doc: TiptapNode): string {
    return this.serializeNode(doc, 0);
  }

  // ─── Private: Markdown → Tiptap helpers ─────────────────────────────

  /** Returns true for any line that looks like a GFM table row (contains |). */
  private isTableLine(line: string): boolean {
    const t = line.trim();
    return t.startsWith('|') && t.lastIndexOf('|') > 0;
  }

  /**
   * Returns true when a line is a GFM table separator like |---|---| or
   * |:---|:--:|---:| (alignment syntax).
   */
  private isTableSeparator(line: string): boolean {
    return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(line.trim());
  }

  /**
   * Splits a GFM table row string into cell text values, stripping leading
   * and trailing pipe characters and trimming whitespace.
   */
  private splitTableRow(line: string): string[] {
    return line
      .trim()
      .replace(/^\|/, '')   // remove optional leading pipe
      .replace(/\|$/, '')   // remove optional trailing pipe
      .split('|')
      .map((cell) => cell.trim());
  }

  /**
   * Parses a GFM pipe table starting at `start`.
   * Returns the resulting TipTap `table` node and the index of the first
   * line after the table.
   */
  private parseMarkdownTable(
    lines: string[],
    start: number,
  ): { node: TiptapNode; nextIndex: number } {
    const headerCells = this.splitTableRow(lines[start]);
    // lines[start + 1] is the separator — skip it
    let i = start + 2;

    const rows: TiptapNode[] = [];

    // Header row — rendered as <th> cells
    rows.push({
      type: 'tableRow',
      content: headerCells.map((cellText) => ({
        type: 'tableHeader',
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [
          {
            type: 'paragraph',
            content: this.parseInlineMarkdown(cellText),
          },
        ],
      })),
    });

    // Data rows — rendered as <td> cells
    while (i < lines.length && this.isTableLine(lines[i])) {
      const cells = this.splitTableRow(lines[i]);
      // Pad/trim to match header column count
      while (cells.length < headerCells.length) cells.push('');
      rows.push({
        type: 'tableRow',
        content: cells.slice(0, headerCells.length).map((cellText) => ({
          type: 'tableCell',
          attrs: { colspan: 1, rowspan: 1, colwidth: null },
          content: [
            {
              type: 'paragraph',
              content: this.parseInlineMarkdown(cellText),
            },
          ],
        })),
      });
      i++;
    }

    return {
      node: { type: 'table', content: rows },
      nextIndex: i,
    };
  }

  private isListLine(line: string): boolean {
    return /^\s*([-*+])\s+/.test(line) || /^\s*\d+\.\s+/.test(line);
  }

  private getListIndent(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  private getListType(line: string): 'bulletList' | 'orderedList' {
    return /^\s*\d+\./.test(line) ? 'orderedList' : 'bulletList';
  }

  private getListItemText(line: string): string {
    return line.replace(/^\s*([-*+]|\d+\.)\s+/, '');
  }

  /**
   * Parses a contiguous block of list lines (bullet or ordered) starting at
   * index `start`, handling one level of nesting.
   */
  private parseList(
    lines: string[],
    start: number,
  ): { node: TiptapNode; nextIndex: number } {
    const baseIndent = this.getListIndent(lines[start]);
    const listType = this.getListType(lines[start]);
    const items: TiptapNode[] = [];
    let i = start;

    while (i < lines.length && this.isListLine(lines[i])) {
      const indent = this.getListIndent(lines[i]);

      if (indent < baseIndent) break; // De-dented beyond our list

      if (indent > baseIndent) {
        // Nested list — attach to last item
        const nested = this.parseList(lines, i);
        if (items.length > 0) {
          items[items.length - 1].content!.push(nested.node);
        }
        i = nested.nextIndex;
        continue;
      }

      // Same indent & compatible type
      if (this.getListType(lines[i]) !== listType) break;

      const text = this.getListItemText(lines[i]);
      items.push({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: this.parseInlineMarkdown(text),
          },
        ],
      });
      i++;
    }

    return {
      node: { type: listType, content: items },
      nextIndex: i,
    };
  }

  private parseInlineMarkdown(text: string): TiptapNode[] {
    if (!text) return [];

    const patterns = [
      { type: 'link', regex: /\[(.+?)\]\((.+?)\)/ },
      { type: 'code', regex: /`([^`]+)`/ },
      { type: 'bold', regex: /\*\*(.+?)\*\*/ },
      { type: 'strike', regex: /~~(.+?)~~/ },
      { type: 'italic', regex: /\*(.+?)\*/ },
      { type: 'bold', regex: /__(.+?)__/ },
      { type: 'italic', regex: /_(.+?)_/ },
    ];

    let earliestMatch: RegExpExecArray | null = null;
    let earliestPattern: (typeof patterns)[number] | null = null;

    for (const pattern of patterns) {
      const match = pattern.regex.exec(text);
      if (!match) continue;
      if (!earliestMatch || match.index < earliestMatch.index) {
        earliestMatch = match;
        earliestPattern = pattern;
      }
    }

    if (!earliestMatch || !earliestPattern) {
      return [{ type: 'text', text }];
    }

    const beforeText = text.slice(0, earliestMatch.index);
    const matchedText = earliestMatch[0];
    const afterText = text.slice(earliestMatch.index + matchedText.length);
    const innerText = earliestMatch[1];

    const nodes: TiptapNode[] = [];
    if (beforeText) nodes.push(...this.parseInlineMarkdown(beforeText));

    switch (earliestPattern.type) {
      case 'link': {
        const href = earliestMatch[2];
        nodes.push({ type: 'text', text: innerText, marks: [{ type: 'link', attrs: { href } }] });
        break;
      }
      case 'code':
        nodes.push({ type: 'text', text: innerText, marks: [{ type: 'code' }] });
        break;
      case 'bold':
        nodes.push(...this.applyMarkToLeafText(this.parseInlineMarkdown(innerText), { type: 'bold' }));
        break;
      case 'italic':
        nodes.push(...this.applyMarkToLeafText(this.parseInlineMarkdown(innerText), { type: 'italic' }));
        break;
      case 'strike':
        nodes.push(...this.applyMarkToLeafText(this.parseInlineMarkdown(innerText), { type: 'strike' }));
        break;
    }

    if (afterText) nodes.push(...this.parseInlineMarkdown(afterText));
    return nodes;
  }

  private applyMarkToLeafText(nodes: TiptapNode[], mark: TiptapMark): TiptapNode[] {
    return nodes.map((node) => {
      if (node.type === 'text') {
        return { ...node, marks: [...(node.marks || []), mark] };
      }
      if (node.content) {
        return { ...node, content: this.applyMarkToLeafText(node.content, mark) };
      }
      return node;
    });
  }

  // ─── Private: Tiptap → Markdown helpers ─────────────────────────────

  private serializeNode(node: TiptapNode, depth: number): string {
    switch (node.type) {
      case 'doc':
        return (node.content || []).map((c) => this.serializeNode(c, depth)).join('\n\n');

      case 'paragraph':
        return (node.content || []).map((c) => this.serializeInline(c)).join('');

      case 'heading': {
        const lvl = node.attrs?.level || 1;
        const text = (node.content || []).map((c) => this.serializeInline(c)).join('');
        return '#'.repeat(lvl) + ' ' + text;
      }

      case 'text':
        return this.serializeInline(node);

      case 'blockquote': {
        const inner = (node.content || []).map((c) => this.serializeNode(c, depth)).join('\n');
        return inner
          .split('\n')
          .map((l) => '> ' + l)
          .join('\n');
      }

      case 'bulletList':
        return (node.content || [])
          .map((item) => this.serializeListItem(item, depth, '- '))
          .join('\n');

      case 'orderedList':
        return (node.content || [])
          .map((item, idx) => this.serializeListItem(item, depth, `${idx + 1}. `))
          .join('\n');

      case 'listItem':
        return (node.content || []).map((c) => this.serializeNode(c, depth)).join('');

      case 'codeBlock': {
        const lang = node.attrs?.language || '';
        const code = (node.content || []).map((c) => c.text || '').join('');
        return '```' + lang + '\n' + code + '\n```';
      }

      case 'hardBreak':
        return '\n';

      case 'horizontalRule':
        return '---';

      case 'image': {
        const src = node.attrs?.src || '';
        const alt = node.attrs?.alt || '';
        return `![${alt}](${src})`;
      }

      // ── GFM pipe table ──────────────────────────────────────────
      case 'table': {
        const tableRows = node.content || [];
        if (tableRows.length === 0) return '';

        const mdRows: string[] = [];

        tableRows.forEach((row, rowIdx) => {
          const cells = (row.content || []).map((cell) => {
            // Each cell contains paragraph node(s)
            const text = (cell.content || [])
              .map((c) => this.serializeNode(c, depth))
              .join(' ')
              .replace(/\|/g, '\\|'); // escape literal pipes inside cells
            return text;
          });

          mdRows.push('| ' + cells.join(' | ') + ' |');

          // After the first (header) row, insert the separator line
          if (rowIdx === 0) {
            mdRows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
          }
        });

        return mdRows.join('\n');
      }

      // Individual table nodes are serialized inline by the table case above;
      // these fallbacks handle edge cases (e.g. a tableRow outside a table).
      case 'tableRow':
        return (node.content || [])
          .map((c) => this.serializeNode(c, depth))
          .join(' | ');

      case 'tableHeader':
      case 'tableCell':
        return (node.content || [])
          .map((c) => this.serializeNode(c, depth))
          .join('');

      default:
        return (node.content || []).map((c) => this.serializeNode(c, depth)).join('');
    }
  }

  /**
   * Serialize a listItem, properly indenting nested sub-lists.
   */
  private serializeListItem(item: TiptapNode, depth: number, prefix: string): string {
    const indent = '  '.repeat(depth);
    const parts: string[] = [];

    for (const child of item.content || []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        // Nested list — serialize with increased depth
        parts.push(this.serializeNode(child, depth + 1));
      } else {
        const text = this.serializeNode(child, depth);
        if (parts.length === 0) {
          parts.push(indent + prefix + text);
        } else {
          parts.push(indent + '  ' + text);
        }
      }
    }

    return parts.join('\n');
  }

  private serializeInline(node: TiptapNode): string {
    if (node.type === 'text') {
      let text = node.text || '';
      if (node.marks) {
        for (const mark of node.marks) {
          switch (mark.type) {
            case 'bold':
              text = `**${text}**`;
              break;
            case 'italic':
              text = `*${text}*`;
              break;
            case 'strike':
              text = `~~${text}~~`;
              break;
            case 'code':
              text = `\`${text}\``;
              break;
            case 'link': {
              const href = mark.attrs?.href || '';
              text = `[${text}](${href})`;
              break;
            }
            case 'highlight':
              // No markdown equivalent — drop silently
              break;
          }
        }
      }
      return text;
    }
    return '';
  }
}