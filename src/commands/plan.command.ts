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
  constructor(private config: ConfluenceConfig) {}

  async execute(context: CommandContext): Promise<void> {
    const api = new ConfluenceApi(this.config);

    // Create output directory if it doesn't exist
    fs.mkdirSync(this.config.outputDir, { recursive: true });

    const queuePath = path.join(this.config.outputDir, '_queue.yaml');
    const treePath = path.join(this.config.outputDir, '_tree.yaml');

    // Step 1: Build complete tree structure (no limits applied here)
    let tree: PageTreeNode[];

    if (this.config.pageId) {
      // Build tree from specific page and all children
      console.log(`Building tree for page: ${this.config.pageId} and all children`);
      console.log(`Output directory: ${this.config.outputDir}\n`);

      try {
        const rootNode = await this.collectPageTree(api, this.config.pageId);
        tree = [rootNode];
      } catch (error) {
        throw new Error(`Failed to build tree for page ${this.config.pageId}: ${error instanceof Error ? error.message : error}`);
      }
    } else {
      // Build tree from existing _index.yaml
      console.log(`Building tree from existing index`);
      console.log(`Output directory: ${this.config.outputDir}\n`);

     
      try {
        
        // Build COMPLETE tree structure (no limit applied)
        tree = this.buildTreeFromIndex();
        
        console.log(`Built tree structure with ${tree.length} root node(s)`);
      } catch (error) {
        throw new Error(`Failed to read index: ${error instanceof Error ? error.message : error}`);
      }
    }

    // Step 2: Write complete tree structure to disk
    console.log(`\nWriting complete tree structure...`);
    try {
      this.writeTree(treePath, this.config, tree);
      console.log(`✓ Complete tree structure saved: ${treePath}`);
    } catch (error) {
      throw new Error(`Failed to write tree: ${error instanceof Error ? error.message : error}`);
    }

    // Step 3: Create queue from tree (apply limit only here)
    console.log(`\nCreating download queue from tree...`);
    try {
      const allPages = this.flattenTreeArray(tree);
      console.log(`Flattened tree to ${allPages.length} pages`);
      
      // Apply limit if specified (only affects queue, not tree)
      const pagesToQueue = this.config.limit ? allPages.slice(0, this.config.limit) : allPages;

      if (this.config.limit && allPages.length > this.config.limit) {
        console.log(`Limiting queue to first ${this.config.limit} pages (tree contains all ${allPages.length})`);
      }

      this.writeQueue(queuePath, this.config, pagesToQueue);

      console.log(`✓ Queue created: ${queuePath}`);
      console.log(`  Total pages in queue: ${pagesToQueue.length}`);
      console.log(`  Total pages in tree: ${allPages.length}`);
    } catch (error) {
      throw new Error(`Failed to create queue from tree: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Recursively collect a page and all its descendants
   */
  private async collectPageTree(api: ConfluenceApi, pageId: string, depth: number = 0): Promise<PageTreeNode> {
    const indent = '  '.repeat(depth);
    
    // Fetch the page
    const page = await api.getPage(pageId);
    console.log(`${indent}[${depth + 1}] Found: ${page.title} (${page.id})`);
    
    // Create tree node
    const node: PageTreeNode = {
      id: page.id,
      title: page.title,
      version: page.version,
      parentId: page.parentId,
      modifiedDate: page.modifiedDate,
      children: []
    };
    
    // Fetch child pages
    const children = await api.getChildPages(pageId);
    
    // Recursively collect children
    for (const child of children) {
      const childNode = await this.collectPageTree(api, child.id, depth + 1);
      if (node.children) {
        node.children.push(childNode);
      }
    }
    
    return node;
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
    
    return roots;
  }

  /**
   * Write _tree.yaml file with hierarchical structure
   */
  private writeTree(treePath: string, config: CommandContext['config'], tree: PageTreeNode[]): void {
    const header = `# Confluence Page Tree
# Space: ${config.spaceKey}
# Created: ${new Date().toISOString()}

`;
    
    const yamlContent = yaml.stringify(tree, {
      indent: 2,
      lineWidth: 0 // No line wrapping
    });
    
    fs.writeFileSync(treePath, header + yamlContent, 'utf-8');
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
