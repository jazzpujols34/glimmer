"""
Export status store backed by Firestore.
Replaces the in-memory dict that loses state across instances.

Collection: export_status
Document ID: export_id
Fields: status, progress, message, output_url, error, created_at, updated_at
TTL: Documents auto-expire via Firestore TTL policy (set on 'expires_at' field)
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from google.cloud import firestore

# Initialize once at module level — reuses connection across requests
_db: Optional[firestore.Client] = None
COLLECTION = "export_status"
TTL_HOURS = 2  # Status records expire after 2 hours


def _get_db() -> firestore.Client:
    global _db
    if _db is None:
        project = os.environ.get("GCP_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
        _db = firestore.Client(project=project)
    return _db


def set_status(export_id: str, status_data: dict) -> None:
    """Write or update export status."""
    db = _get_db()
    doc_ref = db.collection(COLLECTION).document(export_id)

    # Add metadata
    now = datetime.now(timezone.utc)
    status_data["updated_at"] = now.isoformat()
    if "created_at" not in status_data:
        status_data["created_at"] = now.isoformat()
    # TTL field for Firestore auto-deletion
    status_data["expires_at"] = now + timedelta(hours=TTL_HOURS)

    doc_ref.set(status_data, merge=True)


def get_status(export_id: str) -> Optional[dict]:
    """Read export status. Returns None if not found."""
    db = _get_db()
    doc = db.collection(COLLECTION).document(export_id).get()
    if doc.exists:
        data = doc.to_dict()
        # Remove internal fields before returning
        data.pop("expires_at", None)
        return data
    return None


def delete_status(export_id: str) -> None:
    """Delete export status (cleanup after download)."""
    db = _get_db()
    db.collection(COLLECTION).document(export_id).delete()
