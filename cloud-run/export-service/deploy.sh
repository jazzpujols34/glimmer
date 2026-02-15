#!/bin/bash
# Deploy Glimmer Export Service to Google Cloud Run

set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
REGION="${GCP_REGION:-asia-east1}"
SERVICE_NAME="glimmer-export"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "=== Building Docker image ==="
docker build -t ${IMAGE_NAME} .

echo "=== Pushing to Container Registry ==="
docker push ${IMAGE_NAME}

echo "=== Deploying to Cloud Run ==="
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME} \
    --platform managed \
    --region ${REGION} \
    --memory 2Gi \
    --cpu 2 \
    --timeout 600 \
    --concurrency 10 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars "R2_ACCOUNT_ID=${R2_ACCOUNT_ID}" \
    --set-env-vars "R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID}" \
    --set-env-vars "R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY}" \
    --set-env-vars "R2_BUCKET_NAME=${R2_BUCKET_NAME:-glimmer-videos}" \
    --allow-unauthenticated

echo "=== Deployment complete ==="
gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format "value(status.url)"
