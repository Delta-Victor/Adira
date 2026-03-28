const axios = require("axios");
const { getSecrets } = require("./secrets");
require("dotenv").config();

// Send a simple text message to a teacher
async function sendMessage(to, message) {
  const secrets = await getSecrets();
  const token = secrets.WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN;
  const phoneNumberId = secrets.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log(`✅ Message sent to ${to}`);
  } catch (error) {
    console.error(`❌ Failed to send message to ${to}:`, error.message);
  }
}

// Send a PDF document to a teacher
async function sendDocument(to, fileUrl, filename, caption) {
  const secrets = await getSecrets();
  const token = secrets.WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN;
  const phoneNumberId = secrets.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "document",
        document: {
          link: fileUrl,
          filename: filename,
          caption: caption
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log(`✅ Document sent to ${to}`);
  } catch (error) {
    console.error(`❌ Failed to send document to ${to}:`, error.message);
  }
}

// Send quick reply buttons to teacher
// Example: [Try Again] [Change Class] [Help]
async function sendButtons(to, bodyText, buttons) {
  const secrets = await getSecrets();
  const token = secrets.WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN;
  const phoneNumberId = secrets.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: bodyText },
          action: {
            buttons: buttons.map((btn, i) => ({
              type: "reply",
              reply: { id: `btn_${i}`, title: btn }
            }))
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log(`✅ Buttons sent to ${to}`);
  } catch (error) {
    console.error(`❌ Failed to send buttons to ${to}:`, error.message);
  }
}

module.exports = { sendMessage, sendDocument, sendButtons };