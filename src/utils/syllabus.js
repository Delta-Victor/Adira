const fs = require("fs");
const path = require("path");

const SYLLABI_DIR = path.join(__dirname, "../data/syllabi");

const VALID_DIFFICULTIES = ["beginner", "intermediate", "advanced"];

// ─────────────────────────────────────────
// INTERNAL: NORMALIZE TOPICS TO ARRAY FORMAT
// Handles both:
//   Array format: topics: [{ id, title, category, difficultyLevels: {...} }]
//   Object format: topics: { topicId: { title, category, beginner, intermediate, advanced } }
// ─────────────────────────────────────────
function normalizeSubject(data) {
  if (!data || Array.isArray(data.topics)) return data;
  return {
    ...data,
    topics: Object.entries(data.topics).map(([id, topic]) => ({
      id,
      title: topic.title,
      category: topic.category,
      difficultyLevels: {
        beginner: topic.beginner,
        intermediate: topic.intermediate,
        advanced: topic.advanced,
      },
    })),
  };
}

// ─────────────────────────────────────────
// INTERNAL: LOAD SUBJECT TOPICS FILE
// Returns parsed JSON or null
// ─────────────────────────────────────────
function loadSubject(subject) {
  const subjectKey = subject.toLowerCase().trim().replace(/\s+/g, "-");
  const filepath = path.join(SYLLABI_DIR, subjectKey, "topics.json");
  try {
    const raw = JSON.parse(fs.readFileSync(filepath, "utf8"));
    return normalizeSubject(raw);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────
// LOAD TOPIC
// Returns full topic data merged with difficulty-level data
// ─────────────────────────────────────────
function loadTopic(subject, topicId, difficulty = "intermediate") {
  const data = loadSubject(subject);
  if (!data) throw new Error(`No syllabus found for subject: ${subject}`);

  const topic = data.topics.find(t => t.id === topicId);
  if (!topic) throw new Error(`Topic "${topicId}" not found in ${subject}`);

  const level = data.difficultyLevels
    ? data.difficultyLevels[difficulty]
    : topic.difficultyLevels?.[difficulty];

  const levelData = topic.difficultyLevels?.[difficulty];
  if (!levelData) throw new Error(`Difficulty "${difficulty}" not available for topic "${topicId}"`);

  return {
    id: topic.id,
    title: topic.title,
    category: topic.category,
    subject: data.subject,
    difficulty,
    ...levelData,
  };
}

// ─────────────────────────────────────────
// GET TOPICS LIST
// Returns [{id, title, category}] for a subject
// ─────────────────────────────────────────
function getTopicsList(subject) {
  const data = loadSubject(subject);
  if (!data) return null;
  return data.topics.map(({ id, title, category }) => ({ id, title, category }));
}

// ─────────────────────────────────────────
// HAS SUBJECT
// Returns true if a topics.json exists for this subject
// ─────────────────────────────────────────
function hasSubject(subject) {
  return loadSubject(subject) !== null;
}

// ─────────────────────────────────────────
// IS VALID TOPIC
// ─────────────────────────────────────────
function isValidTopic(subject, topicId) {
  const data = loadSubject(subject);
  if (!data) return false;
  return data.topics.some(t => t.id === topicId);
}

// ─────────────────────────────────────────
// IS VALID DIFFICULTY
// ─────────────────────────────────────────
function isValidDifficulty(difficulty) {
  return VALID_DIFFICULTIES.includes(difficulty?.toLowerCase());
}

// ─────────────────────────────────────────
// BUILD SYLLABUS CONTEXT
// Returns a formatted string for injection into Claude prompts
// ─────────────────────────────────────────
function buildSyllabusContext(subject, topicId, difficulty) {
  let topic;
  try {
    topic = loadTopic(subject, topicId, difficulty);
  } catch (err) {
    return `No syllabus config found for ${subject} / ${topicId} / ${difficulty}. Use general pedagogical knowledge.`;
  }

  const lines = [
    `TOPIC: ${topic.title}`,
    `SUBJECT: ${topic.subject}`,
    `CATEGORY: ${topic.category}`,
    `DIFFICULTY LEVEL: ${difficulty.toUpperCase()}`,
    "",
    "LEARNING OUTCOMES:",
    ...topic.learningOutcomes.map((lo, i) => `${i + 1}. ${lo}`),
    "",
    `KEY TERMS TO ASSESS:`,
    topic.keyTerms.join(", "),
    "",
    "REAL-LIFE CONTEXTS TO USE:",
    ...topic.realLifeContexts.map((ctx, i) => `${i + 1}. ${ctx}`),
    "",
    "PREREQUISITES:",
    topic.prerequisites.join(", "),
    "",
    "COMMON MISCONCEPTIONS TO ADDRESS:",
    ...topic.commonMisconceptions.map((m, i) => `${i + 1}. ${m}`),
    "",
    `QUESTION COMPLEXITY LEVEL: ${topic.questionComplexity}`,
  ];

  return lines.join("\n");
}

// ─────────────────────────────────────────
// GET AVAILABLE SUBJECTS
// Returns list of subject names from folder names
// ─────────────────────────────────────────
function getAvailableSubjects() {
  try {
    return fs.readdirSync(SYLLABI_DIR)
      .filter(f => fs.statSync(path.join(SYLLABI_DIR, f)).isDirectory())
      .filter(f => fs.existsSync(path.join(SYLLABI_DIR, f, "topics.json")));
  } catch {
    return [];
  }
}

module.exports = {
  loadTopic,
  getTopicsList,
  hasSubject,
  isValidTopic,
  isValidDifficulty,
  buildSyllabusContext,
  getAvailableSubjects,
};
