/**
 * Webhook flow tests
 * Mocks DynamoDB, SQS, and WhatsApp utils so no real AWS calls are made.
 */

// ─── Mock AWS SDK clients ────────────────────────────────────────────────────

const mockDynamoSend = jest.fn();
const mockSqsSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient:  jest.fn(() => ({ send: mockDynamoSend })),
  GetItemCommand:  jest.fn(input => ({ _name: "GetItem", ...input })),
  PutItemCommand:  jest.fn(input => ({ _name: "PutItem", ...input })),
  UpdateItemCommand: jest.fn(input => ({ _name: "UpdateItem", ...input })),
}));

jest.mock("@aws-sdk/client-sqs", () => ({
  SQSClient:          jest.fn(() => ({ send: mockSqsSend })),
  SendMessageCommand: jest.fn(input => ({ _name: "SendMessage", ...input })),
}));

// ─── Mock WhatsApp utils ─────────────────────────────────────────────────────

const mockSendMessage  = jest.fn().mockResolvedValue({});
const mockSendButtons  = jest.fn().mockResolvedValue({});
const mockSendList     = jest.fn().mockResolvedValue({});

jest.mock("../src/utils/whatsapp", () => ({
  sendMessage:  mockSendMessage,
  sendButtons:  mockSendButtons,
  sendList:     mockSendList,
}));

// ─── Mock payments ───────────────────────────────────────────────────────────

const mockCheckSubscription = jest.fn();
const mockGetBlockMessage   = jest.fn().mockReturnValue("blocked message");
const mockGetPlanStatus     = jest.fn().mockResolvedValue("plan status message");
const mockSendUpgradeMessage = jest.fn().mockResolvedValue({});

jest.mock("../src/utils/payments", () => ({
  checkSubscription:   mockCheckSubscription,
  getBlockMessage:     mockGetBlockMessage,
  getPlanStatus:       mockGetPlanStatus,
  sendUpgradeMessage:  mockSendUpgradeMessage,
}));

// ─── Load handler under test ─────────────────────────────────────────────────

const { handler } = require("../src/lambdas/webhook");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PHONE = "919876543210";

function makeEvent(messageText, interactiveId = null) {
  const message = interactiveId
    ? {
        from: PHONE,
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: interactiveId, title: messageText },
        },
      }
    : { from: PHONE, type: "text", text: { body: messageText } };

  return {
    requestContext: { http: { method: "POST" } },
    body: JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messages: [message],
          },
        }],
      }],
    }),
  };
}

function makeListReplyEvent(id, title) {
  return {
    requestContext: { http: { method: "POST" } },
    body: JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: PHONE,
              type: "interactive",
              interactive: {
                type: "list_reply",
                list_reply: { id, title },
              },
            }],
          },
        }],
      }],
    }),
  };
}

// Teacher record shape stored in DynamoDB
function makeTeacher(overrides = {}) {
  return {
    phone:                { S: PHONE },
    plan:                 { S: "trial" },
    generationsThisMonth: { N: "0" },
    conversationStep:     { S: "idle" },
    conversationSession:  { S: "{}" },
    joinedDate:           { S: new Date().toISOString() },
    lastActive:           { S: new Date().toISOString() },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockSqsSend.mockResolvedValue({});
  mockDynamoSend.mockResolvedValue({});
});

// ── GET verification ──────────────────────────────────────────────────────────

describe("GET /webhook verification", () => {
  it("returns challenge on correct verify token", async () => {
    process.env.VERIFY_TOKEN = "adira_secret_2026";
    const event = {
      requestContext: { http: { method: "GET" } },
      queryStringParameters: {
        "hub.verify_token": "adira_secret_2026",
        "hub.challenge": "abc123",
      },
    };
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("abc123");
  });

  it("returns 403 on wrong verify token", async () => {
    const event = {
      requestContext: { http: { method: "GET" } },
      queryStringParameters: {
        "hub.verify_token": "wrong_token",
        "hub.challenge": "abc123",
      },
    };
    const res = await handler(event);
    expect(res.statusCode).toBe(403);
  });
});

// ── New teacher registration ──────────────────────────────────────────────────

