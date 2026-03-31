const fs = require("fs");
const path = require("path");

const NCERT_ROOT = "D:\\Everything\\Businesses\\NCERT-textbooks";

var folders = [
  { path: "Class_9\\sanskrit",  prefix: "vyakaranavithi" },
  { path: "Class_10\\sanskrit", prefix: "vyakaranavithi" },
];

var total = 0;

folders.forEach(function(f) {
  var folderPath = path.join(NCERT_ROOT, f.path);
  try {
    var files = fs.readdirSync(folderPath);
    files.forEach(function(file) {
      var match = file.match(/^appendix_1(\d{2})\.pdf$/i);
      if (match) {
        var chNum = match[1];
        var newName = f.prefix + "_chapter_" + chNum + ".pdf";
        var oldPath = path.join(folderPath, file);
        var newPath = path.join(folderPath, newName);
        if (!fs.existsSync(newPath)) {
          fs.renameSync(oldPath, newPath);
          console.log("OK: " + file + " -> " + newName);
          total++;
        }
      }
    });
  } catch(e) {
    console.log("Error: " + e.message);
  }
});

console.log("\nFixed: " + total + " files");
