FROM python:3.11-slim

WORKDIR /app

# Install system deps for chromadb/sentence-transformers
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code (transcripts included for auto-indexing on first boot)
COPY . .

# Create data directories
RUN mkdir -p data charts

# Make startup script executable
RUN chmod +x start.sh

# Expose Streamlit port
EXPOSE 8501

HEALTHCHECK CMD curl --fail http://localhost:8501/_stcore/health || exit 1

# Start: auto-index knowledge base if needed, then run Streamlit
CMD ["./start.sh"]
