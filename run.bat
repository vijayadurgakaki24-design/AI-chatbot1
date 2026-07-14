@echo off
cd /d "%~dp0"
title Python Chatbot Launcher
echo ==================================================
echo Installing dependencies from backend/requirements.txt...
echo ==================================================
cd backend
pip install -r requirements.txt
echo.
echo ==================================================
echo Starting Flask Server on Port 8080...
echo ==================================================
python app.py
pause
