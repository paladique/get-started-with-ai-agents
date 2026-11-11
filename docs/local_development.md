# Fieldwork storefront — local development

The default application is a basic storefront with all 20 products from `src/files`, category filters, product search, sorting, details, a browser-local cart, and a demo order review. Checkout does not collect payments or create real orders. The two original documents with no price (SmartView Glasses and Self-Warming Blanket) appear as “Price on request” and cannot be added to the cart.

## Run the storefront

No Azure sign-in or agent configuration is needed for storefront mode. `ENABLE_AI_AGENT` defaults to `false`; leave it unset or false even if your `.env` contains old Azure settings.

From the repository root:

```sh
source .venv/bin/activate
pnpm --dir src/frontend install --frozen-lockfile
pnpm --dir src/frontend build
cd src
python -m uvicorn "api.main:create_app" --factory --reload
```

Open <http://127.0.0.1:8000>. For frontend-only development, run `pnpm --dir src/frontend dev` from the repository root and open its printed URL. The frontend uses the same catalog JSON as the backend's `/api/products` endpoint. Cart contents are stored in this browser only. Fonts are bundled locally, so loading the storefront does not require access to Google Fonts or another font CDN.

Catalog: `src/api/data/catalog.json`. The product illustrations are original SVGs in `src/frontend/src/components/storefront/ProductArt.tsx`; they represent product categories rather than manufacturer photography. Product names, brands, features, and available prices come from the Markdown/PDF product documents. The old embeddings CSV contains outdated products for items 1 and 2 and is not the storefront source.

### A reliable rehearsal sequence

1. In Fieldwork, click **Try the shopping assistant** or **Alex · Demo shopper**. Alex is the signed-in synthetic customer. Use the suggested requests to ask about the tent and update Alex's delivery address. The order card shows the result from the latest request.
2. Expand **Demo settings**, choose **Baseline**, and click **Help with a friend’s order**. FW-1002 belongs to Jamie, but the broad fixture tool changes its address. The assistant confirms the update without an outcome warning. Only the demo studio reveals the failed customer-isolation check.
3. Click **Inspect this run in demo studio**. The studio opens with the same conversation, selected result, trace ID, execution mode, and policy. **Trace** shows the actual tool call; **Evaluate** explains the failed business outcome. Jamie’s before/after address is visible in the studio's synthetic order evidence.
4. Use **Compare policies** to run the request against broad access and server-enforced ownership. Under **Guarded**, Jamie's order stays unchanged.
5. **Run all 4 requests** sends the product, own-order, out-of-scope, and unauthorized requests. **Monitor** includes the runs started in Fieldwork. Closing the studio keeps the conversation available in the shopping assistant; **Reset rehearsal** clears the shared history.

Both surfaces use the same `/api/demo/config` and `/api/demo/run` endpoints and conversation ID. The assistant offers the four presentation requests rather than a free-form chat input. Each run resets the synthetic order fixture; these updates are demonstrations, not persisted account changes or orders created by checkout. The studio stays directly accessible from **Open demo studio**.

Local replay uses scripted answers and zero model calls. Its OpenTelemetry spans, tool execution, timings, order changes, and deterministic rule checks are real local behavior. Checks are deliberately narrow regression assertions, not Foundry/Datadog evaluator scores or a complete security assessment. No chain-of-thought is displayed. Dollar cost is zero for replay; live dollar pricing is not configured and is never invented.

### Optional live Foundry mode

In the root `.env`, set:

```dotenv
ENABLE_LIVE_DEMO=true
AZURE_EXISTING_AIPROJECT_ENDPOINT=<your project endpoint>
AZURE_AI_AGENT_DEPLOYMENT_NAME=<your deployed model name>
```

Sign in with `az login`, restart Uvicorn, and select **Live · Azure Foundry**. This mode uses the existing deployed model through `AIProjectClient.get_openai_client()` and the Responses API with explicit local function tools. It does not create an agent version, modify an existing Foundry agent, require `AZURE_EXISTING_AGENT_ID`, or enable the legacy chat startup. Keep `ENABLE_AI_AGENT=false` unless you separately want those legacy APIs.

