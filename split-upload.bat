@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

if "%~1"=="" goto usage

:: 드래그된 인자 중 실제 존재하는 파일이 2개 이상이면 배치 모드
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
if exist "%IMGDIR%%IMGBASE%.meta.txt" goto runNoSlug

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

:: ── 배치 모드: 이미지 여러 장을 한 번에 드래그. 짝이 되는 .meta.txt 없는 파일은 건너뜀 ──
:batchMode
echo Batch mode: %FILECOUNT% files
echo.
for %%A in (%*) do (
  node pipeline\split-upload.mjs "%%~A" --skip-if-no-meta
  echo.
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
