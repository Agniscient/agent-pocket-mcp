# agent-pocket-mcp

MCP server for Agent Pocket — a human-in-the-loop approval bridge for AI coding agents.

Gives your AI agent (Cursor, Windsurf, Claude Code, Copilot, Cline) a set of tools to pause and ask you for approval, answers, or manual steps before taking risky actions — all routed through the Agent Pocket dashboard.

---

## How it works

```
AI Agent  ──(MCP tool call)──▶  agent-pocket-mcp  ──(HTTP)──▶  Agent Pocket server
                                                                        │
                                                              You approve / answer
                                                              in the dashboard / PWA
```

1. The AI calls a tool like `request_approval("Deploy to production?")`.
2. The MCP server forwards the request to your Agent Pocket server.
3. You see a notification in the dashboard and approve or reject.
4. The AI receives the result and continues (or aborts).

---

## Prerequisites

- **Node.js** 18+
- An **Agent Pocket** account with a running server instance  
  (hosted at `https://agent-from-pocket-production.up.railway.app`)
- Your **API key** from the Agent Pocket dashboard

---

## Getting Your API Key

1. Open the dashboard at `https://agent-from-pocket-production.up.railway.app`
2. Sign in (or create an account via email OTP)
3. Click the **Settings** tab (gear icon in the sidebar)
4. Find the **Your API Key** panel
5. Click the eye icon to reveal your key, then the copy icon to copy it

> If you haven't generated a key yet, click **Regenerate** to create one.

Use this key as `APPROVAL_API_KEY` in your MCP config or `.env` file.

---

## Installation

### Option 1 — npx (no install)

```json
{
  "mcpServers": {
    "agent-pocket": {
      "command": "npx",
      "args": ["-y", "agent-pocket-mcp"],
      "env": {
        "APPROVAL_SERVER_URL": "https://agent-from-pocket-production.up.railway.app",
        "APPROVAL_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Option 2 — global install

```bash
npm install -g agent-pocket-mcp
```

Then reference `agent-pocket-mcp` as the command instead of `npx … agent-pocket-mcp`.

### Option 3 — Remote SSE / Streamable-HTTP (no local install)

The hosted server exposes a remote MCP endpoint directly. Use this if you prefer not to run a local process — no npm install required.

- **Streamable HTTP (modern):** `https://agent-from-pocket-production.up.railway.app/mcp`
- **Legacy SSE (older clients):** `https://agent-from-pocket-production.up.railway.app/mcp/sse`

Pass your API key via the `x-api-key` header or `?apiKey=` query param.

---

## Configuration

All configuration is via environment variables (or a `.env` file in the project root).

| Variable | Required | Default | Description |
|---|---|---|---|
| `APPROVAL_SERVER_URL` | Yes | `http://localhost:3847` | Base URL of your Agent Pocket server |
| `APPROVAL_API_KEY` | Yes* | — | API key from the Agent Pocket dashboard (*required for agent polling tools) |
| `APPROVAL_TIMEOUT_SEC` | No | unlimited | Seconds before a pending request auto-times-out |

### `.env` example

```env
APPROVAL_SERVER_URL=https://agent-from-pocket-production.up.railway.app
APPROVAL_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
APPROVAL_TIMEOUT_SEC=300
```

---

## IDE Setup

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project-level):

