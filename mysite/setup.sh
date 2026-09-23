#!/bin/bash
# Development setup script for Match & Catch Django Backend

echo "==================================="
echo "Match & Catch - Django Backend Setup"
echo "==================================="

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python -m venv .venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source .venv/bin/activate || .venv/Scripts/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Create .env if not exists
if [ ! -f ".env" ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
fi

# Run migrations
echo "Running database migrations..."
python manage.py makemigrations
python manage.py migrate

# Initialize default event
echo "Initializing default event..."
python manage.py init_event

# Create superuser (optional)
echo ""
read -p "Do you want to create a superuser? (y/n): " CREATE_SUPERUSER
if [ "$CREATE_SUPERUSER" = "y" ]; then
    python manage.py createsuperuser
fi

echo ""
echo "==================================="
echo "Setup complete!"
echo "==================================="
echo ""
echo "To start the development server:"
echo "  python manage.py runserver"
echo ""
echo "API will be available at:"
echo "  http://127.0.0.1:8000/"
echo ""
echo "Django Admin:"
echo "  http://127.0.0.1:8000/admin/"
echo ""
