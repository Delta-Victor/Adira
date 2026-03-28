const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { sendMessage, sendButtons } = require("../utils/whatsapp");
require("dotenv").config();

const sqs = new SQSClient({ region: process.env.AWS_REGION || "ap-south-1" });
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" });

// ─────────────────────────────────────────
// MAIN HANDLER — Entry point for all
// incoming WhatsApp messages
// ─────────────────────────────────────────
async function handler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod;

  // ── WhatsApp Verification Handshake ──
  // Meta sends a GET request to verify our webhook URL
  // We must respond with the challenge token
  if (method === "GET") {
    const params = event.queryStringParameters || {};
    if (params["hub.verify_token"] === process.env.VERIFY_TOKEN) {
      console.log("✅ WhatsApp webhook verified successfully");
      return {
        statusCode: 200,
        body: params["hub.challenge"]
      };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  // ── Incoming Message Handler ──
  if (method === "POST") {
    try {
      const body = JSON.parse(event.body);

      // Ignore non-message events
      // (WhatsApp sends status updates too — we skip those)
      const entry = body?.entry?.[0]?.changes?.[0]?.value;
      if (!entry?.messages) {
        return { statusCode: 200, body: "ok" };
      }

      const message = entry.messages[0];
      const teacherPhone = message.from;
      const messageText = message.text?.body || "";
      const messageId = message.id;

      console.log(`📱 Message from ${teacherPhone}: ${messageText}`);

      // ── Step 1: Check if teacher exists in database ──
      const isNewTeacher = await checkNewTeacher(teacherPhone);

      // ── Step 2: Handle new teacher onboarding ──
      if (isNewTeacher) {
        await registerTeacher(teacherPhone);
        await sendMessage(
          teacherPhone,
          `🎓 *Welcome to Adira!*\n\nI am your AI-powered teaching assistant. I can create CBSE-aligned documents for you in seconds!\n\n*What I can create:*\n📝 Lesson Plans\n📋 Worksheets\n📄 Question Papers\n\n*How to use me:*\nJust send a message like:\n\n_"lesson plan class 7 science chapter 3"_\n_"worksheet class 5 maths chapter 2 20 questions"_\n_"question paper class 8 science chapter 1"_\n\nWhat would you like me to create today? 😊`
        );
        return { statusCode: 200, body: "ok" };
      }

      // ── Step 3: Parse what teacher wants ──
      const intent = parseIntent(messageText);

      // ── Step 4: Handle unclear messages ──
      if (!intent.isValid) {
        await sendButtons(
          teacherPhone,
          `Hi! 👋 I didn't quite understand that.\n\nWhat would you like me to create?`,
          ["Lesson Plan", "Worksheet", "Question Paper"]
        );
        return { statusCode: 200, body: "ok" };
      }

      // ── Step 5: Tell teacher we're working on it ──
      await sendMessage(
        teacherPhone,
        `⏳ *Got it!* Creating your ${intent.task}...\n\n📚 Class ${intent.class} | ${intent.subject} | Chapter ${intent.chapter}\n\n_This takes about 30 seconds. Please wait..._`
      );

      // ── Step 6: Push job to SQS queue ──
      // The processor Lambda will pick this up and do the heavy work
      await sqs.send(new SendMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        MessageBody: JSON.stringify({
          teacherPhone,
          messageText,
          messageId,
          intent,
          timestamp: new Date().toISOString()
        })
      }));

      console.log(`✅ Job queued for ${teacherPhone}`);
      return { statusCode: 200, body: "ok" };

    } catch (error) {
      console.error("❌ Webhook error:", error.message);
      return { statusCode: 200, body: "ok" };
      // Always return 200 to WhatsApp
      // Otherwise Meta will retry the message repeatedly
    }
  }
}

// ─────────────────────────────────────────
// CHECK IF TEACHER IS NEW
// ─────────────────────────────────────────
async function checkNewTeacher(phone) {
  try {
    const result = await dynamo.send(new GetItemCommand({
      TableName: process.env.DYNAMODB_TABLE || "adira-teachers",
      Key: { phone: { S: phone } }
    }));
    return !result.Item; // Returns true if teacher NOT found
  } catch (error) {
    console.error("❌ DynamoDB check error:", error.message);
    return false;
  }
}

// ─────────────────────────────────────────
// REGISTER NEW TEACHER IN DATABASE
// ─────────────────────────────────────────
async function registerTeacher(phone) {
  try {
    await dynamo.send(new PutItemCommand({
      TableName: process.env.DYNAMODB_TABLE || "adira-teachers",
      Item: {
        phone: { S: phone },
        plan: { S: "free" },
        generationsThisMonth: { N: "0" },
        joinedDate: { S: new Date().toISOString() },
        lastActive: { S: new Date().toISOString() }
      }
    }));
    console.log(`✅ New teacher registered: ${phone}`);
  } catch (error) {
    console.error("❌ Teacher registration error:", error.message);
  }
}

// ─────────────────────────────────────────
// PARSE TEACHER'S MESSAGE
// Figures out what the teacher wants
// ─────────────────────────────────────────
function parseIntent(text) {
  const lower = text.toLowerCase().trim();

  // Detect task type
  let task = null;
  if (/lesson\s*plan|lp\b/.test(lower)) task = "Lesson Plan";
  else if (/worksheet|ws\b|exercise/.test(lower)) task = "Worksheet";
  else if (/question\s*paper|qp\b|test\s*paper|exam|\btest\b/.test(lower)) task = "Question Paper";

  // Extract class number
  const classMatch = lower.match(/(?:class|cls|std|grade|कक्षा)\s*(\d+)/);
  const classNum = classMatch ? classMatch[1] : null;

  // Extract subject
  const subjects = {
    "science": "Science",
    "maths": "Maths", "math": "Maths",
    "english": "English",
    "hindi": "Hindi",
    "sst": "Social Science",
    "social science": "Social Science",
    "history": "Social Science",
    "geography": "Social Science",
    "sanskrit": "Sanskrit"
  };
  let subject = null;
  for (const [key, value] of Object.entries(subjects)) {
    if (lower.includes(key)) { subject = value; break; }
  }

  // Extract chapter number
  const chapterMatch = lower.match(/(?:chapter|ch|chap)\s*(\d+)/);
  const chapter = chapterMatch ? chapterMatch[1] : null;

  // Extract question count (for worksheets)
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

module.exports = { handler, parseIntent };