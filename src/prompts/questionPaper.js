const Anthropic = require("@anthropic-ai/sdk");
const { getSecrets } = require("../utils/secrets");
const { buildSyllabusContext } = require("../utils/syllabus");
require("dotenv").config();

async function generateQuestionPaper(intent) {
  const secrets = await getSecrets();
  const anthropic = new Anthropic({
    apiKey: secrets.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  });

  const {
    subject,
    topicId,
    difficulty,
    totalMarks = 40,
    duration = 60,
    mcqCount = 10,
    shortAnswerCount = 5,
    longAnswerCount = 2,
  } = intent;

  const syllabusContext = buildSyllabusContext(subject, topicId, difficulty);
  console.log(`📋 Generating question paper: ${subject} / ${topicId} / ${difficulty}`);

  const prompt = `Generate a ${difficulty} level question paper based on the following curriculum context:

${syllabusContext}

EXAM STRUCTURE:
- Total marks: ${totalMarks}
- Duration: ${duration} minutes
- Section A: ${mcqCount} MCQ questions (1 mark each) = ${mcqCount} marks
- Section B: ${shortAnswerCount} short answer questions (2 marks each) = ${shortAnswerCount * 2} marks
- Section C: ${longAnswerCount} long answer questions (5 marks each) = ${longAnswerCount * 5} marks
- Difficulty distribution: 30% recall, 50% application, 20% analysis and evaluation

QUESTION PAPER REQUIREMENTS:

**Section A: Multiple Choice Questions**
- Each question has exactly 4 options labelled (A) (B) (C) (D)
- Options must be plausible — avoid obviously wrong distractors
- At least 2 questions must use real-life contexts from the list above
- At least 1 question must target a common misconception from the list above

**Section B: Short Answer Questions**
- Each question requires a focused answer of 3–5 sentences or a calculation
- At least 2 questions must require application to unfamiliar contexts
- Questions must progress in difficulty across the section

**Section C: Long Answer Questions**
- Each question requires extended reasoning, multi-step working, or diagram analysis
- At least 1 question must include an internal choice (OR alternative)
- Questions must assess the higher-order learning outcomes from the context

**Marking Scheme (Teacher's Reference)**
- Section A: correct letter for each MCQ
- Section B: key marking points with mark allocation (e.g. 1 mark per point)
- Section C: full model answer with mark allocation per step or point

CRITICAL REQUIREMENTS:
- Do NOT reference any specific textbook, curriculum name, or country
- Do NOT mention grade levels, class numbers, or year groups
- All questions must be unambiguous and have exactly one defensible correct answer
- Difficulty must genuinely match the ${difficulty} level described in the context
- No two questions may test the same concept in the same way

OUTPUT FORMAT:
Return valid HTML suitable for DOCX conversion using this exact structure:

<div class="question-paper">
  <h1>Question Paper: [Topic Title]</h1>
  <p class="metadata">Subject: [Subject] | Difficulty: [Level] | Total Marks: ${totalMarks} | Time: ${duration} minutes</p>

  <div class="instructions">
    <h2>General Instructions</h2>
    <ol>
      <li>All questions are compulsory unless an internal choice is indicated.</li>
      <li>Write clearly and show all working for calculation questions.</li>
      <li>Marks for each question are shown in brackets.</li>
    </ol>
  </div>

  <div class="section">
    <h2>Section A: Multiple Choice Questions</h2>
    <p class="instructions">Choose the correct answer. (1 mark each)</p>
    <!-- ${mcqCount} MCQ questions -->
  </div>

  <div class="section">
    <h2>Section B: Short Answer Questions</h2>
    <p class="instructions">Answer each question concisely. (2 marks each)</p>
    <!-- ${shortAnswerCount} short answer questions -->
  </div>

  <div class="section">
    <h2>Section C: Long Answer Questions</h2>
    <p class="instructions">Answer each question in full, showing all reasoning. (5 marks each)</p>
    <!-- ${longAnswerCount} long answer questions, at least 1 with internal choice -->
  </div>

  <div class="marking-scheme">
    <h2>Marking Scheme (Teacher Reference Only)</h2>
    <!-- Section A answers, Section B and C key points with mark allocation -->
  </div>
</div>`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20251001",
    max_tokens: 5000,
    messages: [{ role: "user", content: prompt }],
  });

  console.log("✅ Question paper generated");
  return response.content[0].text;
}

module.exports = { generateQuestionPaper };
