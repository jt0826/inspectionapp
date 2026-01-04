import json
import os
import boto3
from boto3.dynamodb.conditions import Key

# Config
TABLE_NAME = 'InspectionImages'
BUCKET_NAME = 'testapp2608'
REGION = 'ap-southeast-1'

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
    'Content-Type': 'application/json'
}

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

        # Accept either POST body or query params (GET)
        params = {}
        if method == 'GET':
            params = event.get('queryStringParameters') or {}
        else:
            params = body

        inspection_id = params.get('inspectionId')
        room_id = params.get('roomId')
        item_id = params.get('itemId')  # optional

        if not all([inspection_id, room_id]):
            return build_response(400, {'message': 'inspectionId and roomId are required'})

        # Build sortKey prefix
        if item_id:
            prefix = f"{room_id}#{item_id}"
        else:
            prefix = f"{room_id}#"

        table = dynamodb.Table(TABLE_NAME)
        response = table.query(
            KeyConditionExpression=Key('inspection_id').eq(inspection_id) & Key('room_id#item_id#image_id').begins_with(prefix),
        )

        items = response.get('Items', [])
        images = []
        for it in items:
            sort_key = it.get('room_id#item_id#image_id')
            parts = sort_key.split('#') if sort_key else []
            item_id_value = parts[1] if len(parts) >= 2 else None
            image_id_value = parts[2] if len(parts) >= 3 else None
            images.append({
                's3Key': it.get('s3Key'),
                'filename': it.get('filename'),
                'contentType': it.get('contentType'),
                'filesize': str(it.get('filesize')),
                'uploadedBy': it.get('uploadedBy'),
                'uploadedAt': it.get('uploadedAt'),
                'itemId': item_id_value,
                'imageId': image_id_value,
                'publicUrl': f"https://{BUCKET_NAME}.s3.{REGION}.amazonaws.com/{it.get('s3Key')}"
            })

        return build_response(200, {'images': images})

    except Exception as e:
        print('Error in list_images_db:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e)})