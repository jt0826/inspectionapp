import json
import boto3
from datetime import datetime, timezone, timedelta

def _now_local_iso():
    return datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=8))).isoformat()

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
