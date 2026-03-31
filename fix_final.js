const fs = require("fs");
const path = require("path");

const NCERT_ROOT = "D:\\Everything\\Businesses\\NCERT-textbooks";

// These folders have appendix_1XX files that are actually chapters
var fixes = [
  // Sanskrit Class 9 - Shemushi chapters
  { folder: "Class_9\\sanskrit", prefix: "shemushi" },
  // Sanskrit Class 10 - Shemushi chapters  
  { folder: "Class_10\\sanskrit", prefix: "shemushi" },
  // Hindi Class 9 - Sanchayan chapters
  { folder: "Class_9\\hindi", prefix: "sanchayan" },
  // Accountancy Class 12 Part 2 chapters
  { folder: "Class_12\\accountancy", prefix: "accountancy_part2" }
];

var totalFixed = 0;

fixes.forEach(function(fix) {
  var folderPath = path.join(NCERT_ROOT, fix.folder);

  try {
    var files = fs.readdirSync(folderPath).filter(function(f) {
      return f.toLowerCase().endsWith(".pdf");
    });

    files.forEach(function(file) {
      // Fix appendix_1XX -> prefix_chapter_XX
      var match = file.match(/^appendix_1(\d{2})\.pdf$/i);
      if (match) {
        var chNum = match[1];
        var newName = fix.prefix + "_chapter_" + chNum + ".pdf";
        var oldPath = path.join(folderPath, file);
        var newPath = path.join(folderPath, newName);
        if (!fs.existsSync(newPath)) {
          fs.renameSync(oldPath, newPath);
          console.log("Fixed: " + file + " -> " + newName);
          totalFixed++;
        } else {
          console.log("Exists: " + newName + " (skipping)");
        }
      }
    });
  } catch(e) {
    console.log("Error in " + fix.folder + ": " + e.message);
  }
});

console.log("\nTotal fixed: " + totalFixed);
console.log("Done!");
