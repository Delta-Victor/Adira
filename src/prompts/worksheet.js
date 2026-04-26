const Anthropic = require("@anthropic-ai/sdk");
const { getSecrets } = require("../utils/secrets");
const { buildSyllabusContext } = require("../utils/syllabus");
require("dotenv").config();

async function generateWorksheet(intent) {
  const secrets = await getSecrets();
  const anthropic = new Anthropic({
    apiKey: secrets.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  });

  const { subject, topicId, difficulty } = intent;
  const syllabusContext = buildSyllabusContext(subject, topicId, difficulty);
  console.log(`📋 Generating worksheet: ${subject} / ${topicId} / ${difficulty}`);

  const prompt = `Generate a ${difficulty} level worksheet based on the following curriculum context:

${syllabusContext}

WORKSHEET STRUCTURE:

**Section A: Multiple Choice Questions (5 questions, 1 mark each)**
- Test conceptual understanding
- Mix of recall and application questions
- Include 1 scenario-based MCQ using a real-life context from the list above

**Section B: Short Answer Questions (5 questions, 2-3 marks each)**
- Application of concepts to new situations
- Use at least 2 real-life contexts from the list above
- Address at least 1 common misconception listed above

**Section C: Long Answer Questions (3 questions, 5 marks each)**
- 1 question requiring a diagram, table, or flowchart
- 1 scenario-based problem requiring multi-step reasoning
- 1 analysis or evaluation question

**Section D: Hands-On Activity (1 activity)**
- Safe and classroom-friendly
- Directly tied to one of the learning outcomes
- Includes a materials list and clear step-by-step procedure

**Answer Key and Marking Scheme**
- Step-by-step solutions for all questions
- Mark allocation breakdown per question
- Brief explanation that addresses the common misconception(s) from the context above

CRITICAL REQUIREMENTS:
- Do NOT reference any specific textbook, curriculum name, or country
- Do NOT mention grade levels, class numbers, or year groups
- Focus on conceptual understanding, not rote memorisation
- All content must match the ${difficulty} difficulty level described above
- All content must be scientifically or mathematically accurate
- Use inclusive, globally-relevant examples from the real-life contexts provided

OUTPUT FORMAT:
Return valid HTML suitable for DOCX conversion using this exact structure:

<div class="worksheet">
  <h1>Worksheet: [Topic Title]</h1>
  <p class="metadata">Subject: [Subject] | Difficulty: [Level] | Total Marks: [X]</p>
  <p class="metadata">Focus: [One sentence describing what this worksheet assesses]</p>

  <div class="section">
    <h2>Section A: Multiple Choice Questions</h2>
    <p class="instructions">Choose the correct answer. (1 mark each)</p>
    <!-- 5 MCQ questions, each with 4 options labelled A B C D -->
  </div>

  <div class="section">
    <h2>Section B: Short Answer Questions</h2>
    <p class="instructions">Answer each question in 2–4 sentences.</p>
    <!-- 5 short answer questions -->
  </div>

  <div class="section">
    <h2>Section C: Long Answer Questions</h2>
    <p class="instructions">Answer each question in full. Show all working where required.</p>
    <!-- 3 long answer questions -->
  </div>

  <div class="section">
    <h2>Section D: Hands-On Activity</h2>
    <!-- Activity title, objective, materials list, procedure -->
  </div>

  <div class="answer-key">
    <h2>Answer Key and Marking Scheme</h2>
    <!-- Section A: letter answers, Section B-C: key points with mark allocation -->
  </div>
</div>`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20251001",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  console.log("✅ Worksheet generated");
  return response.content[0].text;
}

module.exports = { generateWorksheet };
