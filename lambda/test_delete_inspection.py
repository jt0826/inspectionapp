import json
from delete_inspection import lambda_handler


def test_delete_inspection_cascade_no_images(monkeypatch):
    event = {'body': json.dumps({'inspection_id': 'insp1', 'cascade': True}), 'httpMethod': 'POST'}

    # Ensure no images found
    monkeypatch.setattr('delete_inspection._query_images_for_inspection', lambda nid: [])
    # Mock data_table.delete_item
    class MockTable:
        def delete_item(self, Key):
            return {'ResponseMetadata': {'HTTPStatusCode': 200}}
    monkeypatch.setattr('delete_inspection.data_table', MockTable())

    resp = lambda_handler(event, None)
    assert resp['statusCode'] == 200
    body = json.loads(resp['body'])
    assert body['summary']['deletedImages'] == 0
    assert body['summary']['inspectionDeleted'] is True


def test_delete_inspection_cascade_with_images(monkeypatch):
    event = {'body': json.dumps({'inspection_id': 'insp2', 'cascade': True}), 'httpMethod': 'POST'}

    # Fake images
    fake_items = [
        {'s3Key': 'path/to/one.jpg', 'room_id#item_id#image_id': 'room1#item1#img1'},
        {'s3Key': 'path/to/two.jpg', 'room_id#item_id#image_id': 'room1#item2#img2'},
    ]
    monkeypatch.setattr('delete_inspection._query_images_for_inspection', lambda nid: fake_items)

    # Mock _batch_delete_s3 to report both deleted
    monkeypatch.setattr('delete_inspection._batch_delete_s3', lambda keys: {'deleted': keys, 'failed': []})
    # Mock db delete to succeed
    monkeypatch.setattr('delete_inspection._delete_image_db_record', lambda inspection_id, sk: True)

    # Mock data_table
    class MockTable:
        def delete_item(self, Key):
            return {'ResponseMetadata': {'HTTPStatusCode': 200}}
    monkeypatch.setattr('delete_inspection.data_table', MockTable())

    resp = lambda_handler(event, None)
    assert resp['statusCode'] == 200
    body = json.loads(resp['body'])
    summary = body.get('summary')
    assert summary is not None
    assert summary['deletedImages'] == 2
    assert summary['inspectionDeleted'] is True
