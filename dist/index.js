#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_SERVER_PORT = 3847;
config({ path: new URL("../../.env", import.meta.url).pathname });
const SERVER_URL = process.env.APPROVAL_SERVER_URL ||
    `http://localhost:${process.env.PORT || DEFAULT_SERVER_PORT}`;
const API_KEY = process.env.APPROVAL_API_KEY || "";
function headers() {
    const h = { "Content-Type": "application/json" };
    if (API_KEY)
        h["x-api-key"] = API_KEY;
    return h;
}
async function createApproval(type, message, context) {
    const res = await fetch(`${SERVER_URL}/api/approvals`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ type, message, context }),
    });
    if (!res.ok)
        throw new Error(`Server error: ${res.status} ${await res.text()}`);
    return res.json();
}
async function pollApproval(id) {
    while (true) {
        const res = await fetch(`${SERVER_URL}/api/approvals/${id}`, {
            headers: headers(),
        });
        if (!res.ok)
            throw new Error(`Poll error: ${res.status}`);
        const approval = await res.json();
        if (approval.status !== "pending")
            return approval;
        await new Promise((r) => setTimeout(r, DEFAULT_POLL_INTERVAL_MS));
    }
}
const server = new Server({ name: "agent-pocket", version: "1.0.0" }, { capabilities: { tools: {} } });
const AGENT_TARGETS = {
    cursor: { file: ".cursor/rules/agent-pocket.md", description: "Cursor IDE" },
    windsurf: { file: ".windsurf/rules/agent-pocket.md", description: "Windsurf IDE" },
    claude: { file: ".claude/rules/agent-pocket.md", description: "Claude Code" },
    copilot: {
        file: ".github/copilot-instructions.md",
        description: "GitHub Copilot",
    },
    cline: { file: ".cline/rules/agent-pocket.md", description: "Cline" },
};
const APPROVAL_RULES = `
## Agent Pocket: Human-in-the-Loop Tools

You have access to the following Agent Pocket tools for interacting with the user:

### \`request_approval\` — Destructive / irreversible actions
Call this and wait for \`approved\` before executing any of the following:
- Running shell or terminal commands
- Deleting, overwriting, or moving files
- Deploying to any environment
- Making API calls with side effects
- Modifying databases or data stores
- Sending emails, messages, or notifications
- Installing or removing packages
- Any action that cannot be easily undone

Do NOT proceed until it returns \`approved\`. If it returns \`rejected\`, abort and inform the user.

### \`ask_question\` — Clarifying questions
You MUST call this when any of the following are true:
- Requirements are ambiguous or underspecified
- A decision depends on user preference (e.g. naming, approach, environment)
- Required credentials, secrets, or config values are missing
- You are about to make a non-trivial assumption that could be wrong

Do NOT guess, infer, or proceed on assumptions. Call this and wait for the answer before continuing.

### \`request_manual_step\` — Steps you cannot perform
You MUST call this whenever the task requires any action you cannot execute, including:
- Clicking UI elements, buttons, or links in a browser or app
- Granting permissions, authorizing OAuth flows, or entering CAPTCHAs
- Physical actions (plugging in hardware, checking a device, etc.)
- Steps that require the user's credentials in a browser session

Do NOT skip the step, describe it in chat only, or continue before the user marks it \`done\` or \`skipped\`.

### \`notify\` — Non-blocking status updates
You MUST call this (instead of only writing in chat) to signal:
- Completion of a long-running or multi-step task
- A background process finishing (build, test run, deployment, etc.)
- Any meaningful milestone the user should be aware of

Call this proactively — do not rely solely on your final chat response to communicate completion.

### Before any git add / commit
Run git status first. If untracked or modified files appear that are unrelated to the current task,
call ask_question to confirm whether to include them before proceeding. Never use git add -A blindly.

### When multiple valid approaches exist
If there are two or more meaningfully different ways to implement something, call ask_question to let
the user choose — do not pick an approach silently.

### When you hit a repeated or unresolvable error
If the same error persists after 2 attempts, stop and call ask_question with the error details rather
than continuing to guess or retry.

### When a multi-step task finishes
After completing any task that involved 3+ steps or significant background work, call notify to signal
completion — even if you already wrote a summary in chat.

### When scope or target environment is unclear
Before making changes that could affect production, staging, or a specific environment, call ask_question
to confirm the target — never assume.

### Before any destructive data action
Before deleting, truncating, or irreversibly transforming data (files, DB rows, logs, build artifacts),
call request_approval even if the user's request implies it.
`.trim();
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "request_approval",
            description: "Ask the user to approve or reject an action. Blocks until they respond. " +
                "Returns 'approved' or 'rejected'.",
            inputSchema: {
                type: "object",
                properties: {
                    message: { type: "string", description: "Short action description, e.g. 'Deploy to production?'" },
                    context: { type: "string", description: "Optional extra detail (branch name, command, etc.)" },
                },
                required: ["message"],
            },
        },
        {
            name: "ask_question",
            description: "Ask the user a clarifying question and wait for their text answer. " +
                "Use when you need information only the user knows. Returns the answer string.",
            inputSchema: {
                type: "object",
                properties: {
                    message: { type: "string", description: "The question to ask (short, specific)" },
                    context: { type: "string", description: "Optional context for the question" },
                },
                required: ["message"],
            },
        },
        {
            name: "request_manual_step",
            description: "Ask the user to perform a manual step you cannot do (e.g. click a button, enter a CAPTCHA, pull a physical cable). " +
                "Blocks until they mark it done or skip. Returns 'done' or 'skipped'.",
            inputSchema: {
                type: "object",
                properties: {
                    message: { type: "string", description: "What the user needs to do (imperative, short)" },
                    context: { type: "string", description: "Optional extra instructions or URL" },
                },
                required: ["message"],
            },
        },
        {
            name: "notify",
            description: "Send a non-blocking informational notification to the user — e.g. 'Build complete' or 'Tests passed'. " +
                "Does NOT wait for a response. Returns immediately.",
            inputSchema: {
                type: "object",
                properties: {
                    message: { type: "string", description: "Short status message to display" },
                    context: { type: "string", description: "Optional extra detail" },
                },
                required: ["message"],
            },
        },
        {
            name: "init_pocket_agent",
            description: "Initialize Agent Pocket in a project by adding approval rules to AI agent config files. " +
                "Returns instructions for you (the agent) to create or append the rules to the appropriate files. " +
                "You MUST follow the returned instructions and create/edit the files as directed.",
            inputSchema: {
                type: "object",
                properties: {
                    project_path: {
                        type: "string",
                        description: "Absolute path to the project root. Defaults to the current working directory.",
                    },
                    targets: {
                        type: "array",
                        items: { type: "string" },
                        description: "Which agent config files to update. Options: cursor, windsurf, claude, copilot, cline. " +
                            "Defaults to all.",
                    },
                },
                required: [],
            },
        },
    ],
}));
const APPROVAL_SENTINELS = [
    "## Agent Pocket: Human Approval Required",
    "# Agent Pocket",
    "agent-pocket",
    "request_approval",
];
function applyRulesToFile(filePath, rules) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, "utf8");
        // Already up-to-date
        if (existing.includes(rules))
            return "skipped";
        // Find the earliest occurrence of any Agent Pocket marker
        const idx = APPROVAL_SENTINELS
            .map((s) => existing.indexOf(s))
            .filter((i) => i !== -1)
            .reduce((min, i) => Math.min(min, i), Infinity);
        if (idx !== Infinity) {
            // Replace everything from the existing Agent Pocket block onwards
            const before = existing.slice(0, idx).trimEnd();
            fs.writeFileSync(filePath, (before ? before + "\n\n" : "") + rules + "\n");
        }
        else {
            // No existing Agent Pocket content — append
            fs.writeFileSync(filePath, existing.trimEnd() + "\n\n" + rules + "\n");
        }
        return "updated";
    }
    else {
        fs.writeFileSync(filePath, rules + "\n");
        return "created";
    }
}
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "request_approval") {
        const { message, context } = request.params.arguments;
        try {
            const approval = await createApproval("approval", message, context);
            const result = await pollApproval(approval.id);
            return {
                content: [{ type: "text", text: result.status }],
            };
        }
        catch (err) {
            return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
        }
    }
    if (request.params.name === "ask_question") {
        const { message, context } = request.params.arguments;
        try {
            const approval = await createApproval("question", message, context);
            const result = await pollApproval(approval.id);
            if (result.status !== "answered" || !result.answer) {
                return { content: [{ type: "text", text: "No answer received" }], isError: true };
            }
            return { content: [{ type: "text", text: result.answer }] };
        }
        catch (err) {
            return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
        }
    }
    if (request.params.name === "request_manual_step") {
        const { message, context } = request.params.arguments;
        try {
            const approval = await createApproval("manual_step", message, context);
            const result = await pollApproval(approval.id);
            return { content: [{ type: "text", text: result.status }] };
        }
        catch (err) {
            return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
        }
    }
    if (request.params.name === "notify") {
        const { message, context } = request.params.arguments;
        try {
            await createApproval("info", message, context);
            return { content: [{ type: "text", text: "Notification sent" }] };
        }
        catch (err) {
            return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
        }
    }
    if (request.params.name === "init_pocket_agent") {
        const { project_path, targets } = request.params.arguments;
        const projectRoot = project_path || process.cwd();
        const selectedKeys = targets && targets.length > 0
            ? targets.filter((t) => t in AGENT_TARGETS)
            : Object.keys(AGENT_TARGETS);
        if (selectedKeys.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: "No valid targets specified. Valid options: " +
                            Object.keys(AGENT_TARGETS).join(", "),
                    },
                ],
                isError: true,
            };
        }
        // Fetch latest rules from server; fall back to local constant if unavailable
        let rules = APPROVAL_RULES;
        try {
            const res = await fetch(`${SERVER_URL}/api/rules`);
            if (res.ok)
                rules = await res.text();
        }
        catch {
            // offline or server unreachable — use bundled fallback
        }
        const results = [];
        for (const key of selectedKeys) {
            const { file, description } = AGENT_TARGETS[key];
            const filePath = path.join(projectRoot, file);
            try {
                const outcome = applyRulesToFile(filePath, rules);
                const label = outcome === "created"
                    ? "Created"
                    : outcome === "updated"
                        ? "Updated"
                        : "Already up-to-date (skipped)";
                results.push(`${label}: ${file} (${description})`);
            }
            catch (err) {
                results.push(`Error writing ${file}: ${err.message}`);
            }
        }
        return {
            content: [
                {
                    type: "text",
                    text: `Agent Pocket initialized in: ${projectRoot}\n\n` +
                        results.join("\n"),
                },
            ],
        };
    }
    return {
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
        isError: true,
    };
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Agent Pocket MCP server running on stdio");
}
main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map