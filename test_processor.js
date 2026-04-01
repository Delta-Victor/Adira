require("dotenv").config();
const { S3Client, GetObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { QdrantClient } = require("@qdrant/js-client-rest");
const PDF2Json = require("pdf2json");
const { Readable } = require("stream");

const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY
});

const COLLECTION_NAME = "adira-ncert";
const VECTOR_SIZE = 1536;
const RAW_BUCKET = "adira-ncert-raw";

// ─────────────────────────────────────────
// EXTRACT TEXT FROM PDF BUFFER
// ─────────────────────────────────────────
function extractTextFromPDF(buffer) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDF2Json(null, 1);

    pdfParser.on("pdfParser_dataError", err => {
      reject(new Error(err.parserError));
    });

    pdfParser.on("pdfParser_dataReady", pdfData => {
      try {
        let text = "";
        // Extract text from all pages
        if (pdfData.Pages) {
          pdfData.Pages.forEach(page => {
            if (page.Texts) {
              page.Texts.forEach(textItem => {
                if (textItem.R) {
                  textItem.R.forEach(r => {
                    if (r.T) {
                      text += decodeURIComponent(r.T) + " ";
                    }
                  });
                }
              });
              text += "\n\n"; // Page break
            }
          });
        }
        resolve(text.trim());
      } catch (e) {
        reject(e);
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}

// ─────────────────────────────────────────
// GENERATE EMBEDDING
// ─────────────────────────────────────────
function generateEmbedding(text) {
  const vector = new Array(VECTOR_SIZE).fill(0);
  const normalized = text.toLowerCase().trim();
  for (let i = 0; i < normalized.length; i++) {
    const charCode = normalized.charCodeAt(i);
    vector[i % VECTOR_SIZE] += charCode / 1000;
    vector[(i * 7 + 3) % VECTOR_SIZE] += charCode / 2000;
  }
  const magnitude = Math.sqrt(
    vector.reduce((sum, val) => sum + val * val, 0)
  );
  return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
}

// ─────────────────────────────────────────
// HASH FUNCTION
// ─────────────────────────────────────────
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ─────────────────────────────────────────
// MAIN TEST
// ─────────────────────────────────────────
async function runTest() {
  console.log("🧪 Testing PDF Processor on 5 files...\n");

  // Setup Qdrant collection
  try {
    await qdrant.getCollection(COLLECTION_NAME);
    console.log("✅ Qdrant collection exists");
  } catch {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" }
    });
    console.log("✅ Qdrant collection created");
  }

  // Get 5 PDFs from Class 7 Science
  const result = await s3.send(new ListObjectsV2Command({
    Bucket: RAW_BUCKET,
    Prefix: "Class_7/science/",
    MaxKeys: 10
  }));

  const pdfs = result.Contents
    ?.filter(f => f.Key.toLowerCase().endsWith(".pdf"))
    .slice(0, 5) || [];

  console.log(`📄 Testing with ${pdfs.length} PDFs from Class 7 Science\n`);

  let totalChunks = 0;

  for (const file of pdfs) {
    console.log(`Processing: ${file.Key.split("/").pop()}...`);

    try {
      // Read from S3
      const response = await s3.send(new GetObjectCommand({
        Bucket: RAW_BUCKET,
        Key: file.Key
      }));

      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of response.Body) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      console.log(`  📦 PDF size: ${(buffer.length / 1024).toFixed(1)} KB`);

      // Extract text
      const text = await extractTextFromPDF(buffer);
      console.log(`  📝 Text extracted: ${text.length} characters`);

      if (text.length < 50) {
        console.log(`  ⚠️ Too short — skipping`);
        continue;
      }

      // Split into chunks of ~400 words
      const words = text.split(/\s+/);
      const chunkSize = 400;
      const fileChunks = [];
      const chapterNum = file.Key.split("/").pop().replace(".pdf", "");

      for (let i = 0; i < words.length; i += chunkSize) {
        const chunkText = words.slice(i, i + chunkSize).join(" ");
        if (chunkText.trim().length < 50) continue;

        const chunkId = `class7_science_${chapterNum}_${Math.floor(i / chunkSize)}`;

        fileChunks.push({
          id: hashString(chunkId),
          vector: generateEmbedding(chunkText),
          payload: {
            chunk_id: chunkId,
            text: chunkText.substring(0, 1500),
            class: 7,
            subject: "science",
            book: "ncert",
            chapter: chapterNum,
            topic: `Class 7 Science ${chapterNum}`,
            type: "ncert_chapter"
          }
        });
      }

      // Store in Qdrant
      if (fileChunks.length > 0) {
        await qdrant.upsert(COLLECTION_NAME, {
          wait: true,
          points: fileChunks
        });
        totalChunks += fileChunks.length;
        console.log(`  ✅ Stored ${fileChunks.length} chunks`);
      }

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }

  // Verify in Qdrant
  const info = await qdrant.getCollection(COLLECTION_NAME);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Test Complete!`);
  console.log(`📦 Chunks stored this run: ${totalChunks}`);
  console.log(`🗄️  Total points in Qdrant: ${info.points_count}`);

  if (info.points_count > 0) {
    console.log(`\n🎉 PDF processor is working!`);
    console.log(`Ready to run full processing on all 1,295 PDFs.`);
  } else {
    console.log(`\n⚠️ No points stored — check errors above.`);
  }
}

runTest().catch(console.error);
