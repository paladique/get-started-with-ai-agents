# Copyright (c) Microsoft. All rights reserved.
# Licensed under the MIT license. See LICENSE.md file in the project root for full license information.

import contextlib
import os

from azure.core.exceptions import ClientAuthenticationError, ResourceNotFoundError
from azure.ai.projects.aio import AIProjectClient
from azure.identity.aio import DefaultAzureCredential
from azure.ai.projects.telemetry import AIProjectInstrumentor

import fastapi
from fastapi.staticfiles import StaticFiles
from fastapi import Request
from fastapi.responses import JSONResponse
from util import load_app_environment

from logging_config import configure_logging

enable_trace = False
logger = None

@contextlib.asynccontextmanager
async def _application_lifespan(app: fastapi.FastAPI):
    # Catalog browsing is independent of the optional legacy Azure agent APIs.
    if os.getenv("ENABLE_AI_AGENT", "false").lower() != "true":
        app.state.ai_project = None
        app.state.agent_version_details = None
        logger.info("Storefront ready; Azure agent integration is disabled.")
        yield
        return
    agent_version_details = None
    proj_endpoint = os.environ.get("AZURE_EXISTING_AIPROJECT_ENDPOINT")
    agent_id = os.environ.get("AZURE_EXISTING_AGENT_ID")    
    missing = [name for name in (
        "AZURE_EXISTING_AIPROJECT_ENDPOINT",
        "AZURE_EXISTING_AGENT_ID",
        "AZURE_AI_AGENT_DEPLOYMENT_NAME",
    ) if not os.getenv(name, "").strip()]
    if missing:
        raise RuntimeError(
            "Missing required configuration: " + ", ".join(missing)
            + ". Fill in the repository .env (see .env.example)."
        )
    try:

        async with (
            DefaultAzureCredential() as credential,
            AIProjectClient(endpoint=proj_endpoint, credential=credential) as project_client,
        ):
            logger.info("Created AIProjectClient")

            if enable_trace:
                application_insights_connection_string = ""
                try:
                    application_insights_connection_string = await project_client.telemetry.get_application_insights_connection_string()
                except Exception as e:
                    e_string = str(e)
                    logger.error("Failed to get Application Insights connection string, error: %s", e_string)
                if not application_insights_connection_string:
                    logger.error("Application Insights was not enabled for this project.")
                    logger.error("Enable it via the 'Tracing' tab in your AI Foundry project page.")
                    exit()
                else:
                    from azure.monitor.opentelemetry import configure_azure_monitor
                    configure_azure_monitor(connection_string=application_insights_connection_string)
                    AIProjectInstrumentor().instrument(True)
                    app.state.application_insights_connection_string = application_insights_connection_string
                    logger.info("Configured Application Insights for tracing.")                        

            if agent_id:
                if agent_id.count(":") != 1:
                    message = "AZURE_EXISTING_AGENT_ID must be in the format 'agent_name:agent_version'."
                    message += f" (Environment from {env_file})"
                    raise RuntimeError(message)
                try: 
                    agent_name = agent_id.split(":")[0]
                    agent_version = agent_id.split(":")[1]
                    agent_version_details = await project_client.agents.get_version(agent_name, agent_version)
                    logger.info(f"Fetched agent, agent ID: {agent_version_details.id}")
                except ClientAuthenticationError as error:
                    raise RuntimeError(
                        "Azure authentication failed. For local development, install Azure CLI "
                        "and run 'az login --use-device-code' in this environment, or configure "
                        "AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET."
                    ) from error
                except ResourceNotFoundError as error:
                    raise RuntimeError(
                        "Agent version was not found in the configured project. Check "
                        "AZURE_EXISTING_AIPROJECT_ENDPOINT and AZURE_EXISTING_AGENT_ID "
                        "(agent_name:agent_version)."
                    ) from error

            if not agent_version_details:
                message = "No agent version was returned. Check AZURE_EXISTING_AGENT_ID or initialize an agent with gunicorn.conf.py."
                if env_file:
                    message += f" (Environment from {env_file})"
                raise RuntimeError(message)

            app.state.ai_project = project_client
            app.state.agent_version_details = agent_version_details
            yield

    except Exception as e:
        logger.error(f"Error during startup: {e}", exc_info=True)
        raise RuntimeError(f"Error during startup: {e}") from e

    finally:
        logger.info("Closed AIProjectClient")


@contextlib.asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    try:
        async with _application_lifespan(app):
            yield
    finally:
        # Deliver buffered observability spans on Uvicorn reload and Gunicorn shutdown.
        from .presentation import shutdown_tracing
        shutdown_tracing()


def create_app():
    
    global logger, env_file
    # Resolve local config consistently even when reload workers inherit old values.
    env_file = load_app_environment()
    logger = configure_logging(os.getenv("APP_LOG_FILE", ""))

    if env_file:
        logger.info(f"Loaded environment variables from {env_file}")
    else:
        logger.info("Loaded environment variables from default location")    
    

    logger.info("Live demo deployment: %s", os.getenv("AZURE_AI_AGENT_DEPLOYMENT_NAME", "<not configured>"))

    enable_trace_string = os.getenv("ENABLE_AZURE_MONITOR_TRACING", "")
    global enable_trace
    enable_trace = False
    if enable_trace_string == "":
        enable_trace = False
    else:
        enable_trace = str(enable_trace_string).lower() == "true"
    if enable_trace:
        logger.info("Azure Monitor tracing is enabled.")
        try:
            from azure.monitor.opentelemetry import configure_azure_monitor
        except ModuleNotFoundError:
            logger.error("Required libraries for tracing not installed.")
            logger.error("Please make sure azure-monitor-opentelemetry is installed.")
            exit()
    else:
        logger.info("Azure Monitor tracing is not enabled")

    directory = os.path.join(os.path.dirname(__file__), "static")
    app = fastapi.FastAPI(lifespan=lifespan)
    app.mount("/static", StaticFiles(directory=directory), name="static")
    
    # Mount React static files
    # Uncomment the following lines if you have a React frontend
    # react_directory = os.path.join(os.path.dirname(__file__), "static/react")
    # app.mount("/static/react", StaticFiles(directory=react_directory), name="react")

    from . import routes  # Import routes
    app.include_router(routes.router)
    from .presentation import router as presentation_router
    from fastapi import Depends
    dependencies = [Depends(routes.authenticate)] if routes.basic_auth else []
    app.include_router(presentation_router, dependencies=dependencies)

    # Global exception handler for any unhandled exceptions
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error("Unhandled exception occurred", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"}
        )
    
    return app
