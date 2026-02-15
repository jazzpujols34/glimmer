FROM python:3.11-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create temp directory for video processing
RUN mkdir -p /tmp/exports

# Run as non-root user for security
RUN useradd -m appuser && chown -R appuser:appuser /app /tmp/exports
USER appuser

# Cloud Run uses PORT env variable
ENV PORT=8080
EXPOSE 8080

CMD ["python", "main.py"]
