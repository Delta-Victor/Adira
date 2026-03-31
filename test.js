require("dotenv").config();
const { parseIntent } = require("./src/lambdas/webhook");
const { checkSubscription, getBlockMessage, PLANS } = require("./src/utils/payments");

console.log("🚀 Starting Adira Tests...\n");

// ─────────────────────────────────────────
// TEST 1 — Intent Parser
// ─────────────────────────────────────────
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("TEST 1: Intent Parser");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const testMessages = [
  "lesson plan class 7 science chapter 3",
  "worksheet class 5 maths chapter 2 20 questions",
  "question paper class 8 science chapter 1",
  "create a test for class 9 english ch4",
  "upgrade basic",
  "upgrade pro",
  "my plan",
  "payment done 123456789012",
  "add school logo",
  "send word file",
  "hello how are you"
];

testMessages.forEach(msg => {
  const intent = parseIntent(msg);
  console.log(`\nMessage: "${msg}"`);
  console.log(`→ Task: ${intent.task || "❌ Not detected"}`);
  if (intent.plan) console.log(`→ Plan: ${intent.plan}`);
  if (intent.class) console.log(`→ Class: ${intent.class}`);
  if (intent.subject) console.log(`→ Subject: ${intent.subject}`);
  if (intent.chapter) console.log(`→ Chapter: ${intent.chapter}`);
  console.log(`→ Valid: ${intent.isValid ? "✅ Yes" : "❌ No"}`);
});

// ─────────────────────────────────────────
// TEST 2 — Subscription Plans
// ─────────────────────────────────────────
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("TEST 2: Subscription Plans");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

console.log("\nPlan Details:");
Object.entries(PLANS).forEach(([key, plan]) => {
  console.log(`\n${key.toUpperCase()}:`);
  console.log(`  Price: ₹${plan.price}`);
  console.log(`  Generations: ${plan.generations === 999999 ? "Unlimited" : plan.generations}`);
  console.log(`  Duration: ${plan.duration_days} days`);
});

// ─────────────────────────────────────────
// TEST 3 — Subscription Checker
// ─────────────────────────────────────────
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("TEST 3: Subscription Checker");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

async function testSubscriptions() {
  // Simulate different teacher scenarios
  const scenarios = [
    {
      name: "New trial teacher — 2 generations used",
      teacher: {
        phone: { S: "919999999991" },
        plan: { S: "trial" },
        generationsThisMonth: { N: "2" },
        joinedDate: { S: new Date().toISOString() }
      }
    },
    {
      name: "Trial teacher — all 5 used",
      teacher: {
        phone: { S: "919999999992" },
        plan: { S: "trial" },
        generationsThisMonth: { N: "5" },
        joinedDate: { S: new Date().toISOString() }
      }
    },
    {
      name: "Trial expired — joined 4 days ago",
      teacher: {
        phone: { S: "919999999993" },
        plan: { S: "trial" },
        generationsThisMonth: { N: "2" },
        joinedDate: { S: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() }
      }
    },
    {
      name: "Basic teacher — 15 generations used",
      teacher: {
        phone: { S: "919999999994" },
        plan: { S: "basic" },
        generationsThisMonth: { N: "15" },
        plan_expiry: { S: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString() },
        joinedDate: { S: new Date().toISOString() }
      }
    },
    {
      name: "Basic teacher — all 30 used",
      teacher: {
        phone: { S: "919999999995" },
        plan: { S: "basic" },
        generationsThisMonth: { N: "30" },
        plan_expiry: { S: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString() },
        joinedDate: { S: new Date().toISOString() }
      }
    },
    {
      name: "Basic plan expired",
      teacher: {
        phone: { S: "919999999996" },
        plan: { S: "basic" },
        generationsThisMonth: { N: "10" },
        plan_expiry: { S: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
        joinedDate: { S: new Date().toISOString() }
      }
    },
    {
      name: "Pro teacher — 500 generations used",
      teacher: {
        phone: { S: "919999999997" },
        plan: { S: "pro" },
        generationsThisMonth: { N: "500" },
        plan_expiry: { S: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString() },
        joinedDate: { S: new Date().toISOString() }
      }
    }
  ];

  for (const scenario of scenarios) {
    const result = await checkSubscription(scenario.teacher);
    console.log(`\n📋 ${scenario.name}`);
    console.log(`   Allowed: ${result.allowed ? "✅ Yes" : "❌ No"}`);
    if (!result.allowed) {
      console.log(`   Reason: ${result.reason}`);
      console.log(`   Message preview: ${getBlockMessage(result.reason, result.plan).substring(0, 60)}...`);
    } else {
      console.log(`   Remaining: ${result.remaining}`);
    }
  }
}

// ─────────────────────────────────────────
// TEST 4 — Claude API
// ─────────────────────────────────────────
async function testClaude() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 4: Claude API");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log("🔄 Connecting to Claude...");
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 50,
      messages: [{ role: "user", content: "Say: Adira is ready!" }]
    });
    console.log(`✅ Claude: ${response.content[0].text}`);
  } catch (error) {
    console.log(`❌ Claude error: ${error.message}`);
  }
}

// ─────────────────────────────────────────
// TEST 5 — AWS S3
// ─────────────────────────────────────────
async function testS3() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 5: AWS S3");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  try {
    const { S3Client, ListBucketsCommand } = require("@aws-sdk/client-s3");
    const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });
    console.log("🔄 Connecting to S3...");
    const result = await s3.send(new ListBucketsCommand({}));
    const adiraBuckets = result.Buckets.filter(b => b.Name.includes("adira"));
    console.log(`✅ S3 connected! Adira buckets: ${adiraBuckets.length}`);
    adiraBuckets.forEach(b => console.log(`   → ${b.Name}`));
  } catch (error) {
    console.log(`❌ S3 error: ${error.message}`);
  }
}

// ─────────────────────────────────────────
// TEST 6 — DynamoDB
// ─────────────────────────────────────────
async function testDynamoDB() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 6: DynamoDB");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  try {
    const { DynamoDBClient, ListTablesCommand } = require("@aws-sdk/client-dynamodb");
    const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" });
    console.log("🔄 Connecting to DynamoDB...");
    const result = await dynamo.send(new ListTablesCommand({}));
    const adiraTables = result.TableNames.filter(t => t.includes("adira"));
    console.log(`✅ DynamoDB connected! Tables: ${adiraTables.join(", ")}`);
  } catch (error) {
    console.log(`❌ DynamoDB error: ${error.message}`);
  }
}

// ─────────────────────────────────────────
// TEST 7 — Qdrant
// ─────────────────────────────────────────
async function testQdrant() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 7: Qdrant");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  try {
    const { QdrantClient } = require("@qdrant/js-client-rest");
    const client = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY
    });
    console.log("🔄 Connecting to Qdrant...");
    const collections = await client.getCollections();
    console.log(`✅ Qdrant connected! Collections: ${collections.collections.length}`);
  } catch (error) {
    console.log(`❌ Qdrant error: ${error.message}`);
  }
}

// ─────────────────────────────────────────
// RUN ALL TESTS
// ─────────────────────────────────────────
async function runAll() {
  await testSubscriptions();
  await testClaude();
  await testS3();
  await testDynamoDB();
  await testQdrant();

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ All tests complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

runAll();