Live runs consume inference tokens. Each request permits at most four model calls with 2,200 output tokens per call and a 90-second application timeout. The UI displays actual returned token usage; a failed live request is surfaced as an error, never silently replaced by a replay. Live answers may vary, and a baseline model may refuse an unsafe action on its own; use replay when you need a guaranteed on-stage reproduction.

### Send traces to your observability platform

Export is opt-in and disabled by default. To use an existing OTLP/HTTP collector or a configured Datadog intake, set:

```dotenv
DEMO_EXPORT_TRACES=true
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://<your-collector>:4318/v1/traces
# Set OTEL_EXPORTER_OTLP_TRACES_HEADERS only if the receiver needs authentication.
```

Restart the server after changing exporter settings. The resource is `service.name=fieldwork-ignite-demo` with `dd_llmobs_enabled=true`. Root spans use `invoke_agent`, tool spans use `execute_tool`, and live model spans use `chat` with provider/model information, response ID, actual token counts, and synthetic prompt/answer content. Tool arguments and results are attached to tool spans. This follows [Datadog's documented OpenTelemetry Agent Observability mappings](https://docs.datadoghq.com/llm_observability/instrument/otel_instrumentation/). Configure collector forwarding or authenticated direct intake for your account; no remote ingestion has been verified in this workspace. The in-app rule checks are not submitted as Datadog external evaluations.

Use the displayed hexadecimal trace ID to correlate server logs and exported spans. The UI's **OTLP export configured** label reports configuration only, not successful receipt by a collector. With export disabled, no traces are sent externally.

## Optional legacy agent integration

The original agent endpoints are preserved but disabled by default. Set `ENABLE_AI_AGENT=true` to opt into Azure authentication and startup initialization; the storefront itself does not invoke these endpoints. The following guide applies only to that optional mode.

---

# Legacy agent development guide

This guide helps you set up a local development environment to test and modify the AI agents application. The web server runs locally; inference and agent storage still require a Microsoft Foundry project with a deployed model and a prompt agent. You can use an existing project or follow the [deployment guide](deployment.md).

## Prerequisites

- Python 3.10 or later (3.12+ recommended)
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), installed in the same environment where the Python server runs
- [Node.js](https://nodejs.org/) (v22.12 or later)
- [pnpm](https://pnpm.io/installation): `npm install -g pnpm@12.18.0`
- A Microsoft Foundry project, model deployment, and prompt agent (existing or created via `azd up`)

## Environment Setup

### 1. Python Environment

Create a [Python virtual environment](https://docs.python.org/3/tutorial/venv.html#creating-virtual-environments) and activate it:

**On Windows:**
```shell
python -m venv .venv
.venv\scripts\activate
```

**On Linux:**
```shell
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install Dependencies

From the repository root, install Python packages:

```shell
python -m pip install -r src/requirements.txt
# Alternatively, install the same dependencies as an editable package:
# python -m pip install -e src
```

### 3. Frontend Setup

From the repository root, build the React UI:

```shell
cd src/frontend
pnpm run setup
```

### 4. Environment Configuration

From the repository root, copy the template if `.env` does not already exist:

```shell
cp .env.example .env
az login
```

Edit `.env` and fill in:

| Variable | Value |
| --- | --- |
| `AZURE_EXISTING_AIPROJECT_ENDPOINT` | Project endpoint from Microsoft Foundry, such as `https://<account>.services.ai.azure.com/api/projects/<project>` |
| `AZURE_EXISTING_AGENT_ID` | Existing prompt agent name and version, e.g. `demo-assistant:1` (not a classic `asst_...` ID) |
| `AZURE_AI_AGENT_DEPLOYMENT_NAME` | Model deployment name in that project |
| `AZURE_EXISTING_AIPROJECT_RESOURCE_ID` | Optional full Azure resource ID, for the Foundry portal link |

`DefaultAzureCredential` uses your Azure CLI login. Your identity needs access to the project and agent (for example the Azure AI User role). No `OPENAI_API_KEY` or Azure OpenAI API key is used. For service principal authentication instead, uncomment and fill all three `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET` entries. The client secret is sensitive; `.env` is gitignored. Never put secrets in frontend `VITE_*` variables.

If startup reports `DefaultAzureCredential failed to retrieve a token` and `Azure CLI not found on path`, install Azure CLI and sign in from this same workspace:

```shell
az version
az login --use-device-code
```

Complete the browser/device-code sign-in yourself, then restart Uvicorn. The `AZURE_TENANT_ID` setting alone does not authenticate a service principal; that path requires all three tenant/client/secret settings. Messages about unavailable managed identity, workload identity, and PowerShell are fallback attempts in the credential chain; you do not need to configure every method.

Leave `WEB_APP_USERNAME` and `WEB_APP_PASSWORD` empty to disable HTTP Basic authentication locally, or set both to enable it. Tracing and Azure AI Search are disabled by default. The template includes optional search, storage, and embedding settings for agent creation.

Configuration order: existing process environment variables take precedence; otherwise the app loads the root `.env` when present, falling back to `.azure/<defaultEnvironment>/.env` from `azd`. Move the root `.env` aside when you want to use the azd configuration. `RUNNING_IN_PRODUCTION` should be unset locally.

If you do not have an agent yet, set `AZURE_AI_AGENT_NAME` and the project/model settings, then run `python gunicorn.conf.py` from `src`. This uploads sample files, creates an agent and configures continuous evaluation in Azure. When run directly, the script saves the resulting `name:version` to `AZURE_EXISTING_AGENT_ID` in the selected local `.env` file. Restart Uvicorn afterward so it reloads this value. If the variable was exported in your shell, unset it first because process variables take precedence over `.env`.

## Running the Development Server by CLI

### 1. Build Frontend

If you have changes in `src/frontend`, build the React application:

```shell
cd src/frontend
pnpm build
```

The build output will be placed in the `../api/static/react` directory, where the backend can serve it.

### 2. Test Agent Configuration (Optional)

If you have changes in `gunicorn.conf.py`, test the agent configuration:

```shell
cd src
python gunicorn.conf.py    
```

### 3. Start the Server

Run the local development server:

```shell
cd src
python -m uvicorn "api.main:create_app" --factory --reload
```

### 4. Access the Application

Click '<http://127.0.0.1:8000>' in the terminal, which should open a new tab in the browser. Enter your message in the box to test the agent.

## Debugging with VS Code

VS Code provides two debug configurations for easy debugging:

![VS Code Launch Profiles](images/vs_code_launch.png)

### Available Launch Profiles

1. **Debug: Initialize Agent (Gunicorn)** - Runs `gunicorn.conf.py` to test agent initialization and configuration
2. **Debug: FastAPI Server (Uvicorn)** - Runs the FastAPI server with hot-reload for API development

### How to Debug

1. Click on the **Run and Debug** icon in the VS Code left sidebar
2. Select the desired launch profile from the dropdown at the top
3. Click the green **Start Debugging** button
4. Set breakpoints in your code by clicking on the left margin of the editor

### Important: Debugging FastAPI with Existing Agent

When debugging the **FastAPI Server**, you **must** specify the `AZURE_EXISTING_AGENT_ID` environment variable in your selected `.env` file. This tells the application to use an existing agent instead of creating a new one.

Example:
```properties
AZURE_EXISTING_AGENT_ID="agent-template-assistant:1"
```

## Frontend Development and Customization

If you want to modify the frontend application, the key component to understand is `src/frontend/src/components/agents/AgentPreview.tsx`. This component handles:

- **Backend Communication**: Contains the main logic for calling the backend API endpoints
- **Message Handling**: Manages the flow of user messages and agent responses
- **UI State Management**: Controls the display of conversation history and loading states

### Key Areas for Customization

- **Agent Interaction Flow**: Modify how users interact with agents by updating the message handling logic in `AgentPreview.tsx`
- **UI Components**: Customize the chat interface, message bubbles, and response formatting
- **API Integration**: Extend or modify the backend communication patterns established in this component

### Development Workflow

1. Make changes to React components in `src/frontend/src/`
2. Run `pnpm build` to compile the frontend
3. The build output is automatically placed in `../api/static/react` for the backend to serve
4. Restart the local server to see your changes

Start with `AgentPreview.tsx` to understand how the frontend communicates with the backend and how messages are populated in the UI.

## Agent Instructions and Tools Customization

### Creating New Agents

To customize agent instructions or tools when creating **new agents**, modify the agent creation logic in `src/gunicorn.conf.py`:

- **Agent Instructions**: Update the `instructions` variable in the `create_agent()` function (around line 175)
- **Agent Tools**: Modify the `get_available_tool()` function to add or change tools available to the agent
- **Agent Model**: Change the model by updating the `AZURE_AI_AGENT_DEPLOYMENT_NAME` environment variable

### Modifying Existing Agents

**Important**: If you want to modify an **existing agent** that's already deployed, it's recommended to use the **Microsoft Foundry UI** instead of the script:

1. Go to your Microsoft Foundry project
2. Navigate to the Agents section
3. Select your agent
4. Update instructions, tools, or settings directly in the UI

This approach is safer for existing agents as it preserves the agent's conversation history and avoids potential conflicts with running instances.

## File Management and Agent Recreation

### Adding or Updating Files

If you want to add new files to the `src/files/` folder that your agent uses, **you must do this BEFORE agent creation**. The agent creation process in `src/gunicorn.conf.py` uploads these files to the vector store for OpenAI File Search and to blob storage so Azure AI Search can index them when enabled.

**Single source of truth:**
- Files in `src/files/` power both OpenAI File Search and Azure AI Search (when enabled).

### Important File Update Workflow

1. **Before Agent Creation**: Add or update files in `src/files/` directory
2. **Agent Creation**: Run the agent creation process (via local development or deployment)
3. **Files Embedded**: Files are uploaded to the vector store and indexed for Azure AI Search

### If You Need to Update Files After Agent Creation

If you've already created an agent and need to add or update files, you have two options:

#### Option 1: Delete and Recreate Agent (Recommended)
1. Go to your **Microsoft Foundry UI**
2. Navigate to the **Agents** section
3. **Delete the existing agent**
4. Update files in `src/files/` directory
5. **Restart your local development server** or **run `azd deploy`** again
6. The agent will be recreated with the updated files

#### Option 2: Force Recreation via Deployment
1. Update files in `src/files/` directory
2. Run `azd deploy` again
3. This will trigger the agent recreation process with updated files

### Why This is Necessary

- The agent creation script only processes files during the initial setup
- File embedding and search indexing happen once during agent initialization
- Existing agents don't automatically detect file changes
- The agent's vector store/search index needs to be rebuilt with new content

### Agent Behavior After Creation

**Important**: Once an agent has been created and is being used by the application, it operates in a **read-only mode** for file operations:

- **No File Upload**: The agent will NOT upload new files from the `src/files/` directory
- **No Vector Store Creation**: It will NOT create new vector stores for additional files
- **No Reindexing/Re-embedding**: It will NOT rebuild the vector store or Azure AI Search index for changed files
- **Uses Existing Resources**: The agent continues to use only the files, vector stores, and search indexes that were created during its initial setup

This means that any changes you make to files in `src/files/` after the agent is created will be completely ignored by the running agent. The agent initialization logic in `src/gunicorn.conf.py` only runs during the initial agent creation process, not during normal application operation.

**Best Practice**: Plan your file structure and content before creating agents to minimize the need for recreation.



### Agent version not found

A `ResourceNotFoundError` naming an agent and version means the configured project does not contain that version. A valid-looking `name:1` is not proof that the agent exists. Uvicorn loads an existing agent; provisioning the model alone does not initialize one for local use.

If the project and model settings are correct and you need to create the demo agent, stop Uvicorn and run from `src`:

```shell
python gunicorn.conf.py
python -m uvicorn "api.main:create_app" --factory --reload
```

The first command can create Azure resources: it uploads sample files, sets up a file-search vector store, creates the prompt agent, and attempts continuous evaluation setup. Its resulting agent ID is saved in the local `.env`. Existing agents are looked up first; authentication and permission failures are surfaced instead of being treated as a missing agent.
