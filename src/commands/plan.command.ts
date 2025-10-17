/**
 * Plan command handler - Creates _queue.yaml for download
 */

import * as fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { ConfluenceApi } from '../api.js';
import type { ConfluenceConfig, PageIndexEntry, PageTreeNode } from '../types.js';
import type { CommandContext, CommandHandler } from './types.js';

export class PlanCommand implements CommandHandler {
  api: ConfluenceApi;
  queuePath: string;
  treePath: string;
  tree: PageTreeNode[];
  constructor(private config: ConfluenceConfig) {
    this.api = new ConfluenceApi(this.config);
    this.queuePath = path.join(this.config.outputDir, '_queue.yaml');
    this.treePath = path.join(this.config.outputDir, '_tree.yaml');
    this.tree = [];
  }

  async execute(context: CommandContext): Promise<void> {

    // Create output directory if it doesn't exist
    fs.mkdirSync(this.config.outputDir, { recursive: true });


    // Step 1: Build complete tree structure (no limits applied here)
    this.tree = this.buildTreeFromIndex();

    if (this.config.pageId) {
      // Build tree from specific page and all children
      console.log(`Building tree from specific page: ${this.config.pageId}`);
      this.tree = [this.collectPageTree(this.config.pageId)];
    }

    // Step 3: Create queue from tree (apply limit only here)
    console.log(`\nCreating download queue from tree...`);
    try {
      const allPages = this.flattenTreeArray(this.tree);
      console.log(`Flattened tree to ${allPages.length} pages`);
      
      // Apply limit if specified (only affects queue, not tree)
      const pagesToQueue = this.config.limit ? allPages.slice(0, this.config.limit) : allPages;

      if (this.config.limit && allPages.length > this.config.limit) {
        console.log(`Limiting queue to first ${this.config.limit} pages (tree contains all ${allPages.length})`);
      }

      this.writeQueue(this.queuePath, this.config, pagesToQueue);

      console.log(`✓ Queue created: ${this.queuePath}`);
      console.log(`  Total pages in queue: ${pagesToQueue.length}`);
      console.log(`  Total pages in tree: ${allPages.length}`);
    } catch (error) {
      throw new Error(`Failed to create queue from tree: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Recursively collect a page and all its descendants
   */
  private collectPageTree(pageId: string, depth: number = 0): PageTreeNode {
    const indent = '  '.repeat(depth);
    
    // Find the page in the tree
    const node = this.findNodeInTree(this.tree, pageId);
    if (!node) {
      throw new Error(`Page ${pageId} not found in tree`);
    }
    
    console.log(`${indent}Found page: ${node.title} (${node.id})`);
    return node;
  }

  /**
   * Find a node by ID in the tree structure
   */
  private findNodeInTree(nodes: PageTreeNode[], pageId: string): PageTreeNode | null {
    for (const node of nodes) {
      if (node.id === pageId) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        const found = this.findNodeInTree(node.children, pageId);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  /**
   * Flatten tree structure to array of PageIndexEntry
   */
  private flattenTree(node: PageTreeNode, result: PageIndexEntry[] = []): PageIndexEntry[] {
    result.push({
      id: node.id,
      title: node.title,
      version: node.version,
      parentId: node.parentId,
      modifiedDate: node.modifiedDate,
      indexedDate: new Date().toISOString(),
      pageNumber: 0
    });
    
    if (node.children) {
      for (const child of node.children) {
        this.flattenTree(child, result);
      }
    }
    
    return result;
  }

  /**
   * Flatten array of tree nodes to array of PageIndexEntry
   */
  private flattenTreeArray(trees: PageTreeNode[]): PageIndexEntry[] {
    const result: PageIndexEntry[] = [];
    for (const tree of trees) {
      this.flattenTree(tree, result);
    }
    return result;
  }

  /**
   * Build tree structure from flat index
   */
  private buildTreeFromIndex(): PageTreeNode[] {
    const indexPath = path.join(this.config.outputDir, '_index.yaml');

    const yamlContent = fs.readFileSync(indexPath, 'utf-8');
    const pages = yaml.parse(yamlContent) as PageIndexEntry[];

    console.log(`Read ${pages.length} pages from _index.yaml`);

    const nodeMap = new Map<string, PageTreeNode>();
    const roots: PageTreeNode[] = [];
    
    // First pass: create all nodes
    for (const page of pages) {
      nodeMap.set(page.id, {
        id: page.id,
        title: page.title,
        version: page.version,
        parentId: page.parentId,
        modifiedDate: page.modifiedDate,
        children: []
      });
    }
    
    // Second pass: build tree structure
    for (const page of pages) {
      const node = nodeMap.get(page.id);
      if (!node) continue;
      
      if (page.parentId && nodeMap.has(page.parentId)) {
        // Add as child to parent
        const parent = nodeMap.get(page.parentId);
        if (parent?.children) {
          parent.children.push(node);
        }
      } else {
        // No parent or parent not in index - it's a root
        roots.push(node);
      }
    }
    this.writeTree(roots);
    console.log(`✓ Complete tree structure saved: ${this.treePath}`);

    return roots;
  }

  /**
   * Write _tree.yaml file with hierarchical structure
   */
  private writeTree(tree: PageTreeNode[]): void {
    const header = `# Confluence Page Tree
# Space: ${this.config.spaceKey}
# Created: ${new Date().toISOString()}

`;

    const yamlContent = yaml.stringify(tree, {
      indent: 2,
      lineWidth: 0 // No line wrapping
    });

    fs.writeFileSync(this.treePath, header + yamlContent, 'utf-8');
  }

  /**
   * Write _queue.yaml file
   */
  private writeQueue(queuePath: string, config: CommandContext['config'], pages: PageIndexEntry[]): void {
    const header = `# Confluence Download Queue
# Space: ${config.spaceKey}
# Created: ${new Date().toISOString()}
# Total Pages: ${pages.length}

`;

    fs.writeFileSync(queuePath, header, 'utf-8');

    // Write each page as YAML array entry
    for (const page of pages) {
      const yamlDoc = yaml.stringify(page).trim();
      const lines = yamlDoc.split('\n');
      const arrayItem = lines.map((line, index) => {
        if (index === 0) {
          return `- ${line}`;
        }
        return `  ${line}`;
      }).join('\n');

      fs.appendFileSync(queuePath, arrayItem + '\n', 'utf-8');
    }
  }
}
