const Anthropic = require("@anthropic-ai/sdk");
const { getSecrets } = require("../utils/secrets");
const { searchNCERT, buildContext } = require("../utils/qdrant");
require("dotenv").config();

async function generateQuestionPaper(intent) {
  const secrets = await getSecrets();
  const anthropic = new Anthropic({
    apiKey: secrets.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  });

  // Step 1 — Search NCERT knowledge base
  console.log("🔍 Searching NCERT content for question paper...");
  const searchResults = await searchNCERT(
    `exam questions ${intent.subject} chapter ${intent.chapter}`,
    intent.class,
    intent.subject,
    intent.chapter
  );
  const ncertContext = buildContext(searchResults);

  // CBSE official exam pattern for Classes 6-10
  const examPattern = {
    totalMarks: intent.totalMarks || 40,
    duration: intent.duration || 90,
    sections: {
      A: { type: "MCQ", marks: 1, count: 10, total: 10 },
      B: { type: "Very Short Answer", marks: 2, count: 5, total: 10 },
      C: { type: "Short Answer", marks: 3, count: 5, total: 15 },
      D: { type: "Case Based", marks: 4, count: 1, total: 4 },
      E: { type: "Long Answer", marks: 5, count: 1, total: 5 },
    }
  };

  // Step 2 — Build official CBSE exam format prompt
  const prompt = `
You are a senior CBSE question paper setter with 20 years of experience.
You create official exam papers that strictly follow CBSE guidelines.

NCERT CONTENT FOR THIS CHAPTER:
${ncertContext}

STRICT RULES:
1. Use ONLY concepts from the NCERT content provided above
2. Follow the OFFICIAL CBSE exam pattern exactly
3. Questions must have proper internal choice where specified
4. Difficulty: 30% Easy, 50% Medium, 20% Hard
5. No question should be repeated or too similar
6. All diagrams must be described clearly in words
7. Include marking scheme at the end
8. Language must be formal examination style

OFFICIAL CBSE EXAM PATTERN:
Total Marks: ${examPattern.totalMarks}
Time Allowed: ${examPattern.duration} minutes
Subject: ${intent.subject} | Class: ${intent.class}

Create the complete question paper in this EXACT format:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[SCHOOL NAME]
CLASS ${intent.class} — ${intent.subject.toUpperCase()} EXAMINATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Time Allowed: ${examPattern.duration} Minutes        Maximum Marks: ${examPattern.totalMarks}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GENERAL INSTRUCTIONS:
1. All questions are compulsory unless internal choice is given.
2. Marks for each question are indicated against it.
3. Write neat and clean answers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION A
(Multiple Choice Questions)
Each question carries 1 mark.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Generate 10 MCQ questions]
Format:
Q1. Question text?                                    (1)
    (a) Option 1   (b) Option 2   (c) Option 3   (d) Option 4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION B
(Very Short Answer Questions)
Each question carries 2 marks.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Generate 5 very short answer questions]
Format:
Q11. Question? (Answer in 1-2 sentences)              (2)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION C
(Short Answer Questions)
Each question carries 3 marks.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Generate 5 short answer questions with internal choice]
Format:
Q16. Question? (Answer in 3-4 sentences)              (3)
                        OR
     Alternative question of same difficulty?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION D
(Case Based Question)
Carries 4 marks.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Generate 1 case study with 4 sub-questions of 1 mark each]
Format:
Q21. Read the following passage carefully and answer 
     the questions that follow:

[Write a 4-5 line real-life scenario related to the chapter]

(i)   Sub question 1?                                 (1)
(ii)  Sub question 2?                                 (1)
(iii) Sub question 3?                                 (1)
(iv)  Sub question 4?                                 (1)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION E
(Long Answer Question)
Carries 5 marks.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Generate 1 long answer question with internal choice]
Format:
Q22. Detailed question requiring comprehensive answer?  (5)
                        OR
     Alternative comprehensive question?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MARKING SCHEME (For Teacher's Reference Only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION A:
Q1-[answer] Q2-[answer] Q3-[answer] Q4-[answer] Q5-[answer]
Q6-[answer] Q7-[answer] Q8-[answer] Q9-[answer] Q10-[answer]

SECTION B:
Q11. [2 mark answer with key points]
Q12. [2 mark answer with key points]
Q13. [2 mark answer with key points]
Q14. [2 mark answer with key points]
Q15. [2 mark answer with key points]

SECTION C:
Q16. [3 mark answer — mention 3 key points @ 1 mark each]
[Continue for Q17-Q20]

SECTION D:
Q21. (i)[ans] (ii)[ans] (iii)[ans] (iv)[ans]

SECTION E:
Q22. [5 mark answer — mention 5 key points @ 1 mark each]
`;

  // Step 3 — Call Claude API
  console.log("🤖 Generating question paper with Claude...");
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 5000,
    messages: [{ role: "user", content: prompt }]
  });

  console.log("✅ Question paper generated successfully");
  return response.content[0].text;
}

module.exports = { generateQuestionPaper };