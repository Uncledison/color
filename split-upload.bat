@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

if "%~1"=="" goto usage

rem Count how many dragged arguments are actual existing files.
rem If 2 or more, treat this as a batch (multi-image) run.
set "FILECOUNT=0"
for %%A in (%*) do (
  if exist "%%~A" set /a FILECOUNT+=1
)
if %FILECOUNT% GTR 1 goto batchMode

set "IMG=%~1"
set "SLUG=%~2"
set "MARGIN=%~3"

if not "%SLUG%"=="" goto runWithSlug

for %%F in ("%IMG%") do set "IMGDIR=%%~dpF"
for %%F in ("%IMG%") do set "IMGBASE=%%~nF"
rem "tiger.meta.jpg" should match "tiger.meta.txt" too, same as the node script.
set "IMGBASE_NOMETA=%IMGBASE%"
if /I "%IMGBASE:~-5%"==".meta" set "IMGBASE_NOMETA=%IMGBASE:~0,-5%"
if exist "%IMGDIR%%IMGBASE_NOMETA%.meta.txt" goto runNoSlug

set /p SLUG=Enter series slug - English, numbers, hyphen only, e.g. konggi:
goto runWithSlug

:runNoSlug
if "%MARGIN%"=="" goto runNoSlugNoMargin
node pipeline\split-upload.mjs "%IMG%" --margin=%MARGIN%
goto done
:runNoSlugNoMargin
node pipeline\split-upload.mjs "%IMG%"
goto done

:runWithSlug
if "%MARGIN%"=="" goto runWithSlugNoMargin
node pipeline\split-upload.mjs "%IMG%" "%SLUG%" --margin=%MARGIN%
goto done
:runWithSlugNoMargin
node pipeline\split-upload.mjs "%IMG%" "%SLUG%"
goto done

:done
echo.
pause
exit /b 0

rem Batch mode: multiple images dragged at once.
rem Images without a matching .meta.txt sidecar are skipped, not fatal.
:batchMode
echo Batch mode: %FILECOUNT% files
echo.
for %%A in (%*) do (
  if exist "%%~A" (
    node pipeline\split-upload.mjs "%%~A" --skip-if-no-meta
    echo.
  )
)
goto done

:usage
echo Usage: split-upload.bat image_path [slug] [margin]
echo   or drag-and-drop an image file onto this bat file.
echo   If image.meta.txt sits next to the image, slug/Notion row are automatic.
echo   Drag multiple images at once for batch mode - images without a matching
echo   .meta.txt are skipped automatically instead of stopping the batch.
echo.
pause
exit /b 1
