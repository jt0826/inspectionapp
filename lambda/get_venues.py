import json
import boto3

# Replace with your DynamoDB table name that stores venues
TABLE_NAME = 'Venues'

# CORS settings - set Access-Control-Allow-Origin to your frontend origin in production
CORS_HEADERS = {
    'Access-Control-Allow-Origin': 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Content-Type': 'application/json'
}


dynamodb = boto3.resource('dynamodb')


def build_response(status_code, body_dict):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body_dict)
    }


def lambda_handler(event, context):
    # Handle preflight
    method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method')
    if method == 'OPTIONS':
        return build_response(204, {})

    try:
        table = dynamodb.Table(TABLE_NAME)

        # Scan the table - for production, consider pagination / query patterns
        resp = table.scan()
        items = resp.get('Items', [])

        # If pagination: gather more pages (simple loop)
        while 'LastEvaluatedKey' in resp:
            resp = table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'])
            items.extend(resp.get('Items', []))

        # Return venues as array in body
        return build_response(200, {'venues': items})

    except Exception as e:
        print('Error fetching venues:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e)})