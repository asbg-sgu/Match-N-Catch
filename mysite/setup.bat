@echo off
REM Development setup script for Match & Catch Django Backend (Windows)

echo ===================================
echo Match ^& Catch - Django Backend Setup
echo ===================================

REM Check if virtual environment exists
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

REM Activate virtual environment
echo Activating virtual environment...
call .\.venv\Scripts\Activate.ps1

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Create .env if not exists
if not exist ".env" (
    echo Creating .env file from .env.example...
    copy .env.example .env
)

REM Run migrations
echo Running database migrations...
python manage.py makemigrations
python manage.py migrate

REM Initialize default event
echo Initializing default event...
python manage.py init_event

REM Create superuser (optional)
echo.
set /p CREATE_SUPERUSER="Do you want to create a superuser? (y/n): "
if /i "%CREATE_SUPERUSER%"=="y" (
    python manage.py createsuperuser
)

echo.
echo ===================================
echo Setup complete!
echo ===================================
echo.
echo To start the development server:
echo   python manage.py runserver
echo.
echo API will be available at:
echo   http://127.0.0.1:8000/
echo.
echo Django Admin:
echo   http://127.0.0.1:8000/admin/
echo.

pause
