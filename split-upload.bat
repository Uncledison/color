@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

if "%~1"=="" goto usage

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

:usage
echo Usage: split-upload.bat image_path [slug] [margin]
echo   or drag-and-drop an image file onto this bat file.
echo   If image.meta.txt sits next to the image, slug/Notion row are automatic.
echo.
pause
exit /b 1
