/**
 * Unified/remark parser utilities for markdown processing and cleanup.
 * Provides abstraction over remark ecosystem for consistent document parsing.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import type { Options as StringifyOptions } from 'remark-stringify';
import type { Root } from 'mdast';
import { VFile } from 'vfile';
import type { ContentType, PreservedSection } from '../models/markdownCleanup.js';

export interface ParsedMarkdown {
  ast: Root;
  preservedSections: PreservedSection[];
  vfile: VFile;
}

export interface MarkdownParseOptions {
  preserveCodeBlocks: boolean;
  preserveFrontmatter: boolean;
  preserveMath: boolean;
  preserveHtml: boolean;
}

export const DEFAULT_PARSE_OPTIONS: MarkdownParseOptions = {
  preserveCodeBlocks: true,
  preserveFrontmatter: true,
  preserveMath: true,
  preserveHtml: true,
};

/**
 * Creates a unified processor for parsing markdown.
 */
export function createMarkdownParser(options: Partial<MarkdownParseOptions> = {}) {
  const _opts = { ...DEFAULT_PARSE_OPTIONS, ...options };
  
  return unified()
    .use(remarkParse, {
      // Configure remark-parse options
      commonmark: true,
      footnotes: true,
      gfm: true,
    });
}

/**
 * Creates a unified processor for stringifying markdown.
 */
export function createMarkdownStringifier() {
  const stringifyOptions: StringifyOptions = {
    bullet: '-',
    fence: '~',
    fences: true,
    incrementListMarker: false,
    rule: '-',
    ruleSpaces: false,
  };
  
  return unified()
    .use(remarkStringify, stringifyOptions);
}

/**
 * Parses markdown content and identifies preserved sections.
 */
export async function parseMarkdown(
  content: string,
  filePath: string = 'unknown',
  options: Partial<MarkdownParseOptions> = {}
): Promise<ParsedMarkdown> {
  const parser = createMarkdownParser(options);
  const vfile = new VFile({ path: filePath, value: content });
  
  try {
    const ast = parser.parse(vfile) as Root;
    const preservedSections = identifyPreservedSections(content, ast, options);
    
    return {
      ast,
      preservedSections,
      vfile,
    };
  } catch (error) {
    throw new Error(`Failed to parse markdown at ${filePath}: ${error}`);
  }
}

/**
 * Converts AST back to markdown string.
 */
export async function stringifyMarkdown(
  ast: Root
): Promise<string> {
  const stringifier = createMarkdownStringifier();
  const result = stringifier.stringify(ast);
  return result;
}

/**
 * Identifies sections that should be preserved during cleanup.
 */
export function identifyPreservedSections(
  content: string,
  _ast: Root,
  options: Partial<MarkdownParseOptions> = {}
): PreservedSection[] {
  const preservedSections: PreservedSection[] = [];
  const lines = content.split('\n');
  const opts = { ...DEFAULT_PARSE_OPTIONS, ...options };

  // Find code blocks
  if (opts.preserveCodeBlocks) {
    preservedSections.push(...findCodeBlockSections(lines));
  }

  // Find frontmatter
  if (opts.preserveFrontmatter) {
    const frontmatterSection = findFrontmatterSection(lines);
    if (frontmatterSection) {
      preservedSections.push(frontmatterSection);
    }
  }

  // Find math blocks
  if (opts.preserveMath) {
    preservedSections.push(...findMathSections(lines));
  }

  // Find HTML blocks
  if (opts.preserveHtml) {
    preservedSections.push(...findHtmlSections(lines));
  }

  return preservedSections.sort((a, b) => a.startLine - b.startLine);
}

/**
 * Finds code block sections in content.
 */
function findCodeBlockSections(lines: string[]): PreservedSection[] {
  const sections: PreservedSection[] = [];
  let inCodeBlock = false;
  let startLine = -1;
  let fence = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (!inCodeBlock && (line.startsWith('```') || line.startsWith('~~~'))) {
      inCodeBlock = true;
      startLine = i + 1; // 1-indexed
      fence = line.substring(0, 3);
    } else if (inCodeBlock && line.startsWith(fence)) {
      sections.push({
        type: 'CODE_BLOCK',
        startLine,
        endLine: i + 1, // 1-indexed, inclusive
        marker: fence,
      });
      inCodeBlock = false;
      startLine = -1;
    }
  }

  // Handle unclosed code blocks
  if (inCodeBlock && startLine > 0) {
    sections.push({
      type: 'CODE_BLOCK',
      startLine,
      endLine: lines.length,
      marker: fence,
    });
  }

  return sections;
}

/**
 * Finds frontmatter section.
 */
function findFrontmatterSection(lines: string[]): PreservedSection | null {
  if (lines.length === 0 || !lines[0].startsWith('---')) {
    return null;
  }

  // Find closing ---
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      return {
        type: 'FRONTMATTER',
        startLine: 1,
        endLine: i + 1,
        marker: '---',
      };
    }
  }

  return null;
}

/**
 * Finds math block sections.
 */
function findMathSections(lines: string[]): PreservedSection[] {
  const sections: PreservedSection[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Block math ($$...$$)
    if (line.includes('$$')) {
      const startIndex = line.indexOf('$$');
      const endIndex = line.indexOf('$$', startIndex + 2);
      
      if (endIndex > startIndex) {
        // Single line math block
        sections.push({
          type: 'MATH_BLOCK',
          startLine: i + 1,
          endLine: i + 1,
          marker: '$$',
        });
      } else {
        // Multi-line math block
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].includes('$$')) {
            sections.push({
              type: 'MATH_BLOCK',
              startLine: i + 1,
              endLine: j + 1,
              marker: '$$',
            });
            i = j; // Skip processed lines
            break;
          }
        }
      }
    }
  }

  return sections;
}

/**
 * Finds HTML block sections.
 */
function findHtmlSections(lines: string[]): PreservedSection[] {
  const sections: PreservedSection[] = [];
  const htmlTagRegex = /^<[a-zA-Z][^>]*>/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (htmlTagRegex.test(line)) {
      // Simple heuristic: preserve lines that start with HTML tags
      sections.push({
        type: 'HTML',
        startLine: i + 1,
        endLine: i + 1,
        marker: line.match(htmlTagRegex)?.[0] || '<html>',
      });
    }
  }

  return sections;
}

/**
 * Checks if a line number falls within any preserved section.
 */
export function isLinePreserved(
  lineNumber: number,
  preservedSections: PreservedSection[]
): boolean {
  return preservedSections.some(
    section => lineNumber >= section.startLine && lineNumber <= section.endLine
  );
}

/**
 * Gets the content type for a specific line.
 */
export function getLineContentType(
  lineNumber: number,
  preservedSections: PreservedSection[]
): ContentType {
  const section = preservedSections.find(
    s => lineNumber >= s.startLine && lineNumber <= s.endLine
  );
  
  return section?.type || 'TEXT';
}

/**
 * Utility to create a VFile from content and path.
 */
export function createVFile(content: string, filePath: string = 'unknown'): VFile {
  return new VFile({ path: filePath, value: content });
}