```json
{
  "mcpServers": {
    "agent-pocket": {
      "command": "npx",
      "args": ["-y", "agent-pocket-mcp"],
      "env": {
        "APPROVAL_SERVER_URL": "https://agent-from-pocket-production.up.railway.app",
        "APPROVAL_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "agent-pocket": {
      "command": "npx",
      "args": ["-y", "agent-pocket-mcp"],
      "env": {
        "APPROVAL_SERVER_URL": "https://agent-from-pocket-production.up.railway.app",
        "APPROVAL_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Claude Code

Add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "agent-pocket": {
      "command": "npx",
      "args": ["-y", "agent-pocket-mcp"],
      "env": {
        "APPROVAL_SERVER_URL": "https://agent-from-pocket-production.up.railway.app",
        "APPROVAL_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cline (VS Code extension)

Open Cline settings → MCP Servers → Add Server:

```json
{
  "agent-pocket": {
    "command": "npx",
    "args": ["-y", "agent-pocket-mcp"],
    "env": {
      "APPROVAL_SERVER_URL": "https://agent-from-pocket-production.up.railway.app",
      "APPROVAL_API_KEY": "your-api-key"
    }
  }
}
```

### Using the Remote SSE / Streamable-HTTP Endpoint

For IDEs that support remote MCP servers (no local process), use a `url`-based config instead of `command`/`args`.

#### Cursor

```json
{
  "mcpServers": {
    "agent-pocket": {
      "url": "https://agent-from-pocket-production.up.railway.app/mcp",
      "headers": {
        "x-api-key": "your-api-key"
      }
    }
  }
}
```

#### Windsurf

```json
{
  "mcpServers": {
    "agent-pocket": {
      "serverUrl": "https://agent-from-pocket-production.up.railway.app/mcp/sse",
      "headers": {
        "x-api-key": "your-api-key"
      }
    }
  }
}
```

#### Claude Code / Cline

```json
{
  "mcpServers": {
    "agent-pocket": {
      "url": "https://agent-from-pocket-production.up.railway.app/mcp",
      "headers": {
        "x-api-key": "your-api-key"
      }
    }
  }
}
```

> **Tip:** If your IDE does not support `headers` in the MCP config, append `?apiKey=your-api-key` to the URL instead.

---

## Injecting Rules into Your Project

Once the MCP server is connected, ask your AI agent to run:

```
Use init_pocket_agent to set up Agent Pocket rules in this project.
```

This writes the approval/question/notify rules into your IDE's agent config files (`.cursor/rules/`, `.windsurf/rules/`, `.claude/rules/`, etc.) so the AI knows when to call each tool.

For **agent task polling** (letting you assign tasks to idle agents from the dashboard), also run:

```
Use init_agent_polling to set up polling rules in this project.
```

---

## Available Tools

### `request_approval`
Blocks the agent and asks you to approve or reject an action.

```
Returns: "approved" | "rejected"
```

Use before: running shell commands, deploying, deleting files, making API calls with side effects.

### `ask_question`
Asks you a clarifying question and waits for your text answer.

```
Returns: your answer string
```

Use when: requirements are ambiguous, a decision depends on your preference, or credentials are missing.

### `request_manual_step`
Asks you to perform a step the agent cannot do (click a button, enter a CAPTCHA, etc.) and waits until you mark it done or skip.

```
Returns: "done" | "skipped"
```

### `notify`
Sends a non-blocking notification to your dashboard. Does **not** wait for a response.

```
Returns: immediately
```

Use for: build complete, tests passed, long task milestones.

### `init_pocket_agent`
Writes human-in-the-loop approval rules into the project's agent config files.

```
Arguments: project_path? (default: cwd), targets? (cursor | windsurf | claude | copilot | cline)
```

### `init_agent_polling`
Writes task-polling rules into the project's agent config files (for agent tabs that wait for tasks).

```
Arguments: project_path? (default: cwd), targets? (cursor | windsurf | claude | copilot | cline)
```

### `register_as_agent`
Registers this IDE tab as a named agent in the Agent Pocket dashboard.

```
Returns: { agentId, name }
```

### `poll_for_task`
Blocks until a task is assigned to this agent from the dashboard, then returns it.

```
Arguments: agentId (required)
Returns: { id, title, description } | { terminated: true }
```

### `complete_task`
Marks the current task as done.

```
Arguments: taskId (required)
Returns: { ok: true, task }
```

---

## Agent Task Polling (advanced)

You can use Agent Pocket as a task queue — assign work to idle AI agent tabs from the dashboard without switching to your IDE.

**Setup:**

1. Ask your agent: `Use register_as_agent to register this tab.`
2. Ask your agent: `Use init_agent_polling to set up polling rules.`
3. The agent will then automatically call `poll_for_task` when idle and `complete_task` when done.

**Assign a task** from the Agent Pocket dashboard → Agents panel → select tab → assign task.

---

## Server

The Agent Pocket server is hosted at:

```
https://agent-from-pocket-production.up.railway.app/
```

> **Note:** This URL is subject to change.

---

## License

MIT
