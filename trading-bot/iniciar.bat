@echo off
cd /d %~dp0
if not exist .venv (python -m venv .venv && .venv\Scripts\pip install -r requirements.txt)
if not exist .env copy .env.example .env
start "" http://127.0.0.1:8765
.venv\Scripts\python -m bot ui
pause
