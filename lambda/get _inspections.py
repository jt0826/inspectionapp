import json
import boto3

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
table_name = 'InspectionData'  # Replace with your table name
table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    try:
        # Log the incoming event for debugging
        print("Received event:", json.dumps(event))

        # Scan the DynamoDB table to retrieve all inspections
        response = table.scan()

        # Extract items from the response
        inspections = response.get('Items', [])

        # Return the inspections
        return {
            'statusCode': 200,
            'headers': {
        'Access-Control-Allow-Origin': 'http://localhost:3000', # Or your specific domain
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
        'Access-Control-Allow-Headers': 'Content-Type'
    },

            'body': json.dumps({'inspections': inspections})
            
        }

    except Exception as e:
        # Handle errors
        print("Error:", str(e))
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'Internal server error', 'error': str(e)})
        }