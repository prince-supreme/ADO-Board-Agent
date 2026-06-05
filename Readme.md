# Azure DevOps Agent Project

This project provides a complete Azure DevOps assistant with:

- A FastAPI backend that uses an LLM plus tool calls to perform real Azure DevOps work item operations.
- A responsive frontend chat UI for interacting with the assistant.
- Export support for structured outputs in JSON, TXT, CSV, and Excel (XLSX).

The assistant supports Epics, Features, User Stories, Bugs, and Tasks, including create, read, update, delete/restore, hierarchy linking, state transitions, tagging, comments, and hierarchy reporting.

## Project Structure

```text
Ado-Agent/
|-- backend/
|   |-- main.py
|   `-- requirements.txt
|-- frontend/
|   |-- index.html
|   |-- app.js
|   `-- style.css
|-- input_output/
|   `-- main.py
|-- output_files/
|-- .env
`-- Readme.md
```

## Tech Stack

- Backend: FastAPI, LangGraph, Anthropic SDK, Requests, OpenPyXL
- Frontend: Vanilla HTML/CSS/JavaScript
- Integrations: Azure DevOps Work Item Tracking REST APIs, Anthropic-compatible proxy endpoint

## Features

- Conversational management of Azure DevOps work items.
- Tool-backed operations with server-side validation (not text-only responses).
- Parent/child hierarchy linking and unlinking.
- Work item state transitions with optional reason/comment.
- Tag add/remove/replace/normalize workflows.
- Comment posting to work items.
- Child and hierarchy reporting via structured rows.
- File export support:
	- `.json` (API JSON response)
	- `.txt`
	- `.csv`
	- `.xlsx`
- Health and debug endpoints.
- Frontend chat history persisted in browser localStorage.

## Prerequisites

- Python 3.10+
- Azure DevOps organization, project, and Personal Access Token (PAT)
- Access to the Anthropic-compatible proxy endpoint used by your environment

## Environment Variables

Create or update `.env` at the project root with values required by `backend/main.py`.

Required:

- `TENANT_KEY`
- `ADO_ORG`
- `ADO_PROJECT`
- `PAT`

Common optional variables (with defaults in code):

- `LLM_MODEL` (default: `anthropic-claude-sonnet-4-5-20250929_IrishConsolidation`)
- `TEMPERATURE` (default: `0`)
- `MAX_TOKENS_TO_SAMPLE` (default: `18000`)
- `ASSET_ID` (default: empty)
- `USER_TYPE` (default: `machine`)
- `ADO_API_VERSION` (default: `7.0`)
- `ADO_COMMENTS_API_VERSION` (default: `7.0-preview.3`)
- `CHAT_HISTORY_WINDOW` (default: `8`)
- `DEFAULT_ITERATION_PATH`
- `DEFAULT_SPRINT`
- `DEFAULT_AREA_PATH`
- `ALLOWED_PROJECTS` (comma-separated allowlist)

Notes:

- `DEFAULT_AREA_PATH` may include `{project_name}` placeholder.
- User Story creation accepts either `feature_id` or `project_name`.

## Backend Setup and Run

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload 
```

Backend will run at:

- `http://localhost:8000`

Useful endpoints:

- `GET /health` -> service health
- `POST /chat` -> main assistant endpoint
- `GET /debug/relations/{work_item_id}` -> raw relation debug helper

## Frontend Setup and Run

The frontend is static and expects backend at `http://localhost:8000/chat` by default.

Option 1 (recommended for local dev):

```powershell
cd frontend
python -m http.server 5500
```

Open:

- `http://localhost:5500`

Option 2:

- Open `frontend/index.html` directly in a browser (works for most cases), but a local static server is preferred.

API URL override in browser:

- The frontend uses localStorage key `adoAgent.apiUrl`.
- If needed, set it in browser console:

```js
localStorage.setItem('adoAgent.apiUrl', 'http://localhost:8000/chat');
```

## API Usage

### Chat Request

`POST /chat`

```json
{
	"messages": [
		{"role": "user", "content": "Create a task under story 123 with title Implement validation"}
	],
	"output_format": "json"
}
```

`output_format` is optional. Supported values:

- `json`
- `txt`
- `csv`
- `xlsx`

If `output_format` is omitted, backend auto-detects requested export format from user text; otherwise it returns regular JSON response.

### Example cURL

```bash
curl -X POST http://localhost:8000/chat \
	-H "Content-Type: application/json" \
	-d '{
		"messages": [
			{"role": "user", "content": "Get complete hierarchy for epic 123"}
		]
	}'
```

## Supported Workflows

- Epic: create, get, update, delete/restore/permanent-delete
- Feature: create, get, update (including parent relink), delete/restore/permanent-delete
- User Story: create/get/update/delete with aliases and defaults
- Bug: create/get/update/delete
- Task: create/get/update/delete with inherited area/iteration from parent User Story
- Linking: parent/dependency/related links (link + unlink)
- State transitions: with optional reason and comment
- Tags: add/remove/replace/normalize
- Comments: add discussion comments
- Reports: children/hierarchy data for export or chat display

## Frontend Capabilities

- Quick action chips for common prompts
- Output format selector (Chat, Excel, CSV, TXT, JSON)
- Sidebar sections and chat history
- Theme toggle (light/dark)
- Responsive mobile sidebar
- Copy action on each message

## Troubleshooting

- Backend shows offline in UI:
	- Ensure FastAPI is running at `http://localhost:8000`.
	- Verify CORS/network access and firewall rules.
- 401/403 from Azure DevOps:
	- Validate `PAT`, `ADO_ORG`, and `ADO_PROJECT`.
	- Ensure PAT scope includes work item read/write/comment operations.
- LLM/API failures:
	- Check `TENANT_KEY`, proxy URL reachability, and related headers (`ASSET_ID`, `USER_TYPE` if required).
- Empty or unexpected report files:
	- Confirm the request references a valid work item ID.
	- Use recursive mode for full hierarchy requests.

## Development Notes

- The backend includes guardrails to prevent false success confirmations if mutation tools were not actually executed.
- Mutating operations may trigger verification snapshots of updated items.
- Export generation is stream-based for CSV/TXT/XLSX downloads.

## Future Enhancements

- Add authentication for frontend access.
- Add role-based authorization for operation types.
- Add automated tests for tool handlers and export paths.
- Add deployment manifests (Docker/Compose) for easier environment setup.


