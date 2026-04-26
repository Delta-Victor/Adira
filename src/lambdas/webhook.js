const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { sendMessage, sendButtons, sendList } = require("../utils/whatsapp");
const { checkSubscription, getBlockMessage, getPlanStatus, sendUpgradeMessage } = require("../utils/payments");
const { hasSubject, isValidTopic, isValidDifficulty, getTopicsList, getAvailableSubjects } = require("../utils/syllabus");
require("dotenv").config();

const sqs = new SQSClient({ region: process.env.AWS_REGION || "ap-south-1" });
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" });

// ─────────────────────────────────────────
// CONVERSATION FLOW STEPS
// Each step expects a specific reply type
// ─────────────────────────────────────────
const STEPS = {
  IDLE:        "idle",
  DOC_TYPE:    "awaiting_doc_type",
  SUBJECT:     "awaiting_subject",
  TOPIC:       "awaiting_topic",
  DIFFICULTY:  "awaiting_difficulty",
  CONFIRM:     "awaiting_confirm",
};

const DOC_TYPES = ["Worksheet", "Lesson Plan", "Question Paper"];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];

const DIFFICULTY_LABELS = {
  beginner:     "Beginner",
  intermediate: "Intermediate",
  advanced:     "Advanced",
};

// ─────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────
async function handler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod;

  if (method === "GET") {
    const params = event.queryStringParameters || {};
    if (params["hub.verify_token"] === process.env.VERIFY_TOKEN) {
      console.log("✅ WhatsApp webhook verified");
      return { statusCode: 200, body: params["hub.challenge"] };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  if (method === "POST") {
    try {
      const body = JSON.parse(event.body);
      const entry = body?.entry?.[0]?.changes?.[0]?.value;
      if (!entry?.messages) return { statusCode: 200, body: "ok" };

      const message = entry.messages[0];
      const teacherPhone = message.from;

      // Extract text from plain message or interactive reply
      const messageText = message.text?.body
        || message.interactive?.button_reply?.title
        || message.interactive?.list_reply?.title
        || "";

      // Normalised for matching
      const replyId = message.interactive?.button_reply?.id
        || message.interactive?.list_reply?.id
        || messageText.toLowerCase().trim();

      console.log(`📱 ${teacherPhone}: "${messageText}" (id: ${replyId})`);

      const teacher = await getTeacher(teacherPhone);

      if (!teacher) {
        await registerTeacher(teacherPhone);
        await sendWelcome(teacherPhone);
        return { statusCode: 200, body: "ok" };
      }

      // ── Always-available commands ──
      if (/my\s*plan|check\s*plan|how\s*many|remaining|balance/.test(replyId)) {
        await sendMessage(teacherPhone, await getPlanStatus(teacher));
        return { statusCode: 200, body: "ok" };
      }
      if (/upgrade\s*basic|buy\s*basic|basic\s*plan/.test(replyId)) {
        await sendUpgradeMessage(teacherPhone, "basic");
        return { statusCode: 200, body: "ok" };
      }
      if (/upgrade\s*pro|buy\s*pro|pro\s*plan|unlimited/.test(replyId)) {
        await sendUpgradeMessage(teacherPhone, "pro");
        return { statusCode: 200, body: "ok" };
      }
      if (/payment\s*done|paid|payment\s*complete|transferred/.test(replyId)) {
        await sendMessage(teacherPhone, `✅ *Payment Received!*\n\nThank you! We are verifying your payment.\nYour plan will be activated within *5 minutes*. ⏳`);
        return { statusCode: 200, body: "ok" };
      }

      // ── Restart / Main menu trigger ──
      if (/^(hi|hello|hey|start|menu|restart|new|create|make|generate)$/i.test(replyId) ||
          replyId === "restart") {
        await resetSession(teacherPhone);
        await sendDocTypeMenu(teacherPhone);
        return { statusCode: 200, body: "ok" };
      }

      // ── Route by conversation step ──
      const step = teacher?.conversationStep?.S || STEPS.IDLE;
      const session = parseSession(teacher);

      switch (step) {
        case STEPS.IDLE:
        case STEPS.DOC_TYPE:
          await handleDocTypeStep(teacherPhone, replyId, session);
          break;
        case STEPS.SUBJECT:
          await handleSubjectStep(teacherPhone, replyId, session, teacher);
          break;
        case STEPS.TOPIC:
          await handleTopicStep(teacherPhone, replyId, session, teacher);
          break;
        case STEPS.DIFFICULTY:
          await handleDifficultyStep(teacherPhone, replyId, session, teacher);
          break;
        case STEPS.CONFIRM:
          await handleConfirmStep(teacherPhone, replyId, session, teacher);
          break;
        default:
          await sendDocTypeMenu(teacherPhone);
      }

      return { statusCode: 200, body: "ok" };
    } catch (error) {
      console.error("❌ Webhook error:", error.message);
      return { statusCode: 200, body: "ok" };
    }
  }
}

// ─────────────────────────────────────────
// STEP 1: DOCUMENT TYPE SELECTION
// ─────────────────────────────────────────
async function sendDocTypeMenu(phone) {
  await sendButtons(phone,
    "📚 *Welcome to Adira!*\n\nWhat would you like to create today?",
    [
      { id: "doc_worksheet",    title: "📋 Worksheet" },
      { id: "doc_lesson_plan",  title: "📝 Lesson Plan" },
      { id: "doc_question_paper", title: "📄 Question Paper" },
    ]
  );
  await saveStep(phone, STEPS.DOC_TYPE, {});
}

async function handleDocTypeStep(phone, replyId, session) {
  const docMap = {
    "doc_worksheet":      "Worksheet",
    "doc_lesson_plan":    "Lesson Plan",
    "doc_question_paper": "Question Paper",
    "worksheet":          "Worksheet",
    "lesson plan":        "Lesson Plan",
    "question paper":     "Question Paper",
  };

  const docType = docMap[replyId];
  if (!docType) {
    await sendDocTypeMenu(phone);
    return;
  }

  const updatedSession = { ...session, docType };
  await saveStep(phone, STEPS.SUBJECT, updatedSession);
  await sendSubjectMenu(phone, docType);
}

// ─────────────────────────────────────────
// STEP 2: SUBJECT SELECTION
// ─────────────────────────────────────────
async function sendSubjectMenu(phone, docType) {
  const subjects = getAvailableSubjects();
  const buttons = subjects.slice(0, 3).map(s => ({
    id: `subject_${s}`,
    title: capitalize(s),
  }));

  await sendButtons(phone,
    `Great! You're creating a *${docType}*.\n\nChoose a subject:`,
    buttons
  );
}

async function handleSubjectStep(phone, replyId, session, teacher) {
  const subject = replyId.replace(/^subject_/, "");

  if (!hasSubject(subject)) {
    await sendMessage(phone, `❌ Subject not recognised. Please choose from the menu.`);
    await sendSubjectMenu(phone, session.docType);
    return;
  }

  const updatedSession = { ...session, subject };
  await saveStep(phone, STEPS.TOPIC, updatedSession);
  await sendTopicMenu(phone, subject);
}

// ─────────────────────────────────────────
// STEP 3: TOPIC SELECTION
// Uses list for >3 topics, buttons for ≤3
// ─────────────────────────────────────────
async function sendTopicMenu(phone, subject) {
  const topics = getTopicsList(subject);
  if (!topics || topics.length === 0) {
    await sendMessage(phone, `❌ No topics found for ${subject}. Please contact support.`);
    return;
  }

  const rows = topics.map(t => ({
    id: `topic_${t.id}`,
    title: t.title,
    description: t.category,
  }));

  await sendList(phone,
    `Select a *${capitalize(subject)}* topic:`,
    "Choose Topic",
    [{ title: capitalize(subject), rows }]
  );
}

async function handleTopicStep(phone, replyId, session, teacher) {
  const topicId = replyId.replace(/^topic_/, "");

  if (!isValidTopic(session.subject, topicId)) {
    await sendMessage(phone, `❌ Topic not recognised. Please choose from the list.`);
    await sendTopicMenu(phone, session.subject);
    return;
  }

  const updatedSession = { ...session, topicId };
  await saveStep(phone, STEPS.DIFFICULTY, updatedSession);
  await sendDifficultyMenu(phone, topicId);
}

// ─────────────────────────────────────────
// STEP 4: DIFFICULTY SELECTION
// ─────────────────────────────────────────
async function sendDifficultyMenu(phone, topicId) {
  await sendButtons(phone,
    `Choose the *difficulty level*:`,
    [
      { id: "diff_beginner",     title: "🟢 Beginner" },
      { id: "diff_intermediate", title: "🟡 Intermediate" },
      { id: "diff_advanced",     title: "🔴 Advanced" },
    ]
  );
}

async function handleDifficultyStep(phone, replyId, session, teacher) {
  const difficulty = replyId.replace(/^diff_/, "");

  if (!isValidDifficulty(difficulty)) {
    await sendMessage(phone, `❌ Difficulty not recognised. Please choose from the buttons.`);
    await sendDifficultyMenu(phone, session.topicId);
    return;
  }

  const updatedSession = { ...session, difficulty };
  await saveStep(phone, STEPS.CONFIRM, updatedSession);
  await sendConfirmMenu(phone, updatedSession);
}

// ─────────────────────────────────────────
// STEP 5: CONFIRM AND GENERATE
// ─────────────────────────────────────────
async function sendConfirmMenu(phone, session) {
  const summary = `📋 *Ready to generate!*\n\n` +
    `📄 *Type:* ${session.docType}\n` +
    `📚 *Subject:* ${capitalize(session.subject)}\n` +
    `🔬 *Topic:* ${session.topicId.replace(/_/g, " ")}\n` +
    `🎯 *Difficulty:* ${DIFFICULTY_LABELS[session.difficulty]}\n\n` +
    `Shall I create this now?`;

  await sendButtons(phone, summary, [
    { id: "confirm_yes", title: "✅ Yes, generate!" },
    { id: "confirm_no",  title: "🔄 Start over" },
  ]);
}

async function handleConfirmStep(phone, replyId, session, teacher) {
  if (replyId === "confirm_no" || replyId === "start over") {
    await resetSession(phone);
    await sendDocTypeMenu(phone);
    return;
  }

  if (replyId !== "confirm_yes") {
    await sendConfirmMenu(phone, session);
    return;
  }

  // ── Check subscription ──
  const subCheck = await checkSubscription(teacher);
  if (!subCheck.allowed) {
    await sendMessage(phone, getBlockMessage(subCheck.reason, subCheck.plan));
    await resetSession(phone);
    return;
  }

  // ── Acknowledge and queue ──
  await sendMessage(phone,
    `⏳ *Got it!* Creating your ${session.docType}...\n\n` +
    `📚 ${capitalize(session.subject)} — ${session.topicId.replace(/_/g, " ")} (${DIFFICULTY_LABELS[session.difficulty]})\n\n` +
    `_Ready in ~30 seconds. Please wait..._`
  );

  const intent = {
    task:       session.docType,
    subject:    session.subject,
    topicId:    session.topicId,
    difficulty: session.difficulty,
  };

  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.SQS_QUEUE_URL,
    MessageBody: JSON.stringify({
      teacherPhone: phone,
      intent,
      teacherPlan: teacher?.plan?.S || "trial",
      timestamp: new Date().toISOString(),
    }),
  }));

  await resetSession(phone);
  console.log(`✅ Job queued for ${phone}`);
}

