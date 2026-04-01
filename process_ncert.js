require("dotenv").config();
const { S3Client, GetObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { QdrantClient } = require("@qdrant/js-client-rest");
const PDF2Json = require("pdf2json");

const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY
});

const COLLECTION_NAME = "adira-ncert";
const VECTOR_SIZE = 1536;
const RAW_BUCKET = "adira-ncert-raw";

// ─────────────────────────────────────────
// EXTRACT TEXT FROM PDF
// Handles Hindi/Sanskrit encoding errors
// ─────────────────────────────────────────
function extractTextFromPDF(buffer) {
  return new Promise((resolve) => {
    const pdfParser = new PDF2Json(null, 1);

    // Timeout after 30 seconds per file
    const timeout = setTimeout(() => {
      console.log("    ⏱️ Timeout — skipping");
      resolve("");
    }, 30000);

    pdfParser.on("pdfParser_dataError", () => {
      clearTimeout(timeout);
      resolve("");
    });

    pdfParser.on("pdfParser_dataReady", pdfData => {
      clearTimeout(timeout);
      try {
        let text = "";
        if (pdfData.Pages) {
          pdfData.Pages.forEach(page => {
            if (page.Texts) {
              page.Texts.forEach(textItem => {
                if (textItem.R) {
                  textItem.R.forEach(r => {
                    if (r.T) {
                      try {
                        text += decodeURIComponent(r.T) + " ";
                      } catch {
                        // Skip malformed URI — Hindi/Sanskrit chars
                        text += r.T + " ";
                      }
                    }
                  });
                }
              });
              text += "\n\n";
            }
          });
        }
        resolve(text.trim());
      } catch {
        resolve("");
      }
    });

    try {
      pdfParser.parseBuffer(buffer);
    } catch {
      clearTimeout(timeout);
      resolve("");
    }
  });
}

// ─────────────────────────────────────────
// PARSE METADATA FROM S3 KEY
// ─────────────────────────────────────────
function parseMetadata(s3Key) {
  const parts = s3Key.split("/");

  if (s3Key.includes("Sample_Papers")) {
    const filename = parts[parts.length - 1].replace(".pdf", "");
    const classMatch = parts[1]?.match(/\d+/);
    return {
      type: "sample_paper",
      class: classMatch ? parseInt(classMatch[0]) : 0,
      subject: filename.split("-")[0].toLowerCase(),
      book: "cbse_official",
      chapter: 0,
      topic: filename,
      s3_key: s3Key
    };
  }

  if (s3Key.includes("cbse_learning_outcomes")) {
    return {
      type: "learning_outcomes",
      class: 0,
      subject: "all",
      book: "cbse_official",
      chapter: 0,
      topic: "CBSE Learning Outcomes",
      s3_key: s3Key
    };
  }

  const classMatch = parts[0]?.match(/\d+/);
  const classNum = classMatch ? parseInt(classMatch[0]) : 0;
  const subject = parts[1]?.toLowerCase() || "unknown";
  const filename = parts[parts.length - 1].replace(".pdf", "");

  let book = "ncert";
  let chapter = 0;
  let topic = filename;

  const namedBookMatch = filename.match(/^(.+)_chapter_(\d+)$/);
  if (namedBookMatch) {
    book = namedBookMatch[1];
    chapter = parseInt(namedBookMatch[2]);
    topic = `${book} chapter ${chapter}`;
  }

  const chapterMatch = filename.match(/^chapter_(\d+)$/);
  if (chapterMatch) {
    chapter = parseInt(chapterMatch[1]);
    topic = `chapter ${chapter}`;
  }

  const partMatch = filename.match(/^part(\d+)_chapter_(\d+)$/);
  if (partMatch) {
    book = `part${partMatch[1]}`;
    chapter = parseInt(partMatch[2]);
    topic = `part ${partMatch[1]} chapter ${chapter}`;
  }

  const appendixMatch = filename.match(/^appendix_(\d+)$/);
  if (appendixMatch) {
    chapter = parseInt(appendixMatch[1]);
    topic = `appendix ${chapter}`;
    book = "appendix";
  }

  if (filename.includes("supplementary")) {
    book = filename.replace("_supplementary", "");
    topic = "supplementary";
  }

  return {
    type: "ncert_chapter",
    class: classNum,
    subject: subject,
    book: book,
    chapter: chapter,
    topic: topic,
    s3_key: s3Key
  };
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
    vector[(i * 13 + 7) % VECTOR_SIZE] += charCode / 3000;
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
// SPLIT TEXT INTO CHUNKS
// ─────────────────────────────────────────
function splitIntoChunks(text, metadata) {
  const cleaned = text
    .replace(/\f/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned || cleaned.length < 50) return [];

  const words = cleaned.split(/\s+/);
  const chunkSize = 400;
  const chunks = [];

  for (let i = 0; i < words.length; i += chunkSize) {
    const chunkText = words.slice(i, i + chunkSize).join(" ");
    if (chunkText.trim().length < 50) continue;

    const chunkIndex = Math.floor(i / chunkSize);
    const chunkId = `${metadata.class}_${metadata.subject}_${metadata.book}_ch${metadata.chapter}_${chunkIndex}`;

    chunks.push({
      id: hashString(chunkId),
      vector: generateEmbedding(chunkText),
      payload: {
        chunk_id: chunkId,
        text: chunkText.substring(0, 1500),
        class: metadata.class,
        subject: metadata.subject,
        book: metadata.book,
        chapter: metadata.chapter,
        topic: metadata.topic,
        type: metadata.type,
        s3_key: metadata.s3_key
      }
    });
  }

  return chunks;
}

// ─────────────────────────────────────────
// STORE CHUNKS IN QDRANT
// ─────────────────────────────────────────
async function storeChunks(chunks) {
  if (chunks.length === 0) return;
  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: batch
    });
  }
}

