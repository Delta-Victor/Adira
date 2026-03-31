const { DynamoDBClient, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { sendMessage } = require("./whatsapp");
const { getSecrets } = require("./secrets");
require("dotenv").config();

const dynamo = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-south-1"
});

// ─────────────────────────────────────────
// PLAN DETAILS
// ─────────────────────────────────────────
const PLANS = {
  trial: {
    name: "Free Trial",
    price: 0,
    generations: 5,
    duration_days: 3
  },
  basic: {
    name: "Basic",
    price: 199,
    generations: 30,
    duration_days: 30
  },
  pro: {
    name: "Pro",
    price: 399,
    generations: 999999,
    duration_days: 30
  }
};

// ─────────────────────────────────────────
// CHECK SUBSCRIPTION
// ─────────────────────────────────────────
async function checkSubscription(teacher) {
  var plan = teacher?.plan?.S || "trial";
  var expiry = teacher?.plan_expiry?.S;
  var usage = parseInt(teacher?.generationsThisMonth?.N || "0");
  var joinDate = new Date(teacher?.joinedDate?.S);

  // Check trial expiry — 3 days
  if (plan === "trial") {
    var daysSinceJoin = (new Date() - joinDate) / (1000 * 60 * 60 * 24);
    if (daysSinceJoin > 3) {
      return { allowed: false, reason: "trial_expired", plan: plan };
    }
    if (usage >= PLANS.trial.generations) {
      return { allowed: false, reason: "limit_reached", plan: plan };
    }
  }

  // Check paid plan expiry
  if (plan !== "trial" && expiry) {
    if (new Date(expiry) < new Date()) {
      return { allowed: false, reason: "plan_expired", plan: plan };
    }
  }

  // Check generation limit
  var limit = PLANS[plan]?.generations || PLANS.trial.generations;
  if (usage >= limit) {
    return { allowed: false, reason: "limit_reached", plan: plan };
  }

  var remaining = limit === 999999 ? "Unlimited" : limit - usage;
  return { allowed: true, plan: plan, remaining: remaining };
}

// ─────────────────────────────────────────
// GET BLOCK MESSAGE
// ─────────────────────────────────────────
function getBlockMessage(reason, plan) {
  if (reason === "trial_expired") {
    return `⏰ *Your Free Trial Has Ended*

Hope you enjoyed Adira! 😊

*Choose a plan to continue:*

📌 *Basic — ₹199/month*
✅ 30 generations/month
✅ PDF + Word formats

📌 *Pro — ₹399/month*
✅ Unlimited generations
✅ All formats + School letterhead

Reply *"upgrade basic"* or *"upgrade pro"*`;
  }

  if (reason === "plan_expired") {
    return `⏰ *Your ${PLANS[plan]?.name} Plan Has Expired*

Renew to continue using Adira!

Reply *"upgrade ${plan}"* to renew for ₹${PLANS[plan]?.price}/month`;
  }

  if (reason === "limit_reached") {
    if (plan === "trial") {
      return `⚠️ *Trial Limit Reached*

You have used all 5 free generations!

*Upgrade to continue:*

📌 *Basic — ₹199/month*
✅ 30 generations/month

📌 *Pro — ₹399/month*
✅ Unlimited generations

Reply *"upgrade basic"* or *"upgrade pro"*`;
    }
    if (plan === "basic") {
      return `⚠️ *Monthly Limit Reached*

You have used all 30 generations this month.

📌 *Upgrade to Pro — ₹399/month*
✅ Unlimited generations

Reply *"upgrade pro"* to upgrade!
Or wait till 1st of next month for reset.`;
    }
  }

  return `⚠️ Something went wrong. Please try again.`;
}

