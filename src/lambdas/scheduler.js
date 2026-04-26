const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { sendRenewalReminder } = require("./delivery");
require("dotenv").config();

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" });
const TABLE = process.env.DYNAMODB_TABLE || "adira-teachers";

// ─────────────────────────────────────────
// MAIN HANDLER
// Two scheduled jobs call this:
//   monthlyReset  — cron(0 0 1 * ? *)  — 1st of every month at 00:00 UTC
//   dailyReminder — cron(0 6 * * ? *)  — every day at 06:00 UTC (11:30 AM IST)
// ─────────────────────────────────────────
async function handler(event) {
  const job = event?.job || "monthlyReset";

  if (job === "monthlyReset") {
    await runMonthlyReset();
  } else if (job === "dailyReminder") {
    await runRenewalReminders();
  } else {
    console.error(`Unknown scheduler job: ${job}`);
  }
}

// ─────────────────────────────────────────
// MONTHLY RESET
// Resets generationsThisMonth to 0 for all
// teachers on active paid plans
// ─────────────────────────────────────────
async function runMonthlyReset() {
  console.log("🔄 Starting monthly usage reset...");

  const teachers = await scanAllTeachers();
  let reset = 0;
  let skipped = 0;

  for (const teacher of teachers) {
    const plan = teacher?.plan?.S || "trial";
    const expiry = teacher?.plan_expiry?.S;

    // Only reset active paid plans — trial teachers have no monthly allocation
    if (plan === "trial") { skipped++; continue; }

    // Skip expired plans — no point resetting a dead subscription
    if (expiry && new Date(expiry) < new Date()) { skipped++; continue; }

    const phone = teacher.phone.S;
    try {
      await dynamo.send(new UpdateItemCommand({
        TableName: TABLE,
        Key: { phone: { S: phone } },
        UpdateExpression: "SET generationsThisMonth = :zero, lastResetDate = :date",
        ExpressionAttributeValues: {
          ":zero": { N: "0" },
          ":date": { S: new Date().toISOString() },
        },
      }));
      reset++;
      console.log(`✅ Reset usage for ${phone} (${plan} plan)`);
    } catch (err) {
      console.error(`❌ Failed to reset ${phone}:`, err.message);
    }
  }

  console.log(`✅ Monthly reset complete. Reset: ${reset}, Skipped: ${skipped}`);
}

// ─────────────────────────────────────────
// DAILY RENEWAL REMINDERS
// Sends a reminder to teachers whose plan
// expires in exactly 3 days
// ─────────────────────────────────────────
async function runRenewalReminders() {
  console.log("📬 Checking for plans expiring in 3 days...");

  const teachers = await scanAllTeachers();
  let sent = 0;

  const now = new Date();
  const in3Days = new Date(now);
  in3Days.setDate(now.getDate() + 3);

  for (const teacher of teachers) {
    const plan = teacher?.plan?.S;
    const expiry = teacher?.plan_expiry?.S;

    if (!plan || plan === "trial" || !expiry) continue;

    const expiryDate = new Date(expiry);

    // Check if expiry falls within today + 3 days (same calendar day)
    const sameDay =
      expiryDate.getFullYear() === in3Days.getFullYear() &&
      expiryDate.getMonth() === in3Days.getMonth() &&
      expiryDate.getDate() === in3Days.getDate();

    if (!sameDay) continue;

    const phone = teacher.phone.S;
    try {
      await sendRenewalReminder(phone, plan, expiry);
      sent++;
    } catch (err) {
      console.error(`❌ Failed to send reminder to ${phone}:`, err.message);
    }
  }

  console.log(`✅ Renewal reminders sent: ${sent}`);
}

// ─────────────────────────────────────────
// SCAN ALL TEACHERS
// Paginates through the full DynamoDB table
// ─────────────────────────────────────────
async function scanAllTeachers() {
  const teachers = [];
  let lastKey = undefined;

  do {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE,
      ExclusiveStartKey: lastKey,
      ProjectionExpression: "phone, plan, plan_expiry, generationsThisMonth",
    }));

    if (result.Items) teachers.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return teachers;
}

module.exports = { handler };
