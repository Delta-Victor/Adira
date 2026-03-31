const fs = require("fs");
const path = require("path");

const NCERT_ROOT = "D:\\Everything\\Businesses\\NCERT-textbooks";

// Fix Sanskrit folders where appendix_101 should be chapter_01
var foldersToFix = [
  "Class_9\\sanskrit",
  "Class_10\\sanskrit"
];

foldersToFix.forEach(function(folder) {
  var folderPath = path.join(NCERT_ROOT, folder);

  try {
    var files = fs.readdirSync(folderPath).filter(function(f) {
      return f.toLowerCase().endsWith(".pdf");
    });

    files.forEach(function(file) {
      var lower = file.toLowerCase();

      // Fix appendix_101 -> chapter_01 etc
      var match = file.match(/^appendix_1(\d{2})\.pdf$/i);
      if (match) {
        var chNum = match[1];
        var newName = "shemushi_chapter_" + chNum + ".pdf";
        var oldPath = path.join(folderPath, file);
        var newPath = path.join(folderPath, newName);
        if (!fs.existsSync(newPath)) {
          fs.renameSync(oldPath, newPath);
          console.log("Fixed: " + file + " -> " + newName);
        }
      }
    });
  } catch(e) {
    console.log("Error in " + folder + ": " + e.message);
  }
});

console.log("\nSanskrit fix complete!");