// ─────────────────────────────────────────
// LIST ALL PDFS IN S3
// ─────────────────────────────────────────
async function listAllPDFs() {
  console.log("📋 Listing all PDFs in S3...");
  const allFiles = [];
  let continuationToken = null;

  do {
    const params = { Bucket: RAW_BUCKET, MaxKeys: 1000 };
    if (continuationToken) params.ContinuationToken = continuationToken;
    const result = await s3.send(new ListObjectsV2Command(params));
    result.Contents?.forEach(file => {
      if (file.Key.toLowerCase().endsWith(".pdf")) {
        allFiles.push(file.Key);
      }
    });
    continuationToken = result.NextContinuationToken;
  } while (continuationToken);

  console.log(`✅ Found ${allFiles.length} PDFs\n`);
  return allFiles;
}

// ─────────────────────────────────────────
// MAIN PROCESSOR
// ─────────────────────────────────────────
async function processAllPDFs() {
  console.log("🚀 ADIRA — NCERT PDF Processor");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const startTime = Date.now();
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalChunks = 0;

  // Setup Qdrant
  console.log("🔧 Setting up Qdrant collection...");
  try {
    await qdrant.getCollection(COLLECTION_NAME);
    console.log("✅ Collection exists\n");
  } catch {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" }
    });
    console.log("✅ Collection created\n");
  }

  // Get all PDFs
  const allPDFs = await listAllPDFs();
  const total = allPDFs.length;

  console.log(`📚 Processing ${total} PDFs...\n`);

  for (let i = 0; i < allPDFs.length; i++) {
    const s3Key = allPDFs[i];
    const filename = s3Key.split("/").pop();
    const progress = `[${i + 1}/${total}]`;

    try {
      const metadata = parseMetadata(s3Key);

      // Read PDF from S3
      const response = await s3.send(new GetObjectCommand({
        Bucket: RAW_BUCKET,
        Key: s3Key
      }));

      const bufferChunks = [];
      for await (const chunk of response.Body) bufferChunks.push(chunk);
      const buffer = Buffer.concat(bufferChunks);

      // Extract text
      const text = await extractTextFromPDF(buffer);

      if (!text || text.length < 100) {
        process.stdout.write(`${progress} ⚠️ Skipped (empty): ${filename}\n`);
        skipped++;
        continue;
      }

      // Split and store
      const textChunks = splitIntoChunks(text, metadata);

      if (textChunks.length === 0) {
        process.stdout.write(`${progress} ⚠️ Skipped (no chunks): ${filename}\n`);
        skipped++;
        continue;
      }

      await storeChunks(textChunks);
      totalChunks += textChunks.length;
      processed++;

      process.stdout.write(`${progress} ✅ ${filename} → ${textChunks.length} chunks\n`);

      // Small delay every 10 files
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

    } catch (error) {
      process.stdout.write(`${progress} ❌ ${filename}: ${error.message}\n`);
      failed++;
    }
  }

  // Final report
  const duration = Math.round((Date.now() - startTime) / 1000);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  let qdrantCount = 0;
  try {
    const info = await qdrant.getCollection(COLLECTION_NAME);
    qdrantCount = info.points_count;
  } catch {}

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 PROCESSING COMPLETE!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ Processed:      ${processed} PDFs`);
  console.log(`⚠️  Skipped:        ${skipped} PDFs`);
  console.log(`❌ Failed:          ${failed} PDFs`);
  console.log(`🧩 Chunks stored:  ${totalChunks}`);
  console.log(`🗄️  Qdrant total:   ${qdrantCount} points`);
  console.log(`⏱️  Time taken:     ${minutes}m ${seconds}s`);
  console.log("\n🧠 Adira's brain is fully loaded!");
}

processAllPDFs().catch(console.error);
