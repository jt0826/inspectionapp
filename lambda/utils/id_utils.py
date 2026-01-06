import uuid
import re
from datetime import datetime, timezone, timedelta

# Utility helpers used by multiple lambdas: ID validation and S3 key generation.
# NOTE: ID generation should occur on the client (frontend). The server will validate IDs and no longer generate resource IDs.

def validate_id(id_value: str, expected_prefix: str):
    """Validate that `id_value` is a non-empty string starting with an acceptable prefix.

    Accepts prefixes like 'prefix_' or 'prefix-' and the single-letter shorthand 'p-' for backward compatibility.
    Returns (True, 'ok') on success or (False, 'error message') on failure.
    """
    if not id_value or not isinstance(id_value, str):
        return False, 'id must be a non-empty string'
    allowed_prefixes = (f"{expected_prefix}_", f"{expected_prefix}-", f"{expected_prefix[0]}-")
    if not any(id_value.startswith(p) for p in allowed_prefixes):
        return False, f"id must start with one of: {', '.join(allowed_prefixes)}"
    # allow alphanumeric, underscore, hyphen only
    if not re.match(r'^[A-Za-z0-9_-]+$', id_value):
        return False, 'id contains invalid characters'
    if len(id_value) < 6 or len(id_value) > 250:
        return False, 'id length out of range'
    return True, 'ok'


def _now_ts_for_key():
    # local ISO with +08:00, but sanitized for file names
    ts = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=8))).isoformat()
    return ts.replace(':', '-').replace('.', '-')


def generate_s3_key(inspection_id: str, venue_id: str, room_id: str, item_id: str, filename: str) -> str:
    # Standardized key: images/{inspectionId}/{venueId}/{roomId}/{itemId}/{timestamp}-{shortuuid}{ext}
    ts = _now_ts_for_key()
    suffix = uuid.uuid4().hex[:8]
    ext = ''
    if filename and '.' in filename:
        ext = '.' + filename.split('.')[-1]
    return f"images/{inspection_id}/{venue_id}/{room_id}/{item_id}/{ts}-{suffix}{ext}"


def s3_prefix_for_inspection(inspection_id: str) -> str:
    return f"images/{inspection_id}/"
