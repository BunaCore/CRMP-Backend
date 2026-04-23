import { Injectable, BadRequestException } from '@nestjs/common';

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

interface TiptapDoc extends TiptapNode {
  type: 'doc';
  content: TiptapNode[];
}

@Injectable()
export class TiptapValidator {
  private readonly allowedNodes = new Set([
    'doc',
    'paragraph',
    'heading',
    'text',
    'blockquote',
    'bulletList',
    'orderedList',
    'listItem',
    'codeBlock',
    'hardBreak',
    'horizontalRule',
    'image',
    'imageResize',
    'resizableImage',   // alias used by some TipTap image-resize extensions
    'table',
    'tableRow',
    'tableHeader',
    'tableCell',
    'taskList',
    'taskItem',
  ]);

  private readonly allowedMarks = new Set([
    'bold',
    'italic',
    'strike',
    'code',
    'link',
    'highlight',
    'underline',
    'subscript',
    'superscript',
    'textStyle',
  ]);

  private readonly nodeSchemas: Record<string, (node: TiptapNode) => boolean> = {
    doc: (node) => {
      return Array.isArray(node.content) && node.content.length > 0;
    },
    paragraph: (node) => {
      return node.content === undefined || Array.isArray(node.content);
    },
    heading: (node) => {
      const level = node.attrs?.level;
      return typeof level === 'number' && level >= 1 && level <= 6 &&
             (node.content === undefined || Array.isArray(node.content));
    },
    text: (node) => {
      return typeof node.text === 'string' && node.text.length >= 0;
    },
    blockquote: (node) => {
      return Array.isArray(node.content);
    },
    bulletList: (node) => {
      return Array.isArray(node.content);
    },
    orderedList: (node) => {
      return Array.isArray(node.content);
    },
    listItem: (node) => {
      return Array.isArray(node.content);
    },
    codeBlock: (node) => {
      return node.content === undefined || Array.isArray(node.content);
    },
    hardBreak: (node) => {
      return true; // No content
    },
    horizontalRule: (node) => {
      return true; // No content
    },
    image: (node) => {
      return typeof node.attrs?.src === 'string' &&
             (typeof node.attrs?.alt === 'string' || node.attrs?.alt === undefined);
    },
    imageResize: (node) => {
      return typeof node.attrs?.src === 'string'; // Support base64 or URL and custom widths
    },
    table: (node) => {
      if (!Array.isArray(node.content)) return false;
      // Ensure table has at least one row
      return node.content.length > 0 && node.content.every(row => row.type === 'tableRow');
    },
    tableRow: (node) => {
      if (!Array.isArray(node.content)) return false;
      // Ensure row has cells
      return node.content.length > 0 && node.content.every(cell => cell.type === 'tableHeader' || cell.type === 'tableCell');
    },
    tableHeader: (node) => {
      // Allow optional colspan/rowspan attrs; content may be empty (zero-content cells)
      const validColspan = node.attrs?.colspan === undefined ||
        (typeof node.attrs.colspan === 'number' && node.attrs.colspan >= 1);
      const validRowspan = node.attrs?.rowspan === undefined ||
        (typeof node.attrs.rowspan === 'number' && node.attrs.rowspan >= 1);
      const validContent = node.content === undefined ||
        (Array.isArray(node.content) && node.content.every(child => typeof child === 'object'));
      return validColspan && validRowspan && validContent;
    },
    tableCell: (node) => {
      // Allow optional colspan/rowspan attrs; content may be empty (zero-content cells)
      const validColspan = node.attrs?.colspan === undefined ||
        (typeof node.attrs.colspan === 'number' && node.attrs.colspan >= 1);
      const validRowspan = node.attrs?.rowspan === undefined ||
        (typeof node.attrs.rowspan === 'number' && node.attrs.rowspan >= 1);
      const validContent = node.content === undefined ||
        (Array.isArray(node.content) && node.content.every(child => typeof child === 'object'));
      return validColspan && validRowspan && validContent;
    },
    taskList: (node) => Array.isArray(node.content),
    taskItem: (node) => Array.isArray(node.content),
  };

  private readonly markSchemas: Record<string, (mark: TiptapMark) => boolean> = {
    bold: () => true,
    italic: () => true,
    strike: () => true,
    code: () => true,
    link: (mark) => {
      return typeof mark.attrs?.href === 'string';
    },
    highlight: (mark) => {
      return true; // color is optional
    },
    underline: () => true,
    subscript: () => true,
    superscript: () => true,
    textStyle: () => true, // supports font family
  };

  validateDocument(content: any): TiptapDoc {
    if (!content || typeof content !== 'object') {
      throw new BadRequestException('Document must be a valid object');
    }

    if (content.type !== 'doc') {
      throw new BadRequestException('Document must have type "doc"');
    }

    this.validateNode(content as TiptapNode, true);
    return content as TiptapDoc;
  }

  private validateNode(node: TiptapNode, isRoot = false): void {
    if (!node.type || typeof node.type !== 'string') {
      throw new BadRequestException('Node must have a valid type');
    }

    if (!this.allowedNodes.has(node.type)) {
      throw new BadRequestException(`Unsupported node type: ${node.type}`);
    }

    // Validate node-specific schema
    const schemaValidator = this.nodeSchemas[node.type];
    if (schemaValidator && !schemaValidator(node)) {
      throw new BadRequestException(`Invalid structure for node type: ${node.type}`);
    }

    // Validate marks on text nodes
    if (node.type === 'text' && node.marks) {
      this.validateMarks(node.marks);
    }

    // Recursively validate content
    if (node.content) {
      if (!Array.isArray(node.content)) {
        throw new BadRequestException('Node content must be an array');
      }

      for (const child of node.content) {
        this.validateNode(child);
      }
    }

    // Ensure root has content
    if (isRoot && (!node.content || node.content.length === 0)) {
      throw new BadRequestException('Document must have content');
    }
  }

  private validateMarks(marks: TiptapMark[]): void {
    if (!Array.isArray(marks)) {
      throw new BadRequestException('Marks must be an array');
    }

    for (const mark of marks) {
      if (!mark.type || typeof mark.type !== 'string') {
        throw new BadRequestException('Mark must have a valid type');
      }

      if (!this.allowedMarks.has(mark.type)) {
        throw new BadRequestException(`Unsupported mark type: ${mark.type}`);
      }

      const schemaValidator = this.markSchemas[mark.type];
      if (schemaValidator && !schemaValidator(mark)) {
        throw new BadRequestException(`Invalid structure for mark type: ${mark.type}`);
      }
    }
  }

  sanitizeDocument(content: any): TiptapDoc {
    // For now, just validate. In future, could strip unknown parts
    return this.validateDocument(content);
  }
}