// ─────────────────────────────────────────
// SESSION HELPERS
// ─────────────────────────────────────────
function parseSession(teacher) {
  try {
    return JSON.parse(teacher?.conversationSession?.S || "{}");
  } catch {
    return {};
  }
}

async function saveStep(phone, step, session) {
  await dynamo.send(new UpdateItemCommand({
    TableName: process.env.DYNAMODB_TABLE || "adira-teachers",
    Key: { phone: { S: phone } },
    UpdateExpression: "SET conversationStep = :step, conversationSession = :session, lastActive = :ts",
    ExpressionAttributeValues: {
      ":step":    { S: step },
      ":session": { S: JSON.stringify(session) },
      ":ts":      { S: new Date().toISOString() },
    },
  }));
}

async function resetSession(phone) {
  await saveStep(phone, STEPS.IDLE, {});
}

// ─────────────────────────────────────────
// WELCOME MESSAGE
// ─────────────────────────────────────────
async function sendWelcome(phone) {
  await sendMessage(phone,
    `🎓 *Welcome to Adira!*\n_AI-Powered Teaching Assistant_\n\n` +
    `I create curriculum-aligned teaching documents in seconds:\n\n` +
    `📋 Worksheets\n` +
    `📝 Lesson Plans\n` +
    `📄 Question Papers\n\n` +
    `*Your Free Trial:*\n✅ 5 free generations\n\n` +
    `Just send *"hi"* anytime to get started! 😊`
  );
  await sendDocTypeMenu(phone);
}

// ─────────────────────────────────────────
// DYNAMO HELPERS
// ─────────────────────────────────────────
async function getTeacher(phone) {
  try {
    const result = await dynamo.send(new GetItemCommand({
      TableName: process.env.DYNAMODB_TABLE || "adira-teachers",
      Key: { phone: { S: phone } },
    }));
    return result.Item || null;
  } catch (error) {
    console.error("❌ Get teacher error:", error.message);
    return null;
  }
}

async function registerTeacher(phone) {
  try {
    await dynamo.send(new PutItemCommand({
      TableName: process.env.DYNAMODB_TABLE || "adira-teachers",
      Item: {
        phone:               { S: phone },
        plan:                { S: "trial" },
        generationsThisMonth:{ N: "0" },
        conversationStep:    { S: STEPS.IDLE },
        conversationSession: { S: "{}" },
        joinedDate:          { S: new Date().toISOString() },
        lastActive:          { S: new Date().toISOString() },
      },
    }));
    console.log(`✅ New teacher registered: ${phone}`);
  } catch (error) {
    console.error("❌ Registration error:", error.message);
  }
}

// ─────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, " ");
}

module.exports = { handler };
