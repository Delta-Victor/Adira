const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { sendMessage, sendButtons } = require("../utils/whatsapp");
const { checkSubscription, getBlockMessage, getPlanStatus, sendUpgradeMessage } = require("../utils/payments");
const { hasSyllabus, isValidChapter, listChapters } = require("../utils/syllabus");
require("dotenv").config();

const sqs = new SQSClient({ region: process.env.AWS_REGION || "ap-south-1" });
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" });

// ─────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────
async function handler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod;

  // WhatsApp Verification
  if (method === "GET") {
    const params = event.queryStringParameters || {};
    if (params["hub.verify_token"] === process.env.VERIFY_TOKEN) {
      console.log("✅ WhatsApp webhook verified");
      return { statusCode: 200, body: params["hub.challenge"] };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  // Incoming Message
  if (method === "POST") {
    try {
      const body = JSON.parse(event.body);
      const entry = body?.entry?.[0]?.changes?.[0]?.value;
      if (!entry?.messages) {
        return { statusCode: 200, body: "ok" };
      }

      const message = entry.messages[0];
      const teacherPhone = message.from;
      const messageText = message.text?.body || "";
      const messageId = message.id;

      console.log(`📱 Message from ${teacherPhone}: ${messageText}`);

      // Get or create teacher record
      const teacher = await getTeacher(teacherPhone);

      // New teacher — register and welcome
      if (!teacher) {
        await registerTeacher(teacherPhone);
        await sendMessage(teacherPhone, getWelcomeMessage());
        return { statusCode: 200, body: "ok" };
      }

      // Parse intent
      const intent = parseIntent(messageText);

      // ── Handle special intents first ──

      // Check plan status
      if (intent.task === "check_plan") {
        const status = await getPlanStatus(teacher);
        await sendMessage(teacherPhone, status);
        return { statusCode: 200, body: "ok" };
      }

      // Upgrade request
      if (intent.task === "upgrade") {
        await sendUpgradeMessage(teacherPhone, intent.plan);
        return { statusCode: 200, body: "ok" };
      }

      // Payment confirmation
      if (intent.task === "payment_done") {
        await sendMessage(
          teacherPhone,
          `✅ *Payment Received!*\n\nThank you! We are verifying your payment.\nYour plan will be activated within *5 minutes*. ⏳\n\nWe'll send you a confirmation shortly.`
        );
        console.log(`💰 Payment confirmation from ${teacherPhone}: ${messageText}`);
        return { statusCode: 200, body: "ok" };
      }

      // Logo upload request
      if (intent.task === "add_logo") {
        const plan = teacher?.plan?.S || "trial";
        if (plan !== "pro") {
          await sendMessage(
            teacherPhone,
            `🏫 *School Letterhead*\n\nThis feature is available on *Pro Plan (₹399/month)* only.\n\nReply *"upgrade pro"* to unlock it!`
          );
        } else {
          await sendMessage(
            teacherPhone,
            `🏫 *Add Your School Logo*\n\nPlease send:\n1️⃣ Your school logo image (PNG or JPG)\n2️⃣ Full school name\n3️⃣ School address (optional)\n\nI'll add it to all your future documents! ✅`
          );
        }
        return { statusCode: 200, body: "ok" };
      }

      // Word file request
      if (intent.task === "send_docx") {
        const plan = teacher?.plan?.S || "trial";
        if (plan === "trial") {
          await sendMessage(
            teacherPhone,
            `📄 *Word Format*\n\nWord (.docx) files are available on *Basic Plan (₹199/month)*.\n\nReply *"upgrade basic"* to unlock!`
          );
        } else {
          await sendMessage(
            teacherPhone,
            `📄 Word format will be included with your next generation.\n\nWhat would you like to create?\nExample: _"worksheet class 7 science chapter 3"_`
          );
        }
        return { statusCode: 200, body: "ok" };
      }

      // ── Check subscription before processing ──
      const subCheck = await checkSubscription(teacher);
      if (!subCheck.allowed) {
        const blockMsg = getBlockMessage(subCheck.reason, subCheck.plan);
        await sendMessage(teacherPhone, blockMsg);
        return { statusCode: 200, body: "ok" };
      }

      // ── Handle unclear messages ──
      if (!intent.isValid) {
  await sendMessage(
    teacherPhone,
    `Hi! 👋 What would you like me to create?\n\nSend a message like:\n_"lesson plan class 7 science chapter 3"_\n_"worksheet class 5 maths chapter 2"_\n_"question paper class 8 science chapter 1"_`
  );
  return { statusCode: 200, body: "ok" };
}

      // ── Syllabus guard: validate chapter exists in config ──
      // Only blocks if we have a config for this class+subject.
      // Unknown class/subject combos pass through so Claude handles them.
      if (intent.chapter && hasSyllabus(intent.class, intent.subject)) {
        if (!isValidChapter(intent.class, intent.subject, intent.chapter)) {
          const chapters = listChapters(intent.class, intent.subject);
          const maxCh = chapters[chapters.length - 1].number;
          await sendMessage(
            teacherPhone,
            `❌ *Chapter ${intent.chapter} not found*\n\nClass ${intent.class} ${intent.subject} has chapters *1–${maxCh}*.\n\nWhich chapter would you like?\nExample: _"${intent.task.toLowerCase()} class ${intent.class} ${intent.subject.toLowerCase()} chapter 5"_`
          );
          return { statusCode: 200, body: "ok" };
        }
      }

      // ── Send processing message ──
      await sendMessage(
        teacherPhone,
        `⏳ *Got it!* Creating your ${intent.task}...\n\n📚 Class ${intent.class} | ${intent.subject} | Chapter ${intent.chapter}\n\n_Ready in ~30 seconds. Please wait..._`
      );

      // ── Push to SQS ──
      await sqs.send(new SendMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        MessageBody: JSON.stringify({
          teacherPhone,
          messageText,
          messageId,
          intent,
          teacherPlan: teacher?.plan?.S || "trial",
          timestamp: new Date().toISOString()
        })
      }));

      console.log(`✅ Job queued for ${teacherPhone}`);
      return { statusCode: 200, body: "ok" };

    } catch (error) {
      console.error("❌ Webhook error:", error.message);
      return { statusCode: 200, body: "ok" };
    }
  }
}

