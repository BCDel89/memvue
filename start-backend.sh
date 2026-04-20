#!/bin/bash
cd "$(dirname "$0")/backend"
source .venv/bin/activate
exec uvicorn main:app --port 7700