describe("New teacher registration", () => {
  it("registers new teacher and sends welcome + doc type menu", async () => {
    // DynamoDB returns no item for GetItem → new teacher
    mockDynamoSend.mockResolvedValueOnce({ Item: null });

    const res = await handler(makeEvent("hi"));
    expect(res.statusCode).toBe(200);

    // Should have called PutItem to register
    const calls = mockDynamoSend.mock.calls.map(c => c[0]._name);
    expect(calls).toContain("PutItem");

    // Should have sent welcome message and buttons
    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendButtons).toHaveBeenCalled();
  });
});

// ── Always-available commands ────────────────────────────────────────────────

describe("Always-available commands", () => {
  it("sends plan status on 'my plan'", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: makeTeacher() });
    await handler(makeEvent("my plan"));
    expect(mockGetPlanStatus).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(PHONE, "plan status message");
  });

  it("sends upgrade message on 'upgrade basic'", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: makeTeacher() });
    await handler(makeEvent("upgrade basic"));
    expect(mockSendUpgradeMessage).toHaveBeenCalledWith(PHONE, "basic");
  });

  it("sends upgrade message on 'upgrade pro'", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: makeTeacher() });
    await handler(makeEvent("upgrade pro"));
    expect(mockSendUpgradeMessage).toHaveBeenCalledWith(PHONE, "pro");
  });

  it("acknowledges 'payment done'", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: makeTeacher() });
    await handler(makeEvent("payment done"));
    expect(mockSendMessage).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining("Payment Received")
    );
  });
});

// ── Step 1: Doc type selection ────────────────────────────────────────────────

describe("Step 1 — doc type selection", () => {
  it("shows doc type menu on 'hi'", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: makeTeacher() });
    await handler(makeEvent("hi"));
    expect(mockSendButtons).toHaveBeenCalled();
    const args = mockSendButtons.mock.calls[0];
    expect(args[0]).toBe(PHONE);
    expect(args[2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "doc_worksheet" }),
        expect.objectContaining({ id: "doc_lesson_plan" }),
        expect.objectContaining({ id: "doc_question_paper" }),
      ])
    );
  });

  it("advances to subject menu on valid doc type button", async () => {
    mockDynamoSend
      .mockResolvedValueOnce({ Item: makeTeacher({ conversationStep: { S: "awaiting_doc_type" } }) })
      .mockResolvedValue({});

    await handler(makeEvent("📋 Worksheet", "doc_worksheet"));

    // Should save step to awaiting_subject and send subject buttons
    const updateCall = mockDynamoSend.mock.calls.find(c => c[0]._name === "UpdateItem");
    expect(updateCall).toBeDefined();
    expect(mockSendButtons).toHaveBeenCalled();
  });

  it("reshows doc type menu on unrecognised reply", async () => {
    mockDynamoSend
      .mockResolvedValueOnce({ Item: makeTeacher({ conversationStep: { S: "awaiting_doc_type" } }) })
      .mockResolvedValue({});

    await handler(makeEvent("gibberish"));
    expect(mockSendButtons).toHaveBeenCalled();
  });
});

// ── Step 2: Subject selection ────────────────────────────────────────────────

describe("Step 2 — subject selection", () => {
  it("advances to topic list on valid subject", async () => {
    mockDynamoSend
      .mockResolvedValueOnce({
        Item: makeTeacher({
          conversationStep:    { S: "awaiting_subject" },
          conversationSession: { S: JSON.stringify({ docType: "Worksheet" }) },
        }),
      })
      .mockResolvedValue({});

    await handler(makeEvent("Science", "subject_science"));

    // Should send a list (topics)
    expect(mockSendList).toHaveBeenCalled();
  });

  it("reshows subject menu on unrecognised subject", async () => {
    mockDynamoSend
      .mockResolvedValueOnce({
        Item: makeTeacher({
          conversationStep:    { S: "awaiting_subject" },
          conversationSession: { S: JSON.stringify({ docType: "Worksheet" }) },
        }),
      })
      .mockResolvedValue({});

    await handler(makeEvent("Klingon", "subject_klingon"));

    expect(mockSendMessage).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining("not recognised")
    );
    expect(mockSendButtons).toHaveBeenCalled(); // reshows subject menu
  });
});