// ─────────────────────────────────────────
// SEND UPGRADE MESSAGE
// ─────────────────────────────────────────
async function sendUpgradeMessage(teacherPhone, plan) {
  const secrets = await getSecrets();
  const basicLink = secrets.RAZORPAY_BASIC_LINK || process.env.RAZORPAY_BASIC_LINK;
  const proLink = secrets.RAZORPAY_PRO_LINK || process.env.RAZORPAY_PRO_LINK;

  const message = plan === "basic"
    ? `💎 *Upgrade to Basic Plan*

📊 30 generations/month
📄 PDF + Word formats
📅 Valid for 30 days
💰 *Price: ₹199/month*

👉 *Pay here:*
${basicLink}

✅ Reply *"payment done"* after paying
🔒 Secured by Razorpay
_Accepts UPI, Cards, NetBanking_`

    : `💎 *Upgrade to Pro Plan*

📊 Unlimited generations
📄 PDF + Word formats
🏫 School logo and letterhead
📅 Valid for 30 days
💰 *Price: ₹399/month*

👉 *Pay here:*
${proLink}

✅ Reply *"payment done"* after paying
🔒 Secured by Razorpay
_Accepts UPI, Cards, NetBanking_`;

  await sendMessage(teacherPhone, message);
  console.log(`✅ Upgrade message sent to ${teacherPhone} for ${plan}`);
}

// ─────────────────────────────────────────
// ACTIVATE PLAN
// ─────────────────────────────────────────
async function activatePlan(teacherPhone, plan) {
  const planDetails = PLANS[plan];
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + planDetails.duration_days);

  try {
    await dynamo.send(new UpdateItemCommand({
      TableName: process.env.DYNAMODB_TABLE || "adira-teachers",
      Key: { phone: { S: teacherPhone } },
      UpdateExpression:
        "SET plan = :plan, " +
        "plan_expiry = :expiry, " +
        "generationsThisMonth = :zero, " +
        "lastPaymentDate = :today",
      ExpressionAttributeValues: {
        ":plan":   { S: plan },
        ":expiry": { S: expiry.toISOString() },
        ":zero":   { N: "0" },
        ":today":  { S: new Date().toISOString() }
      }
    }));

    const expiryStr = expiry.toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric"
    });

    const message = plan === "basic"
      ? `🎉 *Basic Plan Activated!*

✅ 30 generations added
📅 Valid till: ${expiryStr}
📄 Formats: PDF + Word

What would you like to create?
Try: _"worksheet class 7 science chapter 3"_`

      : `🎉 *Pro Plan Activated!*

✅ Unlimited generations
📅 Valid till: ${expiryStr}
📄 All formats available
🏫 School letterhead enabled

To add your school logo reply: _"add school logo"_

What would you like to create?`;

    await sendMessage(teacherPhone, message);
    console.log(`✅ Plan activated: ${plan} for ${teacherPhone}`);

  } catch (error) {
    console.error("❌ Activation error:", error.message);
    throw error;
  }
}

// ─────────────────────────────────────────
// GET PLAN STATUS
// ─────────────────────────────────────────
async function getPlanStatus(teacher) {
  var plan = teacher?.plan?.S || "trial";
  var usage = parseInt(teacher?.generationsThisMonth?.N || "0");
  var expiry = teacher?.plan_expiry?.S;
  var planDetails = PLANS[plan] || PLANS.trial;
  var remaining = plan === "pro" ? "Unlimited" :
                  Math.max(0, planDetails.generations - usage);
  var expiryStr = expiry
    ? new Date(expiry).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric"
      })
    : "3 days from joining";

  return `📊 *Your Adira Plan*

📌 Plan: *${planDetails.name}*
📈 Used this month: *${usage}*
✅ Remaining: *${remaining}*
📅 Valid till: *${expiryStr}*

${plan === "trial" ?
  `_Enjoying Adira? Upgrade for more!\nReply "upgrade basic" or "upgrade pro"_` :
  plan === "basic" ?
  `_Need unlimited? Reply "upgrade pro"_` :
  `_You are on our best plan! 🎉_`
}`;
}

module.exports = {
  PLANS,
  checkSubscription,
  getBlockMessage,
  sendUpgradeMessage,
  activatePlan,
  getPlanStatus
};
