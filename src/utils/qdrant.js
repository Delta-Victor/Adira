const { QdrantClient } = require("@qdrant/js-client-rest");
const Anthropic = require("@anthropic-ai/sdk");
const { getSecrets } = require("./secrets");
require("dotenv").config();

// Collection name in Qdrant — like a table name
const COLLECTION_NAME = "adira-ncert";

// Connect to Qdrant
async function getQdrantClient() {
  const secrets = await getSecrets();
  return new QdrantClient({
    url: secrets.QDRANT_URL || process.env.QDRANT_URL,
    apiKey: secrets.QDRANT_API_KEY || process.env.QDRANT_API_KEY,
  });
}

// Convert text into a vector (numerical representation)
// This is how we make text searchable by meaning
async function getEmbedding(text) {
  const secrets = await getSecrets();
  const anthropic = new Anthropic({
    apiKey: secrets.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  });

  // Use Claude to create embeddings
  // We send text, get back 1536 numbers that represent its meaning
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 100,
    messages: [{
      role: "user",
      content: `Convert this to a search query for CBSE NCERT content: ${text}`
    }]
  });

  // For now use a simple hash-based approach for embeddings
  // We will upgrade to proper embeddings in next step
  return generateSimpleEmbedding(text);
}

// Simple embedding generator for development
// Creates a 1536-dimension vector from text
function generateSimpleEmbedding(text) {
  const vector = new Array(1536).fill(0);
  for (let i = 0; i < text.length; i++) {
    vector[i % 1536] += text.charCodeAt(i) / 1000;
  }
  // Normalize the vector
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map(val => val / (magnitude || 1));
}

// Create the collection in Qdrant if it doesn't exist
async function initializeCollection() {
  const client = await getQdrantClient();
  
  try {
    await client.getCollection(COLLECTION_NAME);
    console.log("✅ Qdrant collection already exists");
  } catch {
    // Collection doesn't exist — create it
    await client.createCollection(COLLECTION_NAME, {
      vectors: { size: 1536, distance: "Cosine" }
    });
    console.log("✅ Qdrant collection created successfully");
  }
}

// Store a chunk of NCERT text in Qdrant
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

// Search for relevant NCERT content
// Given a teacher's request, find the most relevant chapters/topics
async function searchNCERT(query, classNum, subject, chapter, topK = 5) {
  const client = await getQdrantClient();
  const embedding = generateSimpleEmbedding(query);

  // Build filter — only search within the right class, subject, chapter
  const filter = {
    must: [
      { key: "class", match: { value: parseInt(classNum) } },
      { key: "subject", match: { value: subject.toLowerCase() } }
    ]
  };

  // Add chapter filter if provided
  if (chapter) {
    filter.must.push({ 
      key: "chapter", 
      match: { value: parseInt(chapter) } 
    });
  }

  const results = await client.search(COLLECTION_NAME, {
    vector: embedding,
    limit: topK,
    filter: filter,
    with_payload: true
  });

  // Return just the text chunks
  return results.map(r => ({
    topic: r.payload.topic,
    text: r.payload.text,
    score: r.score
  }));
}

// Build context string from search results
// This gets injected into Claude's prompt
function buildContext(searchResults) {
  if (!searchResults || searchResults.length === 0) {
    return "No specific NCERT content found. Use general CBSE curriculum knowledge.";
  }

  return searchResults
    .map(r => `[Topic: ${r.topic}]\n${r.text}`)
    .join("\n\n---\n\n");
}

// Simple string hash function
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