// ── Step 3: Topic selection ──────────────────────────────────────────────────

describe("Step 3 — topic selection", () => {
  it("advances to difficulty menu on valid topic", async () => {
    mockDynamoSend
      .mockResolvedValueOnce({
        Item: makeTeacher({
          conversationStep:    { S: "awaiting_topic" },
          conversationSession: { S: JSON.stringify({ docType: "Worksheet", subject: "science" }) },
        }),
      })
      .mockResolvedValue({});

    await handler(makeListReplyEvent("topic_photosynthesis", "Photosynthesis"));

    expect(mockSendButtons).toHaveBeenCalled();
    const args = mockSendButtons.mock.calls[0];
    expect(args[2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "diff_beginner" }),
        expect.objectContaining({ id: "diff_intermediate" }),
        expect.objectContaining({ id: "diff_advanced" }),
      ])
    );
  });

  it("reshows topic list on invalid topic id", async () => {
    mockDynamoSend
      .mockResolvedValueOnce({
        Item: makeTeacher({
          conversationStep:    { S: "awaiting_topic" },
          conversationSession: { S: JSON.stringify({ docType: "Worksheet", subject: "science" }) },
        }),
      })
      .mockResolvedValue({});

    await handler(makeListReplyEvent("topic_invented_topic", "Invented Topic"));

    expect(mockSendMessage).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining("not recognised")
    );
    expect(mockSendList).toHaveBeenCalled(); // reshows topic list
  });
});

// ── Step 4: Difficulty selection ─────────────────────────────────────────────

describe("Step 4 — difficulty selection", () => {
  it("advances to confirm menu on valid difficulty", async () => {
    mockDynamoSend
      .mockResolvedValueOnce({
        Item: makeTeacher({
          conversationStep:    { S: "awaiting_difficulty" },
          conversationSession: { S: JSON.stringify({ docType: "Worksheet", subject: "science", topicId: "photosynthesis" }) },
        }),
      })
      .mockResolvedValue({});

    await handler(makeEvent("🟡 Intermediate", "diff_intermediate"));

    expect(mockSendButtons).toHaveBeenCalled();
    const args = mockSendButtons.mock.calls[0];
    expect(args[2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "confirm_yes" }),
        expect.objectContaining({ id: "confirm_no" }),
      ])
    );
  });
});

// ── Step 5: Confirm and generate ─────────────────────────────────────────────

describe("Step 5 — confirm and generate", () => {
  const session = {
    docType: "Worksheet",
    subject: "science",
    topicId: "photosynthesis",
    difficulty: "intermediate",
  };

  it("queues SQS job on confirm_yes with active subscription", async () => {
    mockCheckSubscription.mockResolvedValueOnce({ allowed: true, plan: "trial", remaining: 4 });
    mockDynamoSend
      .mockResolvedValueOnce({
        Item: makeTeacher({
          conversationStep:    { S: "awaiting_confirm" },
          conversationSession: { S: JSON.stringify(session) },
        }),
      })
      .mockResolvedValue({});

    await handler(makeEvent("✅ Yes, generate!", "confirm_yes"));

    expect(mockSqsSend).toHaveBeenCalledTimes(1);
    const sqsArg = mockSqsSend.mock.calls[0][0];
    const body = JSON.parse(sqsArg.MessageBody);
    expect(body.intent.task).toBe("Worksheet");
    expect(body.intent.subject).toBe("science");
    expect(body.intent.topicId).toBe("photosynthesis");
    expect(body.intent.difficulty).toBe("intermediate");
    expect(body.teacherPhone).toBe(PHONE);
  });

  it("blocks generation and shows upgrade message when subscription denied", async () => {
    mockCheckSubscription.mockResolvedValueOnce({ allowed: false, reason: "trial_expired", plan: "trial" });
    mockDynamoSend
      .mockResolvedValueOnce({
        Item: makeTeacher({
          conversationStep:    { S: "awaiting_confirm" },
          conversationSession: { S: JSON.stringify(session) },
        }),
      })
      .mockResolvedValue({});

    await handler(makeEvent("✅ Yes, generate!", "confirm_yes"));

    expect(mockSqsSend).not.toHaveBeenCalled();
    expect(mockGetBlockMessage).toHaveBeenCalledWith("trial_expired", "trial");
    expect(mockSendMessage).toHaveBeenCalledWith(PHONE, "blocked message");
  });

  it("restarts flow on confirm_no", async () => {
    mockDynamoSend
      .mockResolvedValueOnce({
        Item: makeTeacher({
          conversationStep:    { S: "awaiting_confirm" },
          conversationSession: { S: JSON.stringify(session) },
        }),
      })
      .mockResolvedValue({});

    await handler(makeEvent("🔄 Start over", "confirm_no"));

    expect(mockSqsSend).not.toHaveBeenCalled();
    expect(mockSendButtons).toHaveBeenCalled(); // doc type menu shown again
  });
});

