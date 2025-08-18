# Use a small, stable Python image
FROM python:3.11-slim

# Prevent Python from buffering stdout/stderr (useful for logs)
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies needed to build some Python packages (kept minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install -r requirements.txt
# Ensure gunicorn is available even if not in requirements.txt
RUN pip install gunicorn

# Copy application source
COPY . .

# Create a non-root user and set ownership
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

# Expose the port the app runs on
EXPOSE 5000

# Start the app with gunicorn. The Flask app object is `app` in app.py.
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
