import json
import os
import uuid
import boto3
from datetime import datetime, timezone, timedelta

# Configuration
BUCKET_NAME = 'inspectionappimages'  # placeholder specified
REGION = 'ap-southeast-1'
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,PUT,GET',
    'Content-Type': 'application/json, image/png'
}

s3 = boto3.client('s3')


def build_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body)
    }


def lambda_handler(event, context):
    method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method')
    if method == 'OPTIONS':
        return build_response(204, {})

    try:
        body = {}
        if event.get('body'):
            try:
                body = json.loads(event['body'])
            except Exception:
                body = event['body'] or {}

        # Required fields
        inspection_id = body.get('inspectionId')
        venue_id = body.get('venueId')
        room_id = body.get('roomId')
        item_id = body.get('itemId')
        filename = body.get('filename')
        content_type = body.get('contentType') or 'application/octet-stream'
        file_size = int(body.get('fileSize') or 0)
        uploaded_by = body.get('uploadedBy') or 'unknown'

        if not all([inspection_id, venue_id, room_id, item_id, filename]):
            return build_response(400, {'message': 'inspectionId, venueId, roomId, itemId, filename are required'})

        if file_size > MAX_FILE_SIZE:
            return build_response(400, {'message': 'File too large', 'maxBytes': MAX_FILE_SIZE})

        # Build key using ISO timestamp + uuid suffix
        ts = datetime.now(timezone(timedelta(hours=8))).isoformat().replace(':', '-').replace('.', '-')
        suffix = uuid.uuid4().hex[:8]
        # preserve extension if present
        ext = ''
        if '.' in filename:
            ext = '.' + filename.split('.')[-1]
        key = f"images/{inspection_id}/{venue_id}/{room_id}/{item_id}/{ts}-{suffix}{ext}"

        # Generate presigned POST (form) to avoid CORS preflight issues
        # Allow up to MAX_FILE_SIZE bytes via a content-length-range condition
        post = s3.generate_presigned_post(
            Bucket=BUCKET_NAME,
            Key=key,
            Fields={},
            Conditions=[['content-length-range', 1, MAX_FILE_SIZE]],
            ExpiresIn=300
        )

        # post contains { url, fields }
        return build_response(200, { 'post': post, 'key': key, 'expiresIn': 300 })

    except Exception as e:
        print('Error in sign_s3_upload:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e)})