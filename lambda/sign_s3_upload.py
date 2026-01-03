import json
import os
import uuid
import boto3
from datetime import datetime

# Configuration
BUCKET_NAME = 'testapp2608'  # placeholder specified
REGION = 'ap-southeast-1'
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Content-Type': 'application/json'
}

s3 = boto3.client('s3', region_name=REGION, aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'], aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'])


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
        ts = datetime.utcnow().isoformat().replace(':', '-').replace('.', '-')
        suffix = uuid.uuid4().hex[:8]
        # preserve extension if present
        ext = ''
        if '.' in filename:
            ext = '.' + filename.split('.')[-1]
        key = f"images/{inspection_id}/{venue_id}/{room_id}/{item_id}/{ts}-{suffix}{ext}"

        # Generate presigned PUT URL
        params = {
            'Bucket': BUCKET_NAME,
            'Key': key,
            'ContentType': content_type
        }
        url = s3.generate_presigned_url('put_object', Params=params, ExpiresIn=300)

        return build_response(200, { 'uploadUrl': url, 'key': key, 'expiresIn': 300 })

    except Exception as e:
        print('Error in sign_s3_upload:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e)})