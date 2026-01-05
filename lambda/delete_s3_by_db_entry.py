import json
import os
import boto3
from boto3.dynamodb.conditions import Key, Attr

# Config
TABLE_NAME = 'InspectionImages'
BUCKET_NAME = 'inspectionappimages'
REGION = 'ap-southeast-1'

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Content-Type': 'application/json'
}

s3 = boto3.client('s3', region_name=REGION)
dynamodb = boto3.resource('dynamodb', region_name=REGION)


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

        inspection_id = body.get('inspectionId')
        room_id = body.get('roomId')
        item_id = body.get('itemId')
        image_id = body.get('imageId')
        s3_key_param = body.get('s3Key')

        if not inspection_id or not room_id or not item_id or (not image_id and not s3_key_param):
            return build_response(400, {'message': 'inspectionId, roomId, itemId and (imageId or s3Key) are required'})

        table = dynamodb.Table(TABLE_NAME)
        s3_key = None
        found_sort_key = None

        if image_id:
            sort_key = f"{room_id}#{item_id}#{image_id}"
            resp = table.get_item(Key={'inspection_id': inspection_id, 'room_id#item_id#image_id': sort_key})
            item = resp.get('Item')
            if not item:
                return build_response(404, {'message': 'Image metadata not found'})
            s3_key = item.get('s3Key')
            found_sort_key = sort_key
            if not s3_key:
                return build_response(400, {'message': 's3Key missing in metadata'})
        else:
            # try to find the DB entry by s3Key
            try:
                resp = table.query(KeyConditionExpression=Key('inspection_id').eq(inspection_id), FilterExpression=Attr('s3Key').eq(s3_key_param))
                items = resp.get('Items') or []
                if len(items) > 0:
                    item = items[0]
                    s3_key = item.get('s3Key')
                    found_sort_key = item.get('room_id#item_id#image_id')
                else:
                    # fall back to deleting provided s3Key directly
                    s3_key = s3_key_param
            except Exception as e:
                print('Error querying DB for s3Key:', e)
                return build_response(500, {'message': 'DB query failed', 'error': str(e)})

        # Delete object
        try:
            s3.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
        except Exception as e:
            print('Error deleting S3 object:', e)
            return build_response(500, {'message': 'Failed to delete object from S3', 'error': str(e)})

        return build_response(200, {'message': 'Deleted from S3', 's3Key': s3_key, 'sortKey': found_sort_key})

    except Exception as e:
        print('Error in delete_s3_by_db_entry:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e)})