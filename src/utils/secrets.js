const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
require("dotenv").config();

// This connects to AWS Secrets Manager in Mumbai
const client = new SecretsManagerClient({ 
  region: process.env.AWS_REGION || "ap-south-1" 
});

// Cache secrets so we don't fetch from AWS on every request
// Think of it like remembering the keys instead of going to the vault every time
let cachedSecrets = null;

async function getSecrets() {
  // If we already fetched secrets, return them from memory
  if (cachedSecrets) return cachedSecrets;

  try {
    const command = new GetSecretValueCommand({ 
      SecretId: "adira/api-keys" 
    });
    
    const response = await client.send(command);
    cachedSecrets = JSON.parse(response.SecretString);
    
    console.log("✅ Secrets fetched successfully from AWS");
    return cachedSecrets;
    
  } catch (error) {
    console.error("❌ Error fetching secrets:", error.message);
    
    // During local development, fall back to .env file
    console.log("⚠️ Falling back to .env file for local development");
    cachedSecrets = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      QDRANT_API_KEY: process.env.QDRANT_API_KEY,
      QDRANT_URL: process.env.QDRANT_URL,
      WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    };
    return cachedSecrets;
  }
}

module.exports = { getSecrets };