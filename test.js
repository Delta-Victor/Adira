// ─────────────────────────────────────────
// ADIRA LOCAL TEST
// Tests each component one by one
// ─────────────────────────────────────────
require("dotenv").config();
const { parseIntent } = require("./src/lambdas/webhook");

console.log("🚀 Starting Adira Local Tests...\n");

// ── Test 1: Intent Parser ──
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("TEST 1: Intent Parser");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const testMessages = [
  "lesson plan class 7 science chapter 3",
  "worksheet class 5 maths chapter 2 20 questions",
  "question paper class 8 science chapter 1",
  "create a test for class 9 english ch4",
  "hello how are you",
];

testMessages.forEach(msg => {
  const intent = parseIntent(msg);
  console.log(`\nMessage: "${msg}"`);
  console.log(`→ Task: ${intent.task || "❌ Not detected"}`);
  console.log(`→ Class: ${intent.class || "❌ Not detected"}`);
  console.log(`→ Subject: ${intent.subject || "❌ Not detected"}`);
  console.log(`→ Chapter: ${intent.chapter || "❌ Not detected"}`);
  console.log(`→ Valid: ${intent.isValid ? "✅ Yes" : "❌ No"}`);
});

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("TEST 2: Claude API Connection");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

async function testClaude() {
  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    console.log("🔄 Connecting to Claude API...");
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      messages: [{
        role: "user",
        content: "Say exactly this: Adira is connected and ready!"
      }]
    });

    console.log(`✅ Claude says: ${response.content[0].text}`);
  } catch (error) {
    console.log(`❌ Claude error: ${error.message}`);
    console.log("→ Check your ANTHROPIC_API_KEY in .env file");
  }
}

// ── Test 3: Qdrant Connection ──
async function testQdrant() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 3: Qdrant Connection");
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
    console.log("→ Check your QDRANT_URL and QDRANT_API_KEY in .env file");
  }
}

// ── Test 4: AWS S3 Connection ──
async function testS3() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 4: AWS S3 Connection");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    const { S3Client, ListBucketsCommand } = require("@aws-sdk/client-s3");
    const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });

    console.log("🔄 Connecting to AWS S3...");
    const result = await s3.send(new ListBucketsCommand({}));
    const adiraBuckets = result.Buckets.filter(b => b.Name.includes("adira"));
    console.log(`✅ S3 connected! Adira buckets found: ${adiraBuckets.length}`);
    adiraBuckets.forEach(b => console.log(`   → ${b.Name}`));

  } catch (error) {
    console.log(`❌ S3 error: ${error.message}`);
    console.log("→ Check your AWS credentials");
  }
}

// ── Test 5: DynamoDB Connection ──
async function testDynamoDB() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 5: DynamoDB Connection");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    const { DynamoDBClient, ListTablesCommand } = require("@aws-sdk/client-dynamodb");
    const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" });

    console.log("🔄 Connecting to DynamoDB...");
    const result = await dynamo.send(new ListTablesCommand({}));
    const adiraTables = result.TableNames.filter(t => t.includes("adira"));
    console.log(`✅ DynamoDB connected! Adira tables: ${adiraTables.join(", ")}`);

  } catch (error) {
    console.log(`❌ DynamoDB error: ${error.message}`);
    console.log("→ Check your AWS credentials and region");
  }
}

// ── Run all tests ──
async function runAllTests() {
  await testClaude();
  await testQdrant();
  await testS3();
  await testDynamoDB();

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ All tests complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

runAllTests();
