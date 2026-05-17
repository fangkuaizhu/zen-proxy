@echo off
REM Zen Proxy 启动脚本 — 双击运行或放入开机启动
cd /d "%~dp0"
echo [Zen Proxy] 启动中...
node server.js
pause
