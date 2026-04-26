const path = require("path");
const fs = require("fs");

const SYLLABI_DIR = path.join(__dirname, "../data/syllabi");

// Normalize subject names to match JSON filenames
const SUBJECT_MAP = {
  "science":        "science",
  "maths":          "maths",
  "math":           "maths",
  "mathematics":    "maths",
  "english":        "english",
  "hindi":          "hindi",
  "social science": "social_science",
  "sst":            "social_science",
  "history":        "social_science",
  "geography":      "social_science",
  "civics":         "social_science",
  "sanskrit":       "sanskrit",
  "physics":        "physics",
  "chemistry":      "chemistry",
  "biology":        "biology",
  "economics":      "economics",
  "accountancy":    "accountancy",
  "business studies": "business_studies",
  "business":       "business_studies",
  "political science": "political_science",
};

// ─────────────────────────────────────────
// INTERNAL: LOAD SYLLABUS JSON
// Returns parsed config or null if not found
// ─────────────────────────────────────────
function loadSyllabus(classNum, subject) {
  const subjectKey = SUBJECT_MAP[subject.toLowerCase().trim()] || subject.toLowerCase().trim();
  const filename = `class${classNum}_${subjectKey}.json`;
  const filepath = path.join(SYLLABI_DIR, filename);

  try {
    const raw = fs.readFileSync(filepath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────
// GET CHAPTER DATA
// Returns full chapter object or null
// ─────────────────────────────────────────
function getChapterData(classNum, subject, chapterNum) {
  const syllabus = loadSyllabus(classNum, subject);
  if (!syllabus) return null;

  const num = parseInt(chapterNum);
  return syllabus.chapters.find(ch => ch.number === num) || null;
}

// ─────────────────────────────────────────
// GET CHAPTER TITLE
// ─────────────────────────────────────────
function getChapterTitle(classNum, subject, chapterNum) {
  const chapter = getChapterData(classNum, subject, chapterNum);
  return chapter ? chapter.title : null;
}

// ─────────────────────────────────────────
// IS VALID CHAPTER
// Returns true if syllabus config exists and chapter number is in range
// ─────────────────────────────────────────
function isValidChapter(classNum, subject, chapterNum) {
  return getChapterData(classNum, subject, chapterNum) !== null;
}

// ─────────────────────────────────────────
// LIST ALL CHAPTERS
// Returns array of { number, title } for a class/subject
// Used for building WhatsApp button menus
// ─────────────────────────────────────────
function listChapters(classNum, subject) {
  const syllabus = loadSyllabus(classNum, subject);
  if (!syllabus) return null;

  return syllabus.chapters.map(ch => ({
    number: ch.number,
    title: ch.title,
  }));
}

// ─────────────────────────────────────────
// BUILD SYLLABUS CONTEXT
// Returns a formatted string injected into Claude prompts.
// Replaces the old Qdrant ncertContext with deterministic, authoritative data.
// ─────────────────────────────────────────
function buildSyllabusContext(classNum, subject, chapterNum) {
  const chapter = getChapterData(classNum, subject, chapterNum);

  if (!chapter) {
    return `No syllabus config found for Class ${classNum} ${subject} Chapter ${chapterNum}. Use standard CBSE curriculum knowledge.`;
  }

  const lines = [];

  lines.push(`CBSE SYLLABUS — Class ${classNum} ${subject}`);
  lines.push(`Chapter ${chapter.number}: ${chapter.title}`);
  lines.push("");

  lines.push("TOPICS AND SUBTOPICS:");
  chapter.topics.forEach((topic, i) => {
    lines.push(`${i + 1}. ${topic.title}`);
    topic.subtopics.forEach(sub => {
      lines.push(`   • ${sub}`);
    });
  });

  lines.push("");
  lines.push(`KEY TERMS: ${chapter.keyTerms.join(", ")}`);

  lines.push("");
  lines.push(`NCERT EXERCISE: ${chapter.ncertExerciseCount} questions`);
  lines.push(`IN-TEXT ACTIVITIES: ${chapter.inTextActivities}`);

  return lines.join("\n");
}

// ─────────────────────────────────────────
// GET SYLLABUS METADATA
// Returns board, academic year, textbook name
// ─────────────────────────────────────────
function getSyllabusMetadata(classNum, subject) {
  const syllabus = loadSyllabus(classNum, subject);
  if (!syllabus) return null;

  return {
    board: syllabus.board,
    academicYear: syllabus.academicYear,
    textbook: syllabus.textbook,
    totalChapters: syllabus.totalChapters,
  };
}

// ─────────────────────────────────────────
// HAS SYLLABUS
// Returns true if a config file exists for this class+subject
// ─────────────────────────────────────────
function hasSyllabus(classNum, subject) {
  return loadSyllabus(classNum, subject) !== null;
}

module.exports = {
  getChapterData,
  getChapterTitle,
  isValidChapter,
  listChapters,
  buildSyllabusContext,
  getSyllabusMetadata,
  hasSyllabus,
};
