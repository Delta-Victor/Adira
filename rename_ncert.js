const fs = require("fs");
const path = require("path");

const NCERT_ROOT = "D:\\Everything\\Businesses\\NCERT-textbooks";

var BOOK_CODES = {
  // Class 9 & 10 English
  "jefp": "footprints",
  "jebe": "firstflight",
  "iebe": "beehive",
  "iemo": "moments",
  "iewe": "wordsworth",

  // Class 11 English
  "kesp": "snapshots",
  "keww": "woven_words",
  "kehb": "hornbill",

  // Class 12 English
  "lekl": "kaleidoscope",
  "levt": "vistas",
  "lvfl": "flamingo",

  // Class 9 Hindi
  "ihkr": "kritika",
  "ihks": "kshitij",
  "ihsp": "sparsh",
  "ihsy": "sanchayan",
  "ihsa": "sanchayan",

  // Class 10 Hindi
  "jhkr": "kritika",
  "jhks": "kshitij",
  "jhsp": "sparsh",
  "jhsy": "sanchayan",

  // Class 11 Hindi
  "kehv": "aroh",
  "kevv": "vitan",

  // Class 12 Hindi
  "lhat": "antra",
  "lhar": "antral",
  "lhvt": "vitan",
  "lhkr": "aroh",

  // Sanskrit
  "jsab": "shemushi",
  "isab": "shemushi",
  "jhva": "vyakaranavithi",
  "jhvb": "abhyaswaan",

  // SST Class 9
  "iess1": "history",
  "iess2": "history",
  "iess3": "geography",
  "iess4": "economics",
  "iess5": "civics",

  // SST Class 10
  "jess1": "history",
  "jess2": "history",
  "jess3": "geography",
  "jess4": "economics",
  "jess5": "civics",

  // Physics Part 2
  "keph2": "physics_part2",
  "leph2": "physics_part2",

  // Chemistry Part 2
  "kech2": "chemistry_part2",
  "lech2": "chemistry_part2",

  // Accountancy Part 2
  "keac2": "accountancy_part2",
  "leac2": "accountancy_part2",

  // Business Studies Part 2
  "lebs2": "business_studies_part2",

  // Political Science Part 2
  "keps2": "political_science_part2",

  // Misc
  "fees1": "geography_mapwork",
  "gees1": "geography_mapwork",
  "gees2": "geography_mapwork",
  "hees1": "geography_mapwork",
  "deky1": "physical_education",
  "eeky1": "physical_education",
  "fekb1": "vocational"
};

// Files to completely skip
var SKIP_SUFFIXES = ["1an", "2an", "1sm", "2sm", "1wc", "2wc"];

function getBookName(filename) {
  var lower = filename.toLowerCase();

  // Try 5-char match first (for SST with number)
  var prefix5 = lower.substring(0, 5);
  if (BOOK_CODES[prefix5]) return BOOK_CODES[prefix5];

  // Try 4-char match
  var prefix4 = lower.substring(0, 4);
  if (BOOK_CODES[prefix4]) return BOOK_CODES[prefix4];

  // Try 3-char match
  var prefix3 = lower.substring(0, 3);
  if (BOOK_CODES[prefix3]) return BOOK_CODES[prefix3];

  return null;
}