// ─────────────────────────────────────────
// WELCOME MESSAGE
// ─────────────────────────────────────────
function getWelcomeMessage() {
  return `🎓 *Welcome to Adira!*
_AI Powered Teacher's Assistant_

I can create CBSE-aligned documents in seconds!

*What I can create:*
📝 Lesson Plans
📋 Worksheets
📄 Question Papers

*How to use:*
Just send a message like:
_"lesson plan class 7 science chapter 3"_
_"worksheet class 5 maths chapter 2 20 questions"_
_"question paper class 8 science chapter 1"_

*Your Free Trial:*
✅ 5 free generations
⏰ Valid for 3 days

What would you like to create today? 😊`;
}

// ─────────────────────────────────────────
// PARSE INTENT
// ─────────────────────────────────────────
function parseIntent(text) {
  const lower = text.toLowerCase().trim();

  // Special intents
  if (/upgrade\s*basic|buy\s*basic|basic\s*plan/.test(lower))
    return { task: "upgrade", plan: "basic", isValid: true };

  if (/upgrade\s*pro|buy\s*pro|pro\s*plan|unlimited/.test(lower))
    return { task: "upgrade", plan: "pro", isValid: true };

  if (/payment\s*done|paid|payment\s*complete|transferred/.test(lower))
    return { task: "payment_done", isValid: true };

  if (/my\s*plan|check\s*plan|how\s*many|remaining|balance/.test(lower))
    return { task: "check_plan", isValid: true };

  if (/school\s*logo|add\s*logo|letterhead/.test(lower))
    return { task: "add_logo", isValid: true };

  if (/word\s*file|send\s*word|\.docx/.test(lower))
    return { task: "send_docx", isValid: true };

  // Document generation intents
  let task = null;
  if (/lesson\s*plan|lp\b/.test(lower)) task = "Lesson Plan";
  else if (/worksheet|ws\b|exercise/.test(lower)) task = "Worksheet";
  else if (/question\s*paper|qp\b|test\s*paper|exam|\btest\b/.test(lower)) task = "Question Paper";

  // Extract class
  const classMatch = lower.match(/(?:class|cls|std|grade|कक्षा)\s*(\d+)/);
  const classNum = classMatch ? classMatch[1] : null;

  // Extract subject
  const subjects = {
    "science": "Science", "maths": "Maths", "math": "Maths",
    "english": "English", "hindi": "Hindi", "sst": "Social Science",
    "social science": "Social Science", "history": "Social Science",
    "geography": "Social Science", "sanskrit": "Sanskrit",
    "physics": "Physics", "chemistry": "Chemistry",
    "biology": "Biology", "economics": "Economics",
    "accountancy": "Accountancy", "business": "Business Studies"
  };
  let subject = null;
  for (const [key, value] of Object.entries(subjects)) {
    if (lower.includes(key)) { subject = value; break; }
  }

  // Extract chapter
  const chapterMatch = lower.match(/(?:chapter|ch|chap)\s*(\d+)/);
  const chapter = chapterMatch ? chapterMatch[1] : null;

  // Extract question count
  const questionMatch = lower.match(/(\d+)\s*(?:questions?|ques|q\'s)/);
  const questionCount = questionMatch ? parseInt(questionMatch[1]) : 15;

  return {
    task,
    class: classNum,
    subject,
    chapter,
    questionCount,
    duration: 40,
    totalMarks: 40,
    isValid: !!(task && classNum && subject)
  };
}

// ─────────────────────────────────────────
// GET TEACHER FROM DATABASE
// ─────────────────────────────────────────
async function getTeacher(phone) {
  try {
    const result = await dynamo.send(new GetItemCommand({
      TableName: process.env.DYNAMODB_TABLE || "adira-teachers",
      Key: { phone: { S: phone } }
    }));
    return result.Item || null;
  } catch (error) {
    console.error("❌ Get teacher error:", error.message);
    return null;
  }
}

// ─────────────────────────────────────────
// REGISTER NEW TEACHER
// ─────────────────────────────────────────
async function registerTeacher(phone) {
  try {
    await dynamo.send(new PutItemCommand({
      TableName: process.env.DYNAMODB_TABLE || "adira-teachers",
      Item: {
        phone:                  { S: phone },
        plan:                   { S: "trial" },
        generationsThisMonth:   { N: "0" },
        joinedDate:             { S: new Date().toISOString() },
        lastActive:             { S: new Date().toISOString() }
      }
    }));
    console.log(`✅ New teacher registered: ${phone}`);
  } catch (error) {
    console.error("❌ Registration error:", error.message);
  }
}

module.exports = { handler, parseIntent };