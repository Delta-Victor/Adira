const fs = require("fs");
const path = require("path");

const NCERT_ROOT = "D:\\Everything\\Businesses\\NCERT-textbooks";

console.log("Scanning for unrecognized files...\n");

var classFolders = fs.readdirSync(NCERT_ROOT)
  .filter(function(f) { return f.toLowerCase().startsWith("class"); })
  .sort();

var unrecognized = [];
var answerKeys = [];
var supplementary = [];
var doubledot = [];
var validOther = [];

function isValidFile(lower) {
  // Real chapter files
  if (/^chapter_\d/.test(lower)) return true;
  if (/^part\d_chapter_\d/.test(lower)) return true;
  if (/_chapter_\d/.test(lower)) return true;

  // Appendix files — all valid
  if (/^appendix_/.test(lower)) return true;
  if (/_appendix_/.test(lower)) return true;

  // Supplementary files — all valid
  if (lower.endsWith("_supplementary.pdf")) return true;
  if (lower === "supplementary.pdf") return true;
  if (/^part\d_supplementary/.test(lower)) return true;

  // PE and vocational workbooks
  if (/^(deky|eeky|fekb)/.test(lower)) return true;

  return false;
}

function isAnswerKey(lower) {
  var name = lower.replace(".pdf", "");
  return /1an$|2an$|1sm$|2sm$|1ps$|2ps$/.test(name);
}

function scanFolder(folderPath, classNum, subject) {
  var files;
  try {
    files = fs.readdirSync(folderPath).filter(function(f) {
      return f.toLowerCase().endsWith(".pdf");
    });
  } catch(e) { return; }

  files.forEach(function(file) {
    var lower = file.toLowerCase();
    var label = "Class " + classNum + " | " + subject + " | " + file;

    // Double dot files
    if (file.includes("..")) {
      doubledot.push(label);
      return;
    }

    // Answer keys
    if (isAnswerKey(lower)) {
      answerKeys.push(label);
      return;
    }

    // Valid files
    if (isValidFile(lower)) {
      return;
    }

    // Everything else
    unrecognized.push(label);
  });
}

classFolders.forEach(function(classFolder) {
  var classPath = path.join(NCERT_ROOT, classFolder);
  var classNum = classFolder.replace(/[^0-9]/g, "");

  var subjects = fs.readdirSync(classPath).filter(function(f) {
    return fs.statSync(path.join(classPath, f)).isDirectory();
  });

  subjects.forEach(function(subject) {
    var subjectPath = path.join(classPath, subject);
    var subFolders = fs.readdirSync(subjectPath).filter(function(f) {
      return fs.statSync(path.join(subjectPath, f)).isDirectory();
    });

    if (subFolders.length === 0) {
      scanFolder(subjectPath, classNum, subject);
    } else {
      subFolders.forEach(function(part) {
        scanFolder(
          path.join(subjectPath, part),
          classNum,
          subject + "/" + part
        );
      });
    }
  });
});

console.log("=== SUMMARY ===\n");
console.log("Answer keys (skipped): " + answerKeys.length);
console.log("Double-dot files (need fix): " + doubledot.length);
console.log("Genuinely unrecognized: " + unrecognized.length);

if (doubledot.length > 0) {
  console.log("\n=== DOUBLE DOT FILES ===");
  doubledot.forEach(function(f) { console.log(f); });
}

if (unrecognized.length > 0) {
  console.log("\n=== GENUINELY UNRECOGNIZED ===");
  unrecognized.forEach(function(f) { console.log(f); });
} else {
  console.log("\n✅ All files correctly organized!");
}
