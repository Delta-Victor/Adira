const { QdrantClient } = require("@qdrant/js-client-rest");
const axios = require("axios");
const { getSecrets } = require("./secrets");
require("dotenv").config();

const COLLECTION_NAME = "adira-ncert";

// ─────────────────────────────────────────
// CONNECT TO QDRANT
// ─────────────────────────────────────────
async function getQdrantClient() {
  const secrets = await getSecrets();
  return new QdrantClient({
    url: secrets.QDRANT_URL || process.env.QDRANT_URL,
    apiKey: secrets.QDRANT_API_KEY || process.env.QDRANT_API_KEY,
  });
}

// ─────────────────────────────────────────
// GENERATE SIMPLE EMBEDDING
// ─────────────────────────────────────────
function generateSimpleEmbedding(text) {
  const vector = new Array(1536).fill(0);
  const normalized = text.toLowerCase().trim();
  for (let i = 0; i < normalized.length; i++) {
    const charCode = normalized.charCodeAt(i);
    vector[i % 1536] += charCode / 1000;
    vector[(i * 7 + 3) % 1536] += charCode / 2000;
    vector[(i * 13 + 7) % 1536] += charCode / 3000;
  }
  const magnitude = Math.sqrt(
    vector.reduce((sum, val) => sum + val * val, 0)
  );
  return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
}

// ─────────────────────────────────────────
// INITIALIZE COLLECTION
// ─────────────────────────────────────────
async function initializeCollection() {
  const client = await getQdrantClient();
  try {
    await client.getCollection(COLLECTION_NAME);
    console.log("✅ Qdrant collection exists");
  } catch {
    await client.createCollection(COLLECTION_NAME, {
      vectors: { size: 1536, distance: "Cosine" }
    });
    console.log("✅ Qdrant collection created");
  }
}

// ─────────────────────────────────────────
// STORE A CHUNK
// ─────────────────────────────────────────
async function storeChunk(chunk) {
  const client = await getQdrantClient();
  const embedding = generateSimpleEmbedding(chunk.text);

  await client.upsert(COLLECTION_NAME, {
    points: [{
      id: Math.abs(hashString(chunk.chunk_id)),
      vector: embedding,
      payload: {
        chunk_id: chunk.chunk_id,
        class: chunk.class,
        subject: chunk.subject,
        chapter: chunk.chapter,
        topic: chunk.topic,
        text: chunk.text
      }
    }]
  });
}

// ─────────────────────────────────────────
// SEARCH NCERT CONTENT
// Uses direct REST API for filter support
// ─────────────────────────────────────────
async function searchNCERT(query, classNum, subject, chapter, topK = 5) {
  const secrets = await getSecrets();
  const qdrantUrl = secrets.QDRANT_URL || process.env.QDRANT_URL;
  const qdrantKey = secrets.QDRANT_API_KEY || process.env.QDRANT_API_KEY;

  const embedding = generateSimpleEmbedding(query);

  // Build filter conditions
  const mustFilters = [];

  if (classNum) {
    mustFilters.push({
      key: "class",
      match: { value: parseInt(classNum) }
    });
  }

  if (subject) {
    mustFilters.push({
      key: "subject",
      match: { value: subject.toLowerCase() }
    });
  }

  if (chapter) {
    mustFilters.push({
      key: "chapter",
      match: { value: parseInt(chapter) }
    });
  }

  const searchBody = {
    vector: embedding,
    limit: topK,
    with_payload: true
  };

  if (mustFilters.length > 0) {
    searchBody.filter = { must: mustFilters };
  }

  try {
    const response = await axios.post(
      `${qdrantUrl}/collections/${COLLECTION_NAME}/points/search`,
      searchBody,
      {
        headers: {
          "api-key": qdrantKey,
          "Content-Type": "application/json"
        }
      }
    );

    const results = response.data.result || [];
    console.log(`✅ Qdrant search returned ${results.length} results`);

    return results.map(r => ({
      topic: r.payload.topic,
      text: r.payload.text,
      score: r.score
    }));

  } catch (error) {
    console.error(
      "Qdrant search error:",
      error.response?.data?.status?.error || error.message
    );
    return [];
  }
}

// ─────────────────────────────────────────
// BUILD CONTEXT FROM SEARCH RESULTS
// ─────────────────────────────────────────
function buildContext(searchResults) {
  if (!searchResults || searchResults.length === 0) {
    return "No specific NCERT content found. Use general CBSE curriculum knowledge.";
  }
  return searchResults
    .map(r => `[Topic: ${r.topic}]\n${r.text}`)
    .join("\n\n---\n\n");
}

// ─────────────────────────────────────────
// HASH FUNCTION
// ─────────────────────────────────────────
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

module.exports = {
  initializeCollection,
  storeChunk,
  searchNCERT,
  buildContext,
  generateSimpleEmbedding
};
