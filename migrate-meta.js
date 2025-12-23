#!/usr/bin/env node
/**
 * Migration script: Move .meta.json data into _index.yaml
 *
 * This script reads all .meta.json files in the output directory
 * and updates the corresponding entries in _index.yaml with
 * downloadedVersion and downloadedAt fields.
 *
 * Usage: node migrate-meta.js <outputDir>
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { parse, stringify } from 'yaml';

function migrateMetaToIndex(outputDir) {
  const indexPath = join(outputDir, '_index.yaml');

  if (!existsSync(indexPath)) {
    console.error(`❌ _index.yaml not found in ${outputDir}`);
    process.exit(1);
  }

  console.log(`📖 Reading _index.yaml from ${indexPath}`);
  const indexContent = readFileSync(indexPath, 'utf-8');
  const index = parse(indexContent);

  console.log(`📊 Found ${index.length} entries in index`);

  let migrated = 0;
  let skipped = 0;
  const metaFiles = [];

  // First pass: collect all .meta.json files
  function collectMetaFiles(dir) {
    if (!existsSync(dir)) return;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('_') && entry.name !== 'images') {
          collectMetaFiles(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.meta.json')) {
          metaFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Could not read directory ${dir}:`, error);
    }
  }

  function migrateMetaFile(metaPath) {
    try {
      const metaContent = readFileSync(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);

      // Find corresponding entry in index
      const indexEntry = index.find(entry => entry.id === meta.pageId);
      if (!indexEntry) {
        console.log(`⚠️  No index entry found for page ${meta.pageId}, skipping`);
        skipped++;
        return;
      }

      // Update index entry with download metadata
      indexEntry.downloadedVersion = meta.version;
      indexEntry.downloadedAt = meta.downloadedAt;

      console.log(`✅ Migrated ${meta.pageId} (${indexEntry.title}): v${meta.version} at ${meta.downloadedAt}`);

      // Remove the .meta.json file
      unlinkSync(metaPath);
      migrated++;
    } catch (error) {
      console.error(`❌ Failed to migrate ${metaPath}:`, error);
    }
  }

  function writeIndex() {
    const header = `# Confluence Page Index
# Migrated download metadata from .meta.json files
# Created: ${new Date().toISOString()}

`;
    const yamlContent = stringify(index, {
      indent: 2,
      lineWidth: 0
    });

    writeFileSync(indexPath, header + yamlContent, 'utf-8');
  }

  console.log(`\n🔍 Scanning for .meta.json files in ${outputDir}...`);
  collectMetaFiles(outputDir);

  if (metaFiles.length === 0) {
    console.log(`ℹ️  No .meta.json files found to migrate`);
    return;
  }

  console.log(`📋 Found ${metaFiles.length} .meta.json files to migrate`);

  // Process in batches of 100
  const batchSize = 100;
  for (let i = 0; i < metaFiles.length; i += batchSize) {
    const batch = metaFiles.slice(i, i + batchSize);
    console.log(`\n🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(metaFiles.length / batchSize)} (${batch.length} files)...`);

    for (const metaPath of batch) {
      migrateMetaFile(metaPath);
    }

    console.log(`💾 Writing updated _index.yaml after batch...`);
    writeIndex();
    console.log(`✅ Batch complete: ${migrated} total migrated so far`);
  }

  console.log(`\n✅ Migration complete: ${migrated} entries updated, ${skipped} skipped`);
}
const outputDir = process.argv[2] || './output';

if (!outputDir) {
  console.error('Usage: node migrate-meta.js <outputDir>');
  process.exit(1);
}

console.log(`🚀 Starting migration from .meta.json to _index.yaml\n`);
migrateMetaToIndex(outputDir);
console.log(`\n🎉 Migration finished!`);
