@echo off
setlocal EnableExtensions
chcp 65001 >nul
title 品宣物料工作台 - Windows 测试启动器

set "SOURCE_DIR=%~dp0"
set "LOCAL_DIR=%LOCALAPPDATA%\BrandMaterialWorkbench\preview"

echo [1/4] 检查 Windows 运行环境...
where node.exe >nul 2>&1
if errorlevel 1 goto :missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto :missing_node

if not exist "%LOCAL_DIR%" mkdir "%LOCAL_DIR%"
if errorlevel 1 goto :local_dir_failed

rem Stop the previous local preview before replacing its source files.
if exist "%LOCAL_DIR%\scripts\stop.mjs" (
  pushd "%LOCAL_DIR%" >nul
  node scripts\stop.mjs >nul 2>&1
  popd >nul
)

echo [2/4] 正在从共享盘同步到本机缓存...
robocopy "%SOURCE_DIR%." "%LOCAL_DIR%" /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP ^
  /XD node_modules dist .git "src-tauri\target" ^
  /XF .env "*.log" >nul
set "ROBOCOPY_EXIT=%ERRORLEVEL%"
if %ROBOCOPY_EXIT% GEQ 8 goto :copy_failed

pushd "%LOCAL_DIR%" >nul
if not exist package.json goto :invalid_project
if not exist package-lock.json goto :invalid_project

echo [3/4] 正在检查本机依赖，首次启动可能需要几分钟...
call npm.cmd install --prefer-offline --no-audit --no-fund
if errorlevel 1 goto :install_failed

echo [4/4] 正在启动工作台...
call npm.cmd start
if errorlevel 1 goto :start_failed

popd >nul
endlocal
exit /b 0

:missing_node
echo.
echo 未检测到 Node.js / npm。
echo 请先安装 Node.js LTS，重新打开本文件即可。
echo https://nodejs.org/
goto :failed

:local_dir_failed
echo.
echo 无法创建本机缓存目录：%LOCAL_DIR%
goto :failed

:copy_failed
echo.
echo 从共享盘复制项目失败（robocopy 错误码 %ROBOCOPY_EXIT%）。
echo 请检查共享盘连接和本机目录权限。
goto :failed

:invalid_project
echo.
echo 本机缓存中缺少 package.json 或 package-lock.json。
popd >nul
goto :failed

:install_failed
echo.
echo 依赖安装失败。请检查网络、npm 配置或权限。
popd >nul
goto :failed

:start_failed
echo.
echo 启动失败。可能是 5173 端口被其他程序占用。
echo 日志位置：%USERPROFILE%\.brand-material-workbench\server.log
popd >nul
goto :failed

:failed
echo.
pause
endlocal
exit /b 1
