import json
import os
import uuid
import boto3
from datetime import datetime, timezone, timedelta

# Config
BUCKET_NAME = 'inspectionappimages'
REGION = 'ap-southeast-1'
TABLE_NAME = 'InspectionImages'

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Content-Type': 'application/json'
}

s3 = boto3.client('s3', region_name=REGION)
dynamodb = boto3.resource('dynamodb')


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

        # Required metadata
        key = body.get('key')
        inspection_id = body.get('inspectionId')
        venue_id = body.get('venueId')
        room_id = body.get('roomId')
        item_id = body.get('itemId')
        filename = body.get('filename')
        content_type = body.get('contentType')
        filesize = int(body.get('filesize') or 0)
        uploaded_by = body.get('uploadedBy') or 'unknown'
        # Use local ISO (UTC+8) for consistent timestamps
        try:
            uploaded_at = body.get('uploadedAt') or datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=8))).isoformat()
        except Exception:
            uploaded_at = body.get('uploadedAt') or datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=8))).isoformat()

        if not key:
            return build_response(400, {'message': 'key is required'})

        # Optional: verify object exists in S3 and get its size
        try:
            head = s3.head_object(Bucket=BUCKET_NAME, Key=key)
            s3_size = head.get('ContentLength')
            s3_content_type = head.get('ContentType')
        except Exception as e:
            return build_response(400, {'message': 'Uploaded object not found in S3 (did upload succeed?)', 'error': str(e)})

        # Create a metadata record in DynamoDB
        table = dynamodb.Table(TABLE_NAME)
        image_id = str(uuid.uuid4())
        item = {
            'inspection_id': inspection_id,
            'room_id#item_id#image_id': "#".join([room_id, item_id, image_id]),
            'venue_id': venue_id,
            's3Key': key,
            'filename': filename,
            'contentType': s3_content_type or content_type,
            'filesize': int(s3_size),
            'uploadedBy': uploaded_by,
            'uploadedAt': uploaded_at
        }
        table.put_item(Item=item)

        # Do not return presigned GET URLs; retrieval must be via signed CloudFront URLs only
        return build_response(200, {'message': 'Registered', 'imageId': image_id, 'item': item})

    except Exception as e:
        print('Error in register_image:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e)})