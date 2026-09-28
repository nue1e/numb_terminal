const fs = require('fs');
const path = require('path');

// Target the public frontend folder
const TARGET_DIR = path.join(__dirname, '../public/layers');

function cleanFileNames(dir) {
    if (!fs.existsSync(dir)) {
        console.log("❌ Folder not found:", dir);
        return;
    }

    const items = fs.readdirSync(dir);
    
    items.forEach(item => {
        const fullPath = path.join(dir, item);
        
        if (fs.statSync(fullPath).isDirectory()) {
            cleanFileNames(fullPath);
        } else if (item.includes('#')) {
            // Cut off the # and add .png back
            const cleanName = item.split('#')[0].trim() + '.png';
            const newPath = path.join(dir, cleanName);
            
            fs.renameSync(fullPath, newPath);
        }
    });
}

console.log("🧹 Scrubbing '#' symbols from local public files to bypass Vite bug...");
cleanFileNames(TARGET_DIR);
console.log("✅ Cleanup complete! Vite can now read your images.");