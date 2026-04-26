const Anthropic = require("@anthropic-ai/sdk");
const { getSecrets } = require("../utils/secrets");
const { buildSyllabusContext } = require("../utils/syllabus");
require("dotenv").config();

async function generateLessonPlan(intent) {
  const secrets = await getSecrets();
  const anthropic = new Anthropic({
    apiKey: secrets.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  });

  // Step 1 — Load syllabus config for this chapter
  const syllabusContext = buildSyllabusContext(intent.class, intent.subject, intent.chapter);
  console.log(`📋 Syllabus context loaded for Class ${intent.class} ${intent.subject} Ch${intent.chapter}`);

  // Step 2 — Build the prompt with CBSE format + syllabus content
  const prompt = `
You are an expert CBSE curriculum teacher with 20 years of experience.
You create perfect lesson plans that principals approve immediately.

CBSE SYLLABUS CONTENT FOR THIS CHAPTER:
${syllabusContext}

STRICT RULES:
1. Use ONLY the topics and subtopics listed in the syllabus content above
2. Follow EXACTLY the CBSE lesson plan format below
3. Learning objectives must use Bloom's Taxonomy verbs
4. All examples must be from Indian context
5. Language must be simple and appropriate for Class ${intent.class}
6. Duration must be exactly ${intent.duration || 40} minutes

Create a complete CBSE lesson plan in this EXACT format:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LESSON PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Subject: ${intent.subject}
Class: ${intent.class}
Chapter: ${intent.chapter}
Topic: [Main topic from chapter]
Duration: ${intent.duration || 40} minutes
Date: _______________

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEARNING OBJECTIVES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
By the end of this lesson, students will be able to:
1. [Remember level — Define/List/Name]
2. [Understand level — Explain/Describe/Compare]
3. [Apply level — Demonstrate/Solve/Use]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREVIOUS KNOWLEDGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Students already know: [List prerequisites]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEACHING AIDS / TLM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[List all materials needed]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LESSON DEVELOPMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INTRODUCTION (5 minutes)
- Teacher Activity: [What teacher does]
- Student Activity: [What students do]
- Motivation/Hook: [How to grab attention]

MAIN TEACHING (25 minutes)
Teaching Point 1: [First concept]
- Teacher Activity: [Explanation method]
- Student Activity: [Student engagement]
- Blackboard Work: [What to write on board]

Teaching Point 2: [Second concept]
- Teacher Activity: [Explanation method]
- Student Activity: [Student engagement]
- Blackboard Work: [What to write on board]

Teaching Point 3: [Third concept]
- Teacher Activity: [Explanation method]
- Student Activity: [Student engagement]
- Blackboard Work: [What to write on board]

PRACTICE & DISCUSSION (7 minutes)
- Activity: [In-class practice]
- Expected Student Response: [What students should say/do]

SUMMARY (3 minutes)
- Key Points to Recap: [3 main takeaways]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RECAPITULATION QUESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. [Easy question — Remember level]
2. [Medium question — Understand level]
3. [Thinking question — Apply level]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOME ASSIGNMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1-2 NCERT exercise questions with page numbers]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEACHER'S REFLECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Was the objective achieved? _______________
No. of students who understood: ___/___
Re-teaching required: Yes / No
`;

  // Step 3 — Call Claude API (claude-sonnet-4-5 for content generation)
  console.log("🤖 Generating lesson plan with Claude...");
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }]
  });

  console.log("✅ Lesson plan generated successfully");
  return response.content[0].text;
}

module.exports = { generateLessonPlan };