function processFolder(folderPath, prefix) {
  var renamed = 0;
  var skipped = 0;

  var files;
  try {
    files = fs.readdirSync(folderPath).filter(function(f) {
      return f.toLowerCase().endsWith(".pdf");
    });
  } catch(e) {
    return { renamed: renamed, skipped: skipped };
  }

  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var filePath = path.join(folderPath, file);
    var nameWithoutExt = file.replace(/\.pdf$/i, "");
    var lower = nameWithoutExt.toLowerCase();

    // Skip already renamed files
    var alreadyRenamed = /^(chapter_|appendix_|part\d_chapter|part\d_appendix)/.test(lower) ||
      Object.values(BOOK_CODES).some(function(b) {
        return lower.startsWith(b.toLowerCase() + "_") ||
               lower.startsWith(b.toLowerCase() + "chapter") ||
               lower === b.toLowerCase() + "_supplementary";
      });
    if (alreadyRenamed) {
      skipped++;
      continue;
    }

    // Skip answer keys and notes
    var isSkip = SKIP_SUFFIXES.some(function(s) {
      return lower.endsWith(s);
    });
    if (isSkip) {
      console.log("  Skip (answers): " + file);
      skipped++;
      continue;
    }

    var bookName = getBookName(lower);

    // Handle supplementary/ps files
    if (lower.endsWith("ps") || lower.endsWith("lp") ||
        lower.endsWith("gl") || lower.endsWith("ax") ||
        lower.endsWith("wc")) {
      var supName = (bookName ? bookName : prefix) + "_supplementary.pdf";
      var supPath = path.join(folderPath, supName);
      try {
        if (!fs.existsSync(supPath) && file !== supName) {
          fs.renameSync(filePath, supPath);
          console.log("  OK: " + file + " -> " + supName);
          renamed++;
        } else {
          skipped++;
        }
      } catch(e) {
        console.log("  ERROR: " + e.message);
      }
      continue;
    }

    // Handle appendix files
    var appendixMatch = nameWithoutExt.match(/a(\d+)$/i);
    if (appendixMatch) {
      var appNum = appendixMatch[1].padStart(2, "0");
      var appPrefix = bookName ? bookName + "_" : prefix;
      var appName = appPrefix + "appendix_" + appNum + ".pdf";
      var appPath = path.join(folderPath, appName);
      try {
        if (!fs.existsSync(appPath) && file !== appName) {
          fs.renameSync(filePath, appPath);
          console.log("  OK: " + file + " -> " + appName);
          renamed++;
        } else {
          skipped++;
        }
      } catch(e) {
        console.log("  ERROR: " + e.message);
      }
      continue;
    }

    // Extract chapter number
    var chapterMatch = nameWithoutExt.match(/(\d{2,3})(?:\.\.|\.)?$/);
    if (!chapterMatch) {
      console.log("  Unrecognized: " + file);
      skipped++;
      continue;
    }

    var chapterNum = chapterMatch[1];
    if (chapterNum.length === 3) {
      chapterNum = chapterNum.slice(1);
    }
    var chapterFormatted = chapterNum.padStart(2, "0");
    var finalPrefix = bookName ? bookName + "_" : prefix;
    var newName = finalPrefix + "chapter_" + chapterFormatted + ".pdf";
    var newPath = path.join(folderPath, newName);

    try {
      if (file === newName) {
        skipped++;
        continue;
      }
      if (!fs.existsSync(newPath)) {
        fs.renameSync(filePath, newPath);
        console.log("  OK: " + file + " -> " + newName);
        renamed++;
      } else {
        console.log("  EXISTS: " + newName + " (skipping " + file + ")");
        skipped++;
      }
    } catch(e) {
      console.log("  ERROR: " + file + " - " + e.message);
    }
  }

  return { renamed: renamed, skipped: skipped };
}

function run() {
  console.log("Starting final NCERT rename...\n");
  var totalRenamed = 0;
  var totalSkipped = 0;

  var classFolders = fs.readdirSync(NCERT_ROOT)
    .filter(function(f) { return f.toLowerCase().startsWith("class"); })
    .sort();

  for (var ci = 0; ci < classFolders.length; ci++) {
    var classFolder = classFolders[ci];
    var classPath = path.join(NCERT_ROOT, classFolder);
    console.log("Processing: " + classFolder);

    var subjects = fs.readdirSync(classPath).filter(function(f) {
      return fs.statSync(path.join(classPath, f)).isDirectory();
    });

    for (var si = 0; si < subjects.length; si++) {
      var subject = subjects[si];
      var subjectPath = path.join(classPath, subject);
      console.log("  Subject: " + subject);

      var subFolders = fs.readdirSync(subjectPath).filter(function(f) {
        return fs.statSync(path.join(subjectPath, f)).isDirectory();
      });

      if (subFolders.length === 0) {
        var r = processFolder(subjectPath, "");
        totalRenamed += r.renamed;
        totalSkipped += r.skipped;
      } else {
        for (var pi = 0; pi < subFolders.length; pi++) {
          var partFolder = subFolders[pi];
          var partPath = path.join(subjectPath, partFolder);
          var partMatch = partFolder.match(/(\d+)/);
          var partNum = partMatch ? partMatch[1] : "1";
          console.log("    Part: " + partFolder);
          var pr = processFolder(partPath, "part" + partNum + "_");
          totalRenamed += pr.renamed;
          totalSkipped += pr.skipped;
        }
      }
    }
  }

  console.log("\nDone!");
  console.log("Renamed: " + totalRenamed);
  console.log("Skipped: " + totalSkipped);
}

run();