// ── Full happy path ───────────────────────────────────────────────────────────

describe("Full happy path (existing teacher, trial plan)", () => {
  it("routes correctly through each step in sequence", async () => {
    // Step 1: hi → show doc type menu
    mockDynamoSend.mockResolvedValueOnce({ Item: makeTeacher() }).mockResolvedValue({});
    await handler(makeEvent("hi"));
    expect(mockSendButtons).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    mockDynamoSend.mockResolvedValue({});

    // Step 2: pick worksheet
    mockDynamoSend
      .mockResolvedValueOnce({ Item: makeTeacher({ conversationStep: { S: "awaiting_doc_type" } }) })
      .mockResolvedValue({});
    await handler(makeEvent("📋 Worksheet", "doc_worksheet"));
    expect(mockSendButtons).toHaveBeenCalledTimes(1); // subject menu

    jest.clearAllMocks();

    // Step 3: pick science
    mockDynamoSend
      .mockResolvedValueOnce({
        Item: makeTeacher({
          conversationStep:    { S: "awaiting_subject" },
          conversationSession: { S: JSON.stringify({ docType: "Worksheet" }) },
        }),
      })
      .mockResolvedValue({});
    await handler(makeEvent("Science", "subject_science"));
    expect(mockSendList).toHaveBeenCalledTimes(1); // topic list

    jest.clearAllMocks();

    // Step 4: pick topic
    mockDynamoSend
      .mockResolvedValueOnce({
        Item: makeTeacher({
          conversationStep:    { S: "awaiting_topic" },
          conversationSession: { S: JSON.stringify({ docType: "Worksheet", subject: "science" }) },
        }),
      })
      .mockResolvedValue({});
    await handler(makeListReplyEvent("topic_photosynthesis", "Photosynthesis"));
    expect(mockSendButtons).toHaveBeenCalledTimes(1); // difficulty menu

    jest.clearAllMocks();

    // Step 5: pick difficulty
    mockDynamoSend
      .mockResolvedValueOnce({
        Item: makeTeacher({
          conversationStep:    { S: "awaiting_difficulty" },
          conversationSession: { S: JSON.stringify({ docType: "Worksheet", subject: "science", topicId: "photosynthesis" }) },
        }),
      })
      .mockResolvedValue({});
    await handler(makeEvent("🟡 Intermediate", "diff_intermediate"));
    expect(mockSendButtons).toHaveBeenCalledTimes(1); // confirm menu

    jest.clearAllMocks();

    // Step 6: confirm
    mockCheckSubscription.mockResolvedValueOnce({ allowed: true, plan: "trial", remaining: 4 });
    mockDynamoSend
      .mockResolvedValueOnce({
        Item: makeTeacher({
          conversationStep:    { S: "awaiting_confirm" },
          conversationSession: { S: JSON.stringify({ docType: "Worksheet", subject: "science", topicId: "photosynthesis", difficulty: "intermediate" }) },
        }),
      })
      .mockResolvedValue({});
    mockSqsSend.mockResolvedValue({});

    await handler(makeEvent("✅ Yes, generate!", "confirm_yes"));
    expect(mockSqsSend).toHaveBeenCalledTimes(1);
  });
});
