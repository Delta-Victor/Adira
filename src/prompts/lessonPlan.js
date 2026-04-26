const Anthropic = require("@anthropic-ai/sdk");
const { getSecrets } = require("../utils/secrets");
const { buildSyllabusContext } = require("../utils/syllabus");
require("dotenv").config();

async function generateLessonPlan(intent) {
  const secrets = await getSecrets();
  const anthropic = new Anthropic({
    apiKey: secrets.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  });

  const { subject, topicId, difficulty, duration = 60 } = intent;
  const syllabusContext = buildSyllabusContext(subject, topicId, difficulty);
  console.log(`📋 Generating lesson plan: ${subject} / ${topicId} / ${difficulty}`);

  const prompt = `Generate a ${difficulty} level lesson plan based on the following curriculum context:

${syllabusContext}

LESSON PLAN STRUCTURE:

**Overview**
- Topic, subject, difficulty level, duration (${duration} minutes)
- A one-sentence learning intention using this format: "Students will be able to [specific outcome]"
- Success criteria: 3 measurable checkpoints students can self-assess against

**Prior Knowledge Check (5 minutes)**
- 2–3 quick warm-up questions linked to the prerequisites listed above
- How to address gaps if they appear

**Introduction and Hook (10 minutes)**
- An engaging real-life context from the list above to frame the lesson
- A thought-provoking question or brief demonstration to generate curiosity
- How to connect prior knowledge to the new topic

**Main Teaching Sequence (${Math.round(duration * 0.5)} minutes)**
- Break the learning outcomes into 2–3 teaching segments
- For each segment: teacher explanation → worked example → student practice
- Explicitly address the common misconceptions listed in the context
- Include at least one collaborative or discussion activity

**Guided Practice (10 minutes)**
- 3–4 questions progressing from recall → application → analysis
- Suggested differentiation: support scaffold for struggling students, extension task for advanced

**Assessment and Closing (5 minutes)**
- Exit ticket: 1 quick question to gauge understanding of the key learning outcome
- How to use exit ticket data to inform the next lesson

CRITICAL REQUIREMENTS:
- Do NOT reference any specific textbook, curriculum name, or country
- Do NOT mention grade levels, class numbers, or year groups
- All activities must be achievable in a standard classroom
- Timing must add up to exactly ${duration} minutes
- All content must match the ${difficulty} difficulty level described in the context

OUTPUT FORMAT:
Return valid HTML suitable for DOCX conversion using this exact structure:

<div class="lesson-plan">
  <h1>Lesson Plan: [Topic Title]</h1>
  <p class="metadata">Subject: [Subject] | Difficulty: [Level] | Duration: ${duration} minutes</p>

  <div class="section">
    <h2>Overview</h2>
    <!-- Learning intention, success criteria -->
  </div>

  <div class="section">
    <h2>Prior Knowledge Check (5 min)</h2>
    <!-- Warm-up questions and gap-bridging strategy -->
  </div>

  <div class="section">
    <h2>Introduction and Hook (10 min)</h2>
    <!-- Hook activity and connection to prior knowledge -->
  </div>

  <div class="section">
    <h2>Main Teaching Sequence ([X] min)</h2>
    <!-- Numbered teaching segments with explanation, example, and practice -->
  </div>

  <div class="section">
    <h2>Guided Practice (10 min)</h2>
    <!-- Practice questions with differentiation notes -->
  </div>

  <div class="section">
    <h2>Assessment and Closing (5 min)</h2>
    <!-- Exit ticket question and how to use the data -->
  </div>
</div>`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20251001",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  console.log("✅ Lesson plan generated");
  return response.content[0].text;
}

module.exports = { generateLessonPlan };
