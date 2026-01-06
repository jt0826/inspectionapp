import json
import os
import boto3
from boto3.dynamodb.conditions import Key, Attr

# Config
TABLE_NAME = 'InspectionImages'
REGION = 'ap-southeast-1'

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Content-Type': 'application/json'
}

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

        # If we have a precise image_id, delete by sort key
        if image_id:
            sort_key = f"{room_id}#{item_id}#{image_id}"
            try:
                table.delete_item(Key={'inspectionId': inspection_id, 'roomId#itemId#imageId': sort_key})
            except Exception as e:
                print('Error deleting DB item:', e)
                return build_response(500, {'message': 'Failed to delete DB record', 'error': str(e)})
            return build_response(200, {'message': 'Deleted DB record', 'sortKey': sort_key})

        # Otherwise, try to find record(s) by s3Key and delete them
        try:
            resp = table.query(KeyConditionExpression=Key('inspectionId').eq(inspection_id), FilterExpression=Attr('s3Key').eq(s3_key_param))
            items = resp.get('Items') or []
            if len(items) == 0:
                return build_response(404, {'message': 'No matching DB record found for provided s3Key'})
            deleted = []
            for it in items:
                sk = it.get('room_id#item_id#image_id')
                try:
                    table.delete_item(Key={'inspectionId': inspection_id, 'room_id#item_id#image_id': sk})
                    deleted.append(sk)
                except Exception as e:
                    print('Error deleting DB item:', e)
                    return build_response(500, {'message': 'Failed to delete DB record', 'error': str(e)})
            return build_response(200, {'message': 'Deleted DB records', 'deleted': deleted})
        except Exception as e:
            print('Error querying DB for s3Key:', e)
            return build_response(500, {'message': 'DB query failed', 'error': str(e)})

    except Exception as e:
        print('Error in delete_image_db:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e)})