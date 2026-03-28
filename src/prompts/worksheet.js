const Anthropic = require("@anthropic-ai/sdk");
const { getSecrets } = require("../utils/secrets");
const { searchNCERT, buildContext } = require("../utils/qdrant");
require("dotenv").config();

async function generateWorksheet(intent) {
  const secrets = await getSecrets();
  const anthropic = new Anthropic({
    apiKey: secrets.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  });

  // Step 1 — Search NCERT knowledge base
  console.log("🔍 Searching NCERT content for worksheet...");
  const searchResults = await searchNCERT(
    `worksheet questions ${intent.subject} chapter ${intent.chapter}`,
    intent.class,
    intent.subject,
    intent.chapter
  );
  const ncertContext = buildContext(searchResults);

  // Calculate question distribution based on Bloom's Taxonomy
  // CBSE requires a mix of difficulty levels
  const totalQuestions = intent.questionCount || 15;
  const distribution = {
    mcq: Math.round(totalQuestions * 0.20),           // 20% MCQ
    fillBlanks: Math.round(totalQuestions * 0.20),    // 20% Fill in blanks
    shortAnswer: Math.round(totalQuestions * 0.30),   // 30% Short answer
    longAnswer: Math.round(totalQuestions * 0.15),    // 15% Long answer
    application: Math.round(totalQuestions * 0.15),   // 15% Application
  };

  // Step 2 — Build CBSE aligned prompt
  const prompt = `
You are an expert CBSE curriculum teacher with 20 years of experience.
You create worksheets that perfectly match NCERT content and CBSE standards.

NCERT CONTENT FOR THIS CHAPTER:
${ncertContext}

STRICT RULES:
1. Use ONLY concepts from the NCERT content provided above
2. Follow EXACTLY the question distribution below
3. Questions must cover different Bloom's Taxonomy levels
4. All questions must be from Indian context
5. Language must be age-appropriate for Class ${intent.class}
6. Do NOT repeat similar questions
7. Include answer key at the end

QUESTION DISTRIBUTION (Total: ${totalQuestions} questions):
- Section A: MCQ — ${distribution.mcq} questions (1 mark each)
- Section B: Fill in the Blanks — ${distribution.fillBlanks} questions (1 mark each)
- Section C: Short Answer — ${distribution.shortAnswer} questions (2 marks each)
- Section D: Long Answer — ${distribution.longAnswer} questions (3 marks each)
- Section E: Application Based — ${distribution.application} questions (3 marks each)

Create a complete worksheet in this EXACT format:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKSHEET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Subject: ${intent.subject}
Class: ${intent.class}
Chapter: ${intent.chapter}
Total Marks: [Calculate total]
Time: 45 minutes
Name: _______________ Roll No: ___ Date: ___

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION A — MULTIPLE CHOICE QUESTIONS
(Choose the correct answer)                    [1 mark each]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Generate ${distribution.mcq} MCQ questions with 4 options each]
Format: 
1. Question text?
   a) Option 1    b) Option 2    c) Option 3    d) Option 4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION B — FILL IN THE BLANKS          [1 mark each]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Generate ${distribution.fillBlanks} fill in the blank questions]
Format:
1. __________ is the process by which plants make their own food.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION C — SHORT ANSWER QUESTIONS      [2 marks each]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Generate ${distribution.shortAnswer} short answer questions]
Format:
1. Question? (Answer in 2-3 sentences)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION D — LONG ANSWER QUESTIONS       [3 marks each]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Generate ${distribution.longAnswer} long answer questions]
Format:
1. Question? (Answer in 4-5 sentences)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION E — APPLICATION BASED           [3 marks each]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Generate ${distribution.application} real-life application questions]
Format:
1. Situation-based question that requires applying the concept?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANSWER KEY (For Teacher's Reference)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Section A: 1-[ans] 2-[ans] 3-[ans] ...
Section B: 1-[ans] 2-[ans] 3-[ans] ...
Section C: [Brief answers]
Section D: [Brief answers]
Section E: [Brief answers]
`;

  // Step 3 — Call Claude API
  console.log("🤖 Generating worksheet with Claude...");
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }]
  });

  console.log("✅ Worksheet generated successfully");
  return response.content[0].text;
}

module.exports = { generateWorksheet };