/**
 * One-time script to clean up outputGallery nodes with embedded images
 * This fixes workflows saved before the outputGallery externalization bug was fixed
 */

const fs = require('fs');
const path = require('path');

const workflowPath = process.argv[2];

if (!workflowPath) {
  console.error('Usage: node cleanup-workflow.js <path-to-workflow.json>');
  process.exit(1);
}

console.log(`Reading workflow: ${workflowPath}`);
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

let cleaned = false;
let totalSizeBefore = 0;
let totalSizeAfter = 0;

workflow.nodes.forEach((node, index) => {
  if (node.type === 'outputGallery' && node.data.images && node.data.images.length > 0) {
    const sizeBefore = JSON.stringify(node.data.images).length;
    const imageCount = node.data.images.filter(img => img && img.startsWith('data:')).length;

    if (imageCount > 0) {
      console.log(`\nNode ${index} (${node.id}):`);
      console.log(`  Found ${imageCount} embedded images`);
      console.log(`  Size: ${(sizeBefore / 1024 / 1024).toFixed(2)} MB`);

      node.data.images = [];
      totalSizeBefore += sizeBefore;
      cleaned = true;
    }
  }

  if (node.type === 'output' && node.data.image && node.data.image.startsWith('data:')) {
    const sizeBefore = node.data.image.length;
    console.log(`\nNode ${index} (${node.id}):`);
    console.log(`  Found embedded output image`);
    console.log(`  Size: ${(sizeBefore / 1024 / 1024).toFixed(2)} MB`);

    node.data.image = null;
    node.data.imageRef = undefined;
    if (node.data.video) {
      node.data.video = null;
    }
    totalSizeBefore += sizeBefore;
    cleaned = true;
  }
});

if (cleaned) {
  const backupPath = workflowPath.replace('.json', '.backup.json');
  console.log(`\nCreating backup: ${backupPath}`);
  fs.copyFileSync(workflowPath, backupPath);

  console.log(`Writing cleaned workflow...`);
  fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));

  const finalSize = fs.statSync(workflowPath).size;
  const originalSize = fs.statSync(backupPath).size;

  console.log(`\n✅ Done!`);
  console.log(`  Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  New size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Saved: ${((originalSize - finalSize) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`\nBackup saved to: ${backupPath}`);
} else {
  console.log('\n✓ No embedded images found - workflow is already clean!');